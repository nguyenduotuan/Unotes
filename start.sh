#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

if [[ ! -x .venv/bin/python ]]; then
  python3 -m venv .venv
fi

if ! .venv/bin/python -c 'import fastapi, sqlalchemy, uvicorn' >/dev/null 2>&1; then
  .venv/bin/python -m pip install -r Backend/requirements.txt
fi

if [[ ! -x Frontend/node_modules/.bin/vite ]]; then
  npm --prefix Frontend install
fi

(
  cd Backend
  exec ../.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
) &
backend_pid=$!
stop_backend() {
  kill "$backend_pid" 2>/dev/null || true
  wait "$backend_pid" 2>/dev/null || true
}
trap stop_backend EXIT INT TERM

lan_ip="$(.venv/bin/python -c 'import socket; connection = socket.socket(socket.AF_INET, socket.SOCK_DGRAM); connection.connect(("192.0.2.1", 9)); print(connection.getsockname()[0]); connection.close()' 2>/dev/null || true)"
printf '\nCalendar is available on this laptop at http://localhost:5173\n'
if [[ -n "$lan_ip" ]]; then
  printf 'On your phone, open http://%s:5173 while connected to the same Wi-Fi.\n\n' "$lan_ip"
else
  printf 'On your phone, open this laptop’s local network IP on port 5173.\n\n'
fi

npm --prefix Frontend run dev -- --open http://localhost:5174/