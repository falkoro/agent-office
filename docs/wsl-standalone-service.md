# Pixel Agents WSL Service

This fork can run Pixel Agents as a WSL-hosted web service instead of only as a VS Code webview.

The service is Bun-first. If Bun is installed, systemd runs `standalone/server.ts` directly with
Bun. Node remains a fallback for environments that do not have Bun yet.

The service:

- serves the existing pixel office UI at `http://localhost:4627`
- scans WSL processes for running `codex`, `claude`, and `opencode` CLIs
- watches the common state/log locations under `~/.codex`, `~/.claude`, and `~/.local/share/opencode`
- streams extension-compatible events to the browser with Server-Sent Events
- installs as a systemd service named `pixel-agents-wsl`

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
sudo systemctl status pixel-agents-wsl
sudo journalctl -u pixel-agents-wsl -f
sudo systemctl restart pixel-agents-wsl
bun run uninstall:wsl-service
```

Environment overrides:

- `PIXEL_AGENTS_HOST`, default `0.0.0.0`
- `PIXEL_AGENTS_PORT`, default `4627`
- `PIXEL_AGENTS_POLL_INTERVAL_MS`, default `1500`
- `PIXEL_AGENTS_ACTIVE_GRACE_MS`, default `7000`
