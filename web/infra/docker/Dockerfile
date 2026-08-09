FROM alpine:3.22 AS openshell-cli
ARG TARGETARCH
ARG OPENSHELL_VERSION=0.0.82
RUN apk add --no-cache ca-certificates curl tar \
    && case "${TARGETARCH}" in \
      amd64) asset="openshell-x86_64-unknown-linux-musl.tar.gz"; checksum="d3d73904bd6e2f81f5913ca2347eb0e772eb45d82fbee9880be3e0c416eaf802" ;; \
      arm64) asset="openshell-aarch64-unknown-linux-musl.tar.gz"; checksum="f1113a9cfed452860d62658da67f48a657f502e23f1117b38111867ba13521ca" ;; \
      *) echo "Unsupported architecture: ${TARGETARCH}" >&2; exit 1 ;; \
    esac \
    && curl --fail --location --retry 5 \
      --output /tmp/openshell.tar.gz \
      "https://github.com/NVIDIA/OpenShell/releases/download/v${OPENSHELL_VERSION}/${asset}" \
    && echo "${checksum}  /tmp/openshell.tar.gz" | sha256sum -c - \
    && tar -xzf /tmp/openshell.tar.gz -C /usr/local/bin openshell \
    && chmod 0755 /usr/local/bin/openshell

FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential python3 \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY apps/control/package.json apps/control/package.json
COPY apps/example-mcp-server/package.json apps/example-mcp-server/package.json
COPY apps/runner/package.json apps/runner/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN --mount=type=cache,target=/root/.npm \
    npm_config_fetch_retries=5 \
    npm_config_fetch_retry_maxtimeout=120000 \
    npm ci --include=optional

FROM dependencies AS build
COPY tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
COPY skills ./skills
RUN npm run build --workspace @tasklattice/contracts \
    && npm run build --workspace @tasklattice/control \
    && npm run build --workspace @tasklattice/runner \
    && npm run build --workspace @tasklattice/example-mcp-server

FROM dependencies AS production-dependencies
RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS control
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080 \
    TASKLATTICE_HELM_CHART=/opt/tasklattice/helm/tasklattice.tgz
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/*
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY apps/control/package.json apps/control/package.json
COPY --from=build /app/apps/control/prisma ./apps/control/prisma
COPY --from=build /app/apps/control/prisma.config.ts ./apps/control/prisma.config.ts
COPY --from=build /app/apps/control/server/config ./apps/control/server/config
COPY --from=build /app/apps/control/.output ./apps/control/.output
COPY --from=build /app/skills/vendor/dist ./skills/vendor/dist
COPY dist/control-plane-chart/tasklattice.tgz /opt/tasklattice/helm/tasklattice.tgz
USER 10001
EXPOSE 8080
CMD ["node", "apps/control/.output/server/index.mjs"]

FROM node:22-bookworm-slim AS example-mcp
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000
WORKDIR /app
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY apps/example-mcp-server/package.json apps/example-mcp-server/package.json
COPY --from=build /app/apps/example-mcp-server/dist ./apps/example-mcp-server/dist
USER node
EXPOSE 3000
CMD ["node", "apps/example-mcp-server/dist/index.js"]

FROM node:22-bookworm-slim AS runner
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=9090 \
    NEMOCLAW_RUNNER_MODE=openshell-kubernetes
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates openssh-client tar \
    && rm -rf /var/lib/apt/lists/*
COPY --from=openshell-cli /usr/local/bin/openshell /usr/local/bin/openshell
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY --from=build /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=build /app/apps/runner/dist ./apps/runner/dist
COPY apps/runner/package.json ./apps/runner/package.json
USER node
EXPOSE 9090
CMD ["node", "apps/runner/dist/index.js"]
