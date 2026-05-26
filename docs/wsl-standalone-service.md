# Agent Office WSL Service

Agent Office can run the Pixel Agents office as a WSL-hosted web service instead of only as a VS Code webview.

The service is Bun-first. If Bun is installed, systemd runs `standalone/server.ts` directly with
Bun. Node remains a fallback for environments that do not have Bun yet.

The service:

- serves the existing pixel office UI at `http://localhost:4627`
- scans WSL processes for running `codex`, `claude`, `grok`, `opencode`, `agy`, `antigravity`, and `goose` CLIs
- watches the common state/log locations under `~/.codex`, `~/.claude`, `~/.grok`, `~/.local/share/opencode`, and common Antigravity/Goose config/cache folders
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
AGENT_OFFICE_PORT=4627 bun run start:standalone
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

- `AGENT_OFFICE_HOST`, default `127.0.0.1`
- `AGENT_OFFICE_PORT`, default `4627`
- `AGENT_OFFICE_AUTH_USER`, default `agent-office`
- `AGENT_OFFICE_AUTH_PASSWORD`, default unset. When set, built-in HTTP Basic auth is enabled.
- `AGENT_OFFICE_POLL_INTERVAL_MS`, default `1500`
- `AGENT_OFFICE_ACTIVE_GRACE_MS`, default `7000`

Legacy `PIXEL_AGENTS_*` names still work for compatibility with earlier standalone installs.

See [Self-Hosting](self-hosting.md) for remote/private access examples.
