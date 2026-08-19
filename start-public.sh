#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-3000}"
APP_URL="http://127.0.0.1:${PORT}"
NGROK_API="http://127.0.0.1:4040/api/tunnels"

if ! command -v ngrok >/dev/null 2>&1; then
  echo "ngrok CLI was not found in PATH."
  echo "Install it here: https://dashboard.ngrok.com/get-started/your-authtoken"
  echo "Then run: ./start-public.sh"
  exit 1
fi

if [[ -n "${NGROK_AUTHTOKEN:-}" ]]; then
  ngrok config add-authtoken "${NGROK_AUTHTOKEN}" >/dev/null 2>&1 || true
fi

export ALLOWED_DEV_ORIGINS="${ALLOWED_DEV_ORIGINS:-localhost,127.0.0.1,0.0.0.0,*.ngrok-free.app,*.ngrok.app,*.ngrok.io}"

echo "Starting app on ${APP_URL}..."
PORT="$PORT" npm run dev > .app.log 2>&1 &
APP_PID=$!

cleanup() {
  if kill -0 "$APP_PID" 2>/dev/null; then
    kill "$APP_PID" 2>/dev/null || true
    wait "$APP_PID" 2>/dev/null || true
  fi

  if [[ -n "${NGROK_PID:-}" ]] && kill -0 "$NGROK_PID" 2>/dev/null; then
    kill "$NGROK_PID" 2>/dev/null || true
    wait "$NGROK_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

for attempt in $(seq 1 60); do
  if curl -fsS "$APP_URL" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! curl -fsS "$APP_URL" >/dev/null 2>&1; then
  echo "The app did not become ready on ${APP_URL}."
  echo "Recent app logs:"
  tail -n 40 .app.log || true
  exit 1
fi

echo "Starting ngrok tunnel on port ${PORT}..."
ngrok http "$PORT" --log=stdout > .ngrok.log 2>&1 &
NGROK_PID=$!

for attempt in $(seq 1 30); do
  if curl -fsS "$NGROK_API" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

printf '\nLocal app: %s\n' "$APP_URL"
printf 'Public URL: '
python3 - <<'PY'
import json
import urllib.request

url = 'http://127.0.0.1:4040/api/tunnels'
try:
    with urllib.request.urlopen(url, timeout=5) as response:
        data = json.load(response)
    tunnels = data.get('tunnels', [])
    if tunnels:
        print(tunnels[0]['public_url'])
    else:
        print('Waiting for ngrok to assign a tunnel...')
except Exception:
    print('Waiting for ngrok to assign a tunnel...')
PY

printf '\nPress Ctrl+C to stop both services.\n'
wait "$APP_PID"
