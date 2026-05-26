#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_NAME="${SERVICE_NAME:-agent-office-wsl}"
LEGACY_SERVICE_NAME="${LEGACY_SERVICE_NAME:-pixel-agents-wsl}"
PORT="${AGENT_OFFICE_PORT:-${PIXEL_AGENTS_PORT:-4627}}"
HOST="${AGENT_OFFICE_HOST:-${PIXEL_AGENTS_HOST:-127.0.0.1}}"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
RUN_USER="${SUDO_USER:-$USER}"

find_bun() {
  if [[ -n "${BUN_BIN:-}" && -x "$BUN_BIN" ]]; then
    echo "$BUN_BIN"
  elif command -v bun >/dev/null 2>&1; then
    command -v bun
  elif [[ -x "$HOME/.bun/bin/bun" ]]; then
    echo "$HOME/.bun/bin/bun"
  else
    return 1
  fi
}

if [[ ! -f "$ROOT/dist/webview/index.html" ]]; then
  echo "Web build output is missing. Run: bun install && cd webview-ui && bun install && cd .. && bun run build:webview"
  exit 1
fi

if [[ "$SERVICE_NAME" != "$LEGACY_SERVICE_NAME" ]]; then
  sudo systemctl disable --now "$LEGACY_SERVICE_NAME" 2>/dev/null || true
  sudo rm -f "/etc/systemd/system/${LEGACY_SERVICE_NAME}.service"
fi

if BUN_PATH="$(find_bun)"; then
  EXEC_START="${BUN_PATH} ${ROOT}/standalone/server.ts"
  RUNTIME_LABEL="Bun (${BUN_PATH})"
elif [[ -n "${NODE_BIN:-}" || -x "$(command -v node 2>/dev/null || true)" ]]; then
  NODE_PATH="${NODE_BIN:-$(command -v node)}"
  if [[ ! -f "$ROOT/dist/standalone/server.js" ]]; then
    echo "Node fallback build output is missing. Run: bun run build:standalone"
    exit 1
  fi
  EXEC_START="${NODE_PATH} ${ROOT}/dist/standalone/server.js"
  RUNTIME_LABEL="Node (${NODE_PATH})"
else
  echo "Neither Bun nor Node was found."
  exit 1
fi

sudo tee "$SERVICE_FILE" >/dev/null <<EOF
[Unit]
Description=Agent Office WSL Dashboard
After=network.target

[Service]
Type=simple
User=${RUN_USER}
WorkingDirectory=${ROOT}
Environment=NODE_ENV=production
Environment=AGENT_OFFICE_HOST=${HOST}
Environment=AGENT_OFFICE_PORT=${PORT}
Environment=AGENT_OFFICE_WEB_ROOT=${ROOT}/dist/webview
ExecStart=${EXEC_START}
Restart=on-failure
RestartSec=2

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE_NAME"
sudo systemctl restart "$SERVICE_NAME"
sudo systemctl --no-pager --full status "$SERVICE_NAME"

echo
echo "Agent Office WSL is available at http://localhost:${PORT}"
echo "Runtime: ${RUNTIME_LABEL}"
