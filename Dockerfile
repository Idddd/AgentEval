FROM node:22-bookworm-slim AS ui-dependencies

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


FROM ui-dependencies AS ui-build

ENV TALI_UI_DEMO=true

COPY web/tsconfig.base.json ./
COPY web/apps ./apps
COPY web/packages ./packages
COPY web/skills ./skills
RUN npm run build:control \
    && test -f apps/control/dist/client/_shell.html


FROM alpine/helm:3.18.4 AS chart

ENTRYPOINT []

ARG TALI_UI_DEMO_CHART_VERSION=0.2.0-dev
ARG TALI_UI_DEMO_IMAGE_REPOSITORY=ghcr.io/idddd/tali-ui-demo
ARG TALI_UI_DEMO_IMAGE_TAG=dev

WORKDIR /work

COPY deploy/helm/tali-ui-demo ./tali-ui-demo
RUN sed -i "s|^version:.*|version: ${TALI_UI_DEMO_CHART_VERSION}|" tali-ui-demo/Chart.yaml \
    && sed -i "s|^appVersion:.*|appVersion: ${TALI_UI_DEMO_IMAGE_TAG}|" tali-ui-demo/Chart.yaml \
    && sed -i "s|repository: ghcr.io/idddd/tali-ui-demo|repository: ${TALI_UI_DEMO_IMAGE_REPOSITORY}|" tali-ui-demo/values.yaml \
    && sed -i "s|tag: dev|tag: ${TALI_UI_DEMO_IMAGE_TAG}|" tali-ui-demo/values.yaml \
    && helm lint tali-ui-demo \
    && helm template tali-ui-demo tali-ui-demo >/dev/null \
    && mkdir -p /packages /embedded \
    && helm package tali-ui-demo --destination /packages \
    && cp /packages/tali-ui-demo-*.tgz /embedded/tali-UI-demo.tgz


FROM nginx:1.31.4-alpine-slim AS runtime

COPY deploy/ui-demo/nginx.conf /etc/nginx/nginx.conf
COPY --from=ui-build /build/web/apps/control/dist/client /usr/share/nginx/html
COPY --from=chart /embedded/tali-UI-demo.tgz /opt/tali/helm/tali-UI-demo.tgz

RUN mkdir -p /tmp/client_temp /tmp/proxy_temp /tmp/fastcgi_temp /tmp/uwsgi_temp /tmp/scgi_temp \
    && chown -R nginx:nginx /tmp /usr/share/nginx/html /opt/tali

USER nginx

EXPOSE 8080

STOPSIGNAL SIGQUIT

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
    CMD ["wget", "-q", "-O", "-", "http://127.0.0.1:8080/healthz"]

CMD ["nginx", "-g", "daemon off;"]
