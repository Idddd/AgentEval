#!/usr/bin/env bash
set -Eeuo pipefail

pg_isready \
  -h 127.0.0.1 \
  -p 5432 \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" >/dev/null

python -c \
  "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/healthz', timeout=2)" \
  >/dev/null

python -c \
  "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/api/health', timeout=2)" \
  >/dev/null
