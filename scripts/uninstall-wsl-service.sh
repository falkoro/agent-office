#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="${SERVICE_NAME:-agent-office-wsl}"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

sudo systemctl disable --now "$SERVICE_NAME" 2>/dev/null || true
sudo rm -f "$SERVICE_FILE"
sudo systemctl daemon-reload

echo "Removed ${SERVICE_NAME}."
