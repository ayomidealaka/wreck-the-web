#!/usr/bin/env bash
#
# Wreck the Web: build, verify and deploy to Kubernetes.
#
# Images are tagged with the git SHA and the rollout pins that exact tag, so `rollback` is a real operation rather
# than a rebuild-and-hope. Defaults are ours; for your own cluster and registry (see deploy/README.md):
#   IMAGE=<your-registry>/<you>/wreck-the-web HOST=wreck.example.com ./deploy/deploy.sh deploy
# (HOST only changes the live check at the end; the hostname itself is in ingress.yaml.)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

IMAGE="${IMAGE:-ghcr.io/ayomidealaka/wreck-the-web}"
NAMESPACE="${NAMESPACE:-wreck-the-web}"
DEPLOYMENT="wreck-the-web"
HOST="${HOST:-wreck-the-web.retrodeep.app}"
PULL_SECRET="${PULL_SECRET-ghcr-secret}"   # the image pull secret deployment.yaml names; set it empty for a public image
# the image line as written in deployment.yaml; apply swaps in IMAGE:tag, so a first deploy never pulls anything else
MANIFEST_IMAGE="ghcr.io/ayomidealaka/wreck-the-web:latest"   # keep in step with deployment.yaml

# The architecture the cluster runs, checked against the live node in preflight. An image built for the wrong one
# still deploys and serves, just through QEMU at a fraction of the speed, with no error anywhere.
TARGET_PLATFORM="${TARGET_PLATFORM:-linux/amd64}"

# ---------------------------------------------------------------- helpers ---

c_red=$'\033[31m'; c_grn=$'\033[32m'; c_ylw=$'\033[33m'; c_dim=$'\033[90m'; c_off=$'\033[0m'
info() { printf '%s==>%s %s\n' "$c_grn" "$c_off" "$*"; }
warn() { printf '%s warn%s %s\n' "$c_ylw" "$c_off" "$*"; }
die()  { printf '%serror%s %s\n' "$c_red" "$c_off" "$*" >&2; exit 1; }
step() { printf '\n%s─── %s %s\n' "$c_dim" "$*" "$c_off"; }

git_tag() {
  local sha dirty=""
  sha=$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null) || die "not a git repo"
  [ -n "$(git -C "$REPO_ROOT" status --porcelain 2>/dev/null)" ] && dirty="-dirty"
  printf '%s%s' "$sha" "$dirty"
}

# --------------------------------------------------------------- preflight ---

preflight() {
  step "Preflight"
  command -v docker  >/dev/null || die "docker not found"
  command -v kubectl >/dev/null || die "kubectl not found"
  docker info >/dev/null 2>&1   || die "docker daemon not running"

  local ctx
  ctx=$(kubectl config current-context 2>/dev/null) || die "no kubectl context"
  info "kube context: ${ctx}"
  kubectl get ns "$NAMESPACE" >/dev/null 2>&1 || warn "namespace '$NAMESPACE' does not exist yet (will be created)"

  # imagePullSecrets are namespace-scoped; a missing one shows up as an ImagePullBackOff minutes into the rollout.
  # A public image needs none: run with PULL_SECRET= and delete imagePullSecrets from deployment.yaml.
  if [ -n "$PULL_SECRET" ] && ! kubectl get secret "$PULL_SECRET" -n "$NAMESPACE" >/dev/null 2>&1; then
    die "pull secret '$PULL_SECRET' missing in namespace '$NAMESPACE'. Create the namespace and the secret with:
       kubectl apply -f ${SCRIPT_DIR}/namespace.yaml
       kubectl create secret docker-registry $PULL_SECRET \\
         --docker-server=<your-registry> \\
         --docker-username=<user> \\
         --docker-password=<token-with-read-access> \\
         -n $NAMESPACE
     or, for a public image, re-run with PULL_SECRET= (and remove imagePullSecrets from deployment.yaml)"
  fi

  local node_arch
  node_arch=$(kubectl get nodes -o jsonpath='{.items[0].status.nodeInfo.architecture}' 2>/dev/null || true)
  if [ -n "$node_arch" ] && [ "$TARGET_PLATFORM" != "linux/${node_arch}" ]; then
    die "cluster nodes are ${node_arch} but TARGET_PLATFORM is ${TARGET_PLATFORM}."
  fi
  info "target platform: ${TARGET_PLATFORM} (node reports ${node_arch:-unknown})"
  info "preflight OK"
}

# ------------------------------------------------------------------- build ---

build() {
  local tag="$1"
  step "Build ${IMAGE}:${tag}"
  DOCKER_BUILDKIT=1 docker build \
    --platform "$TARGET_PLATFORM" \
    -t "${IMAGE}:${tag}" -t "${IMAGE}:latest" \
    -f "${SCRIPT_DIR}/Dockerfile" \
    "$REPO_ROOT"
  info "built ${IMAGE}:${tag} ($(docker images "${IMAGE}:${tag}" --format '{{.Size}}'))"
}

# ------------------------------------------------------------------- smoke ---
# Run the image the way Kubernetes will (non-root, read-only root, only /tmp writable, no capabilities) and assert
# it serves the game and can actually render a website in its Chromium.

SMOKE_CONTAINER=""
# shellcheck disable=SC2317
cleanup_smoke() { [ -n "${SMOKE_CONTAINER}" ] && docker rm -f "${SMOKE_CONTAINER}" >/dev/null 2>&1 || true; }
trap cleanup_smoke EXIT

smoke() {
  local tag="$1" name="wreck-the-web-smoke-$$" port=4699
  step "Smoke test ${IMAGE}:${tag}"
  docker rm -f "$name" >/dev/null 2>&1 || true
  SMOKE_CONTAINER="$name"
  docker run -d --name "$name" --platform "$TARGET_PLATFORM" -p "127.0.0.1:${port}:4600" \
    --read-only --tmpfs /tmp:rw,size=1g --cap-drop ALL --security-opt no-new-privileges \
    -e CHROME_NO_SANDBOX="${CHROME_NO_SANDBOX:-1}" "${IMAGE}:${tag}" >/dev/null

  local code="000" i
  for i in $(seq 1 30); do
    code=$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:${port}/healthz" --max-time 4 2>/dev/null) || code=000
    [ "$code" = "200" ] && break
    sleep 1
  done
  [ "$code" = "200" ] || { docker logs "$name" 2>&1 | tail -30; die "server never came up (last status: $code)"; }
  info "health              200"

  case "$(curl -sS "http://127.0.0.1:${port}/" --max-time 10 2>/dev/null || true)" in
    *"<title>Wreck the Web"*) info "game page           200" ;;
    *) docker logs "$name" 2>&1 | tail -30; die "the game page did not come back" ;;
  esac

  # a real render through Chromium (under emulation on a non-amd64 machine, so it gets a while)
  local level
  level=$(curl -sS "http://127.0.0.1:${port}/play/level?url=example.com&w=1280&h=800&dpr=1" --max-time 120 2>/dev/null || true)
  case "$level" in
    *'"letters":['*) info "render example.com  ok" ;;
    *) printf '%s\n' "$level"; docker logs "$name" 2>&1 | tail -30; die "Chromium could not render a website" ;;
  esac
  info "smoke test passed"
}

# -------------------------------------------------------------------- push ---

push() {
  local tag="$1"
  step "Push ${IMAGE}:${tag}"
  docker push "${IMAGE}:${tag}"
  docker push "${IMAGE}:latest"
}

# ------------------------------------------------------------------ apply ---

apply_manifests() {
  local tag="$1"
  step "Apply manifests"
  kubectl kustomize "$SCRIPT_DIR" | sed "s#image: ${MANIFEST_IMAGE}#image: ${IMAGE}:${tag}#" | kubectl apply -f -
}

rollout() {
  local tag="$1"
  step "Roll out ${tag}"
  kubectl set image "deployment/${DEPLOYMENT}" "web=${IMAGE}:${tag}" -n "$NAMESPACE"
  kubectl annotate "deployment/${DEPLOYMENT}" -n "$NAMESPACE" \
    "kubernetes.io/change-cause=deploy ${tag} at $(date -u +%Y-%m-%dT%H:%M:%SZ)" --overwrite >/dev/null
  if ! kubectl rollout status "deployment/${DEPLOYMENT}" -n "$NAMESPACE" --timeout=240s; then
    warn "rollout failed, rolling back"
    kubectl rollout undo "deployment/${DEPLOYMENT}" -n "$NAMESPACE"
    kubectl rollout status "deployment/${DEPLOYMENT}" -n "$NAMESPACE" --timeout=120s || true
    die "deploy failed and was rolled back"
  fi
}

verify_live() {
  step "Verify https://${HOST}"
  local code
  code=$(curl -sS -o /dev/null -w '%{http_code}' "https://${HOST}/healthz" --max-time 25 2>/dev/null) || code=000
  if [ "$code" = "200" ]; then
    info "https://${HOST} → 200"
  else
    warn "https://${HOST} → ${code}. On a first deploy cert-manager may still be issuing the certificate:"
    printf '     kubectl get certificate -n %s\n' "$NAMESPACE"
  fi
}

# --------------------------------------------------------------- commands ---

cmd_deploy() {
  local tag
  tag=$(git_tag)
  case "$tag" in
    *-dirty)
      [ "${ALLOW_DIRTY:-0}" = "1" ] || die "working tree is dirty: the deployed tag would not match any commit.
     Commit first, or re-run with: ALLOW_DIRTY=1 $0 deploy"
      warn "deploying a dirty tree as ${tag}" ;;
  esac
  preflight
  build "$tag"
  smoke "$tag"
  push "$tag"
  apply_manifests "$tag"
  rollout "$tag"
  verify_live
  printf '\n%s==>%s Deployed %s to https://%s\n' "$c_grn" "$c_off" "$tag" "$HOST"
}

cmd_build() { build "$(git_tag)"; }
cmd_smoke() { local t; t=$(git_tag); build "$t"; smoke "$t"; }

cmd_status() {
  step "Status"
  kubectl get deploy,pod,svc,ingress,networkpolicy -n "$NAMESPACE" 2>/dev/null || true
  printf '\n--- certificate ---\n'
  kubectl get certificate -n "$NAMESPACE" 2>/dev/null || true
  printf '\n--- running image ---\n'
  kubectl get "deployment/${DEPLOYMENT}" -n "$NAMESPACE" -o jsonpath='{.spec.template.spec.containers[0].image}{"\n"}' 2>/dev/null || true
  printf '\n--- history ---\n'
  kubectl rollout history "deployment/${DEPLOYMENT}" -n "$NAMESPACE" 2>/dev/null || true
}

cmd_logs() { kubectl logs -n "$NAMESPACE" -l app.kubernetes.io/name="$DEPLOYMENT" --tail="${2:-100}" -f; }

cmd_rollback() {
  step "Rollback"
  kubectl rollout undo "deployment/${DEPLOYMENT}" -n "$NAMESPACE" ${2:+--to-revision="$2"}
  kubectl rollout status "deployment/${DEPLOYMENT}" -n "$NAMESPACE" --timeout=180s
  cmd_status
}

usage() {
  cat <<EOF
Wreck the Web: deploy

Usage: $0 <command>

  deploy            Preflight → build → smoke test → push → apply → rollout → verify
  build             Build the image only
  smoke             Build, then run the image locally and assert it serves and renders
  status            Deployment, pods, ingress, network policy, certificate, running image
  logs [lines]      Tail the server's logs
  rollback [rev]    Roll back to the previous revision (or a specific one)

Environment:
  ALLOW_DIRTY=1     Permit deploying from a dirty working tree
  IMAGE             Your image, without a tag (default: ours, which is private)
  HOST              Your hostname, for the live check (the ingress itself is in ingress.yaml)
  PULL_SECRET       Name of the image pull secret (default ghcr-secret; empty for a public image)
  NAMESPACE, TARGET_PLATFORM
EOF
  exit 1
}

case "${1:-help}" in
  deploy)   cmd_deploy ;;
  build)    cmd_build ;;
  smoke)    cmd_smoke ;;
  status)   cmd_status ;;
  logs)     cmd_logs "$@" ;;
  rollback) cmd_rollback "$@" ;;
  *)        usage ;;
esac
