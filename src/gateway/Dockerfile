# Tool Gateway image — built from the repository root:
#   docker build -f src/gateway/Dockerfile -t agent-eval-gateway .
FROM python:3.12-slim

WORKDIR /app
COPY src/__init__.py src/models.py src/tools_mock.py src/
COPY src/gateway/ src/gateway/

RUN useradd --uid 65532 --no-create-home gateway
USER 65532

ENV PORT=9000
EXPOSE 9000
HEALTHCHECK --interval=10s --timeout=3s CMD ["python", "-c", \
    "import urllib.request; urllib.request.urlopen('http://127.0.0.1:9000/healthz', timeout=2)"]

CMD ["python", "-m", "src.gateway"]
