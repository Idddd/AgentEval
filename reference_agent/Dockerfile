# Reference Agent image — built from the repository root:
#   docker build -f reference_agent/Dockerfile -t agent-eval-reference-agent .
# The contract SDK is vendored so the image has zero dependencies on src/.
FROM python:3.12-slim

WORKDIR /app
COPY src/contract/ contract/
COPY reference_agent/app.py app.py

RUN useradd --uid 65532 --no-create-home agent
USER 65532

ENV PORT=8080
EXPOSE 8080
HEALTHCHECK --interval=5s --timeout=3s CMD ["python", "-c", \
    "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/healthz', timeout=2)"]

CMD ["python", "app.py"]
