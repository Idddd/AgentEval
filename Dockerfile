FROM python:3.12-slim AS api

WORKDIR /build/api

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt


FROM node:22-bookworm-slim AS web-dependencies

WORKDIR /build/web

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential python3 \
    && rm -rf /var/lib/apt/lists/*

COPY web/package.json web/package-lock.json ./
COPY web/apps/control/package.json apps/control/package.json
COPY web/apps/example-mcp-server/package.json apps/example-mcp-server/package.json
COPY web/apps/runner/package.json apps/runner/package.json
COPY web/packages/contracts/package.json packages/contracts/package.json
RUN npm ci --include=optional


FROM web-dependencies AS web-build

COPY web/tsconfig.base.json ./
COPY web/apps ./apps
COPY web/packages ./packages
COPY web/skills ./skills
RUN npm run build:control


FROM web-dependencies AS web-production-dependencies

RUN npm prune --omit=dev


FROM postgres:17-bookworm AS runtime

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080 \
    EVAL_API_URL=http://127.0.0.1:8000 \
    TASKLATTICE_CONFIG=/run/agenteval/control.toml \
    PGDATA=/var/lib/agenteval/postgres \
    WORKBENCH_WEB_DB=/var/lib/agenteval/evaluation/web-workbench.db \
    POSTGRES_USER=tasklattice \
    POSTGRES_PASSWORD=development \
    POSTGRES_DB=tasklattice \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates tini \
    && rm -rf /var/lib/apt/lists/*

COPY --from=api /usr/local /usr/local
COPY --from=web-dependencies /usr/local/bin/node /usr/local/bin/node
COPY --from=web-dependencies /usr/local/bin/npm /usr/local/bin/npm
COPY --from=web-dependencies /usr/local/bin/npx /usr/local/bin/npx
COPY --from=web-dependencies /usr/local/lib/node_modules /usr/local/lib/node_modules

COPY --from=web-production-dependencies /build/web/node_modules ./node_modules
COPY web/package.json web/package-lock.json ./
COPY web/apps/control/package.json apps/control/package.json
COPY web/packages/contracts/package.json packages/contracts/package.json
COPY --from=web-build /build/web/packages/contracts/dist ./packages/contracts/dist
COPY --from=web-build /build/web/apps/control/.output ./apps/control/.output
COPY --from=web-build /build/web/apps/control/prisma ./apps/control/prisma
COPY --from=web-build /build/web/apps/control/prisma.config.ts ./apps/control/prisma.config.ts
COPY --from=web-build /build/web/apps/control/server/config ./apps/control/server/config
COPY --from=web-build /build/web/apps/control/server/generated ./apps/control/server/generated
COPY --from=web-build /build/web/skills/vendor/dist ./skills/vendor/dist

COPY main.py ./
COPY config ./config
COPY src ./src
COPY deploy/runtime /opt/agenteval/runtime

RUN chmod 0755 \
      /opt/agenteval/runtime/entrypoint.sh \
      /opt/agenteval/runtime/healthcheck.sh \
    && mkdir -p /var/lib/agenteval/evaluation /run/agenteval \
    && chown -R postgres:postgres /var/lib/agenteval /run/agenteval

EXPOSE 8080

STOPSIGNAL SIGTERM

HEALTHCHECK --interval=10s --timeout=5s --start-period=60s --retries=6 \
    CMD ["/opt/agenteval/runtime/healthcheck.sh"]

ENTRYPOINT ["/usr/bin/tini", "--", "/opt/agenteval/runtime/entrypoint.sh"]
