# Agent Office WSL Service

Agent Office can run the Pixel Agents office as a WSL-hosted web service instead of only as a VS Code webview.

The service is Bun-first. If Bun is installed, systemd runs `standalone/server.ts` directly with
Bun. Node remains a fallback for environments that do not have Bun yet.

The service:

- serves the existing pixel office UI at `http://localhost:4627`
- scans WSL processes for running `codex`, `claude`, `opencode`, `agy`, and `antigravity` CLIs
- watches the common state/log locations under `~/.codex`, `~/.claude`, `~/.local/share/opencode`, and common Antigravity config/cache folders
- streams extension-compatible events to the browser with Server-Sent Events
- installs as a systemd service named `agent-office-wsl`

## Build

```bash
bun install
cd webview-ui && bun install && cd ..
bun run build:webview
bun run build:standalone # optional Node fallback bundle
```

## Run Once

```bash
PIXEL_AGENTS_PORT=4627 bun run start:standalone
```

Open `http://localhost:4627`.

## Install In WSL Systemd

```bash
bun run install:wsl-service
```

Useful commands:

```bash
sudo systemctl status agent-office-wsl
sudo journalctl -u agent-office-wsl -f
sudo systemctl restart agent-office-wsl
bun run uninstall:wsl-service
```

Environment overrides:

- `PIXEL_AGENTS_HOST`, default `0.0.0.0`
- `PIXEL_AGENTS_PORT`, default `4627`
- `PIXEL_AGENTS_POLL_INTERVAL_MS`, default `1500`
- `PIXEL_AGENTS_ACTIVE_GRACE_MS`, default `7000`

The environment variable names intentionally keep the `PIXEL_AGENTS_*` prefix for compatibility
with the upstream extension and earlier standalone installs.
