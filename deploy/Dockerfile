# syntax=docker/dockerfile:1.7
#
# Wreck the Web: the Node server plus the Chromium it renders websites with.
# Build context is the repo root (see .dockerignore: only package*.json, server/ and public/ go in).

FROM node:22-bookworm-slim

# Chromium from Debian (security updates track Chrome stable), fonts so pages in most scripts and emoji render
# instead of boxes, and tini as PID 1 so Chrome's helper processes are reaped.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      chromium ca-certificates tini \
      fonts-liberation fonts-noto-core fonts-noto-cjk fonts-noto-color-emoji \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server ./server
COPY public ./public

# HOME=/tmp: the root filesystem is read-only in the cluster and Chrome writes its profile and caches under HOME.
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4600 \
    CHROME_PATH=/usr/bin/chromium \
    HOME=/tmp

# node:*-slim ships an unprivileged `node` user (uid 1000).
USER node
EXPOSE 4600
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server/index.js"]
