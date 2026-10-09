# Deploying Wreck the Web

Everything needed to run your own Wreck the Web on Kubernetes: a Dockerfile for the server and the Chromium it
renders websites with, the manifests, and `deploy.sh`, which builds, tests, pushes and rolls it out.

You build the image yourself and push it to **your own registry**. Ours (`ghcr.io/ayomidealaka/wreck-the-web`) is
private and only used for our deployment (see the end of this page).

- [What you need](#what-you-need)
- [Deploy your own, step by step](#deploy-your-own-step-by-step)
- [Check it before you go public](#check-it-before-you-go-public)
- [Why the network policy matters](#why-the-network-policy-matters)
- [Settings](#settings)
- [Chrome's sandbox](#chromes-sandbox)
- [Client addresses and rate limiting](#client-addresses-and-rate-limiting)
- [Running it without Kubernetes](#running-it-without-kubernetes)
- [Updating, rolling back, logs](#updating-rolling-back-logs)
- [Troubleshooting](#troubleshooting)
- [Our deployment](#our-deployment)

## What you need

- A Kubernetes cluster whose network plugin **enforces NetworkPolicy, including egress `ipBlock` with `except`**.
  k3s (its built-in policy controller), Calico and Cilium do. Flannel on its own does not, and without it you
  shouldn't put this on the internet (see [why](#why-the-network-policy-matters)).
- An ingress controller. The manifests use ingress-nginx; others work with the edits below.
- cert-manager with a ClusterIssuer, for HTTPS (or your own TLS secret).
- A container registry you can push to: GHCR, Docker Hub, your cloud's registry, anything.
- Docker with buildx to build the image, `kubectl`, and a domain pointing at your ingress.
- One node with about 2 GB of memory and a couple of CPUs to spare. The image is `linux/amd64` by default.

## Deploy your own, step by step

### 1. Point the files at your setup

All the hostnames, issuers and names are in four files:

| File | Change |
| --- | --- |
| `ingress.yaml` | the hostname (twice: `tls.hosts` and `rules.host`), `cert-manager.io/cluster-issuer`, `ingressClassName`. Remove the `nginx.ingress.kubernetes.io/*` annotations if you don't use ingress-nginx, and give your controller a read timeout of about 120s instead: a render can take a while. |
| `networkpolicy.yaml` | if your ingress controller doesn't run in a namespace called `ingress-nginx`, change the `ingress` rule to select it. If cluster DNS isn't pods labelled `k8s-app: kube-dns` in `kube-system`, change the DNS rule. |
| `deployment.yaml` | `imagePullSecrets`: keep `ghcr-secret` as the name of your pull secret, rename it, or delete it if your image is public. `RATE_LIMIT_PER_MIN` and `TRUST_PROXY`: see [client addresses](#client-addresses-and-rate-limiting). |
| `namespace.yaml` | only if you want another namespace (then change `namespace:` in every file, or set it in `kustomization.yaml`). |

The image name in `deployment.yaml` doesn't matter: `deploy.sh` replaces it with yours.

### 2. A pull secret for your registry (skip for a public image)

```sh
kubectl apply -f deploy/namespace.yaml
kubectl create secret docker-registry ghcr-secret \
  --docker-server=<your-registry, e.g. ghcr.io> \
  --docker-username=<user> \
  --docker-password=<token with read access to packages> \
  -n wreck-the-web
```

### 3. Log in to your registry and deploy

```sh
docker login <your-registry>
IMAGE=<your-registry>/<you>/wreck-the-web HOST=<your-hostname> ./deploy/deploy.sh deploy
```

That checks the cluster, builds the image for the node's architecture, runs it locally the way the cluster will and
renders a real website in it, pushes it, applies the manifests with your image, waits for the rollout (rolling back
if it fails), then checks `https://<your-hostname>/healthz`.

Set `PULL_SECRET=` (empty) if your image is public, or `PULL_SECRET=<name>` if you named the secret differently.
On a machine of another architecture (Apple Silicon, say) the build and smoke test run under emulation and take
several minutes; that's expected. If your nodes are arm64, set `TARGET_PLATFORM=linux/arm64`.

Without the script:

```sh
docker build --platform linux/amd64 -f deploy/Dockerfile -t <your-image>:<tag> .
docker push <your-image>:<tag>
kubectl kustomize deploy/ | sed 's#image: ghcr.io/ayomidealaka/wreck-the-web:latest#image: <your-image>:<tag>#' | kubectl apply -f -
```

## Check it before you go public

```sh
NS=wreck-the-web
# the public web is reachable
kubectl -n $NS exec deploy/wreck-the-web -- node -e "fetch('https://example.com').then(r => console.log('public web:', r.status))"
# the cluster isn't: this must print "blocked". If it prints "REACHABLE", the network policy isn't enforced.
kubectl -n $NS exec deploy/wreck-the-web -- node -e "fetch('https://kubernetes.default.svc', {signal: AbortSignal.timeout(5000)}).then(() => console.log('API REACHABLE'), () => console.log('API blocked'))"
# the server refuses private addresses
curl -s "https://<your-hostname>/play/level?url=http://169.254.169.254/&w=1280&h=800&dpr=1"   # → "private or unknown host"
# and renders a real one
curl -s "https://<your-hostname>/play/level?url=example.com&w=1280&h=800&dpr=1" | head -c 100
```

Also try anything else on your network you care about (a database's service address, your node's own IP on the
kubelet's port 10250): from the pod, all of it should be blocked.

## Why the network policy matters

The server opens any website a stranger types in, in a real browser, from inside your cluster. Its own checks
(`server/snapshot.js`) refuse private, loopback, link-local and reserved addresses (IPv4 hidden in IPv6 included),
anything off ports 80 and 443, popups and downloads. But an address check can't cover everything: DNS rebinding, for
one, where a hostname resolves to a public address when the server checks it and a private one when Chrome connects.

The network policy closes that at the network level, whatever the page or Chrome does: the pod can reach cluster DNS
and public IPv4 addresses on ports 80 and 443, and nothing else. Not other pods or services, not the Kubernetes API,
not the kubelet, not cloud metadata (169.254.169.254). Your node's own public IP stays reachable on 80/443 only, which
is your ingress serving your public sites. If something on your ingress is meant to be internal-only (allowed by
source address), add your node's public IPs to the `except` list.

## Settings

Environment variables, set in `deployment.yaml`:

| Variable | Default | |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | where the server listens. `0.0.0.0` in the container (set in the image). |
| `PORT` | `4600` | |
| `TRUST_PROXY` | `0` | how many proxies in front of the server append to `X-Forwarded-For`. `1` behind one ingress controller. With `0`, the socket address is used. |
| `RATE_LIMIT_PER_MIN` | `12` | fresh renders per client per minute (cached ones are free) |
| `CACHE_MB` | `512` | memory for cached levels (`deployment.yaml` uses 384) |
| `MAX_QUEUE` | `8` | renders that may wait for one of the two render slots. Past that, or after a minute of waiting, players are told to try again. |
| `RENDER_TIMEOUT_MS` | `45000` | the most one render may take |
| `CHROME_NO_SANDBOX` | unset | `1` turns Chrome's own sandbox off: see the next section |
| `CHROME_PATH` | | the Chromium binary (set in the image) |
| `ANALYTICS_SCRIPT`, `ANALYTICS_SITE` | unset | optional: an https tracker script URL and a site UUID. With both set, the menu page gets `<script defer src=… data-website-id=…>`, which is how [Umami](https://umami.is) and similar trackers are installed. Unset, the game has no analytics. `deployment.yaml` loads them from a ConfigMap named `wreck-the-web-analytics` if one exists. |

Rendered levels are kept in the pod's memory and fetched in two requests (the level, then its image), so run **one
replica**, or add sticky sessions to your ingress before scaling out. One pod renders two websites at a time.

## Chrome's sandbox

Chrome sandboxes each page with Linux user namespaces, and the container runtime's default seccomp profile
(`RuntimeDefault`, on containerd as on Docker) blocks them: Chrome then refuses to start with "No usable sandbox!".
So `deployment.yaml` sets `CHROME_NO_SANDBOX=1`, and the pod is the boundary instead: non-root, all capabilities
dropped, no privilege escalation, `RuntimeDefault` seccomp, read-only root filesystem, no service account token, and
the network policy.

To get Chrome's sandbox back without loosening anything else: put a seccomp profile on the node that is the runtime
default plus `clone`/`unshare` with `CLONE_NEWUSER` (under `/var/lib/kubelet/seccomp/`), point the pod at it with
`seccompProfile: { type: Localhost, localhostProfile: <file> }`, and remove `CHROME_NO_SANDBOX`. Don't fix it with
`Unconfined`, or by installing the setuid `chromium-sandbox` helper (which needs privilege escalation): both give
away more than they get back.

## Client addresses and rate limiting

Rate limiting is per player, and the server can only tell players apart if your ingress passes their real addresses
on. With ingress-nginx, `TRUST_PROXY=1` reads the address nginx appends to `X-Forwarded-For`. But if the ingress
controller's Service has `externalTrafficPolicy: Cluster` (the default, and what k3s's built-in load balancer does),
nginx itself sees one internal address for everyone, so every player shares one limit. Either:

- set `externalTrafficPolicy: Local` on the ingress controller's Service, so real addresses come through (this applies
  to every app behind that controller; on a single node it's safe), and keep `RATE_LIMIT_PER_MIN` at 12; or
- leave it and raise `RATE_LIMIT_PER_MIN` (it's then a limit for all players together).

Our cluster uses the first. Behind a CDN or another proxy in front of the ingress, count it in `TRUST_PROXY` (2 for
Cloudflare + ingress-nginx).

## Running it without Kubernetes

The image runs anywhere Docker does:

```sh
docker build -f deploy/Dockerfile -t wreck-the-web .
docker run -d -p 127.0.0.1:4600:4600 --read-only --tmpfs /tmp:rw,size=1g --cap-drop ALL \
  --security-opt no-new-privileges -e CHROME_NO_SANDBOX=1 wreck-the-web
```

That's fine on your own machine. Before exposing it to the internet, put the same egress rule in place some other
way (a firewall on the host or a Docker network that only allows public addresses on 80 and 443), because the
address checks in the server alone don't stop DNS rebinding.

## Updating, rolling back, logs

```sh
./deploy/deploy.sh deploy            # commit first: images are tagged with the git SHA
./deploy/deploy.sh status            # deployment, pods, ingress, network policy, certificate, running image, history
./deploy/deploy.sh logs              # tail the server's logs (every render and every refused one is logged)
./deploy/deploy.sh rollback [rev]    # back to the previous revision, or a specific one
./deploy/deploy.sh smoke             # build and test the image locally, nothing deployed
```

`ALLOW_DIRTY=1` deploys an uncommitted tree (the tag becomes `<sha>-dirty`). Rebuild regularly even without code
changes: Chromium faces hostile pages, and every build picks up Debian's latest Chromium security fixes.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `ImagePullBackOff` | the pull secret is missing, misnamed, or its token can't read the image |
| "No usable sandbox!" in the logs | `CHROME_NO_SANDBOX` isn't set and the container can't create user namespaces (see [Chrome's sandbox](#chromes-sandbox)) |
| HTTPS doesn't work for a few minutes after the first deploy | cert-manager is still issuing the certificate: `kubectl get certificate,challenge -n wreck-the-web` |
| Every site fails with "Could not load that site" | the pod can't reach DNS or the web: check the DNS rule in `networkpolicy.yaml` matches your cluster DNS |
| Everyone gets "Too many websites at once" | all players share one rate limit (see [client addresses](#client-addresses-and-rate-limiting)) |
| 504 "took too long" on big sites | the render hit `RENDER_TIMEOUT_MS`; check the pod isn't CPU-starved (`kubectl top pod`) |
| Pages render with boxes instead of text | a script the image has no font for; add the Debian font package to the Dockerfile |

## Our deployment

`https://wreck-the-web.retrodeep.app`: the k3s cluster at `138.201.254.48`, namespace `wreck-the-web`, image
`ghcr.io/ayomidealaka/wreck-the-web` (private). With those defaults, deploying is just:

```sh
./deploy/deploy.sh deploy
```

- TLS is `letsencrypt-prod` over HTTP-01: retrodeep.app's DNS is on Route 53, so the cluster's Cloudflare DNS-01
  issuer doesn't cover it. This ingress takes precedence over the retrodeep-tunnel ingress's `*.retrodeep.app`.
- The `ghcr-secret` pull secret was copied from the `dropstash` namespace (same registry account).
- ingress-nginx's Service has `externalTrafficPolicy: Cluster`, so the rate limit is shared by all players
  (`RATE_LIMIT_PER_MIN=60`).
- Chrome runs with `CHROME_NO_SANDBOX=1` (no seccomp profile with user namespaces on the node yet).
