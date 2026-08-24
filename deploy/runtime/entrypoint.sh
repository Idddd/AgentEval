#!/usr/bin/env bash
set -Eeuo pipefail

postgres_pid=""
api_pid=""
web_pid=""

terminate_children() {
  local pid
  for pid in "$web_pid" "$api_pid" "$postgres_pid"; do
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      kill -TERM "$pid" 2>/dev/null || true
    fi
  done
  wait || true
}

exit_with_cleanup() {
  local status="${1:-0}"
  trap - EXIT TERM INT
  terminate_children
  exit "$status"
}

trap 'exit_with_cleanup $?' EXIT
trap 'exit_with_cleanup 0' TERM INT

mkdir -p "$PGDATA" "$(dirname "$WORKBENCH_WEB_DB")" /run/agenteval
chown -R postgres:postgres /var/lib/agenteval /run/agenteval

echo "Starting embedded PostgreSQL..."
/usr/local/bin/docker-entrypoint.sh postgres &
postgres_pid=$!

for attempt in $(seq 1 60); do
  if pg_isready \
    -h 127.0.0.1 \
    -p 5432 \
    -U "$POSTGRES_USER" \
    -d "$POSTGRES_DB" >/dev/null 2>&1; then
    break
  fi
  if ! kill -0 "$postgres_pid" 2>/dev/null; then
    echo "Embedded PostgreSQL exited during startup." >&2
    exit 1
  fi
  if [[ "$attempt" -eq 60 ]]; then
    echo "Embedded PostgreSQL did not become ready within 60 seconds." >&2
    exit 1
  fi
  sleep 1
done

python /opt/agenteval/runtime/render_control_config.py

echo "Applying control database migrations..."
gosu postgres npm run db:migrate:control

echo "Starting AgentEval API..."
gosu postgres python -m uvicorn \
  src.api.main:app \
  --host 127.0.0.1 \
  --port 8000 &
api_pid=$!

for attempt in $(seq 1 60); do
  if python -c \
    "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/healthz', timeout=2)" \
    >/dev/null 2>&1; then
    break
  fi
  if ! kill -0 "$api_pid" 2>/dev/null; then
    echo "AgentEval API exited during startup." >&2
    exit 1
  fi
  if [[ "$attempt" -eq 60 ]]; then
    echo "AgentEval API did not become ready within 60 seconds." >&2
    exit 1
  fi
  sleep 1
done

echo "Starting AgentEval Web on port 8080..."
gosu postgres node apps/control/.output/server/index.mjs &
web_pid=$!

set +e
wait -n "$postgres_pid" "$api_pid" "$web_pid"
component_status=$?
set -e
if [[ "$component_status" -eq 0 ]]; then
  component_status=1
fi
echo "An AgentEval component exited; stopping the Demo container." >&2
exit "$component_status"
