# Self-Hosting

Agent Office is designed to be self-hosted by the person running the AI agents. It watches local
process metadata and local activity files, then renders them in a browser.

There are two supported deployment modes:

1. **Local-only**: bind to `127.0.0.1` and open `http://localhost:4627` on the same machine.
2. **Remote/private access**: bind to `0.0.0.0` only behind built-in auth on a private network,
   Cloudflare Access, Tailscale, a VPN, or another access-controlled proxy.

Do not expose an unauthenticated Agent Office instance directly to the public internet.

## Quick Start

```bash
git clone https://github.com/falkoro/agent-office.git
cd agent-office
bun install
cd webview-ui && bun install && cd ..
bun run build
cp .env.example .env
bun run start:standalone
```

Open `http://localhost:4627`.

## Configuration

The standalone server reads environment variables and also loads `.env` from the repo root when it
exists. `AGENT_OFFICE_*` names are preferred; legacy `PIXEL_AGENTS_*` names still work.

| Variable                        | Default        | Notes                                                   |
| ------------------------------- | -------------- | ------------------------------------------------------- |
| `AGENT_OFFICE_HOST`             | `127.0.0.1`    | Use `0.0.0.0` only when access is controlled.           |
| `AGENT_OFFICE_PORT`             | `4627`         | Browser URL port.                                       |
| `AGENT_OFFICE_WEB_ROOT`         | `dist/webview` | Built web assets.                                       |
| `AGENT_OFFICE_ENV_FILE`         | `.env`         | Optional path to a different env file.                  |
| `AGENT_OFFICE_AUTH_USER`        | `agent-office` | Basic-auth username when auth is enabled.               |
| `AGENT_OFFICE_AUTH_PASSWORD`    | unset          | Enables built-in HTTP Basic auth when set.              |
| `AGENT_OFFICE_POLL_INTERVAL_MS` | `1500`         | Process/activity scan interval.                         |
| `AGENT_OFFICE_ACTIVE_GRACE_MS`  | `7000`         | How long an agent stays visually active after activity. |

If `.env` contains `AGENT_OFFICE_AUTH_PASSWORD`, treat it like a secret:

```bash
chmod 600 .env
```

## Local-Only Setup

For a single-user laptop or workstation, no auth is needed:

```env
AGENT_OFFICE_HOST=127.0.0.1
AGENT_OFFICE_PORT=4627
```

## Private Remote Setup

For access from another device, keep the instance private and require auth:

```env
AGENT_OFFICE_HOST=0.0.0.0
AGENT_OFFICE_PORT=4627
AGENT_OFFICE_AUTH_USER=agent-office
AGENT_OFFICE_AUTH_PASSWORD=replace-with-a-long-random-password
```

This built-in auth is intentionally simple. Basic auth credentials are only appropriate across a
trusted private network or behind TLS. For a public hostname, prefer a real access layer such as
Cloudflare Access, Tailscale, VPN auth, Caddy/nginx auth over HTTPS, or your organization's SSO. You
can use both built-in auth and a proxy-level access policy if you want defense in depth.

When built-in auth is enabled, every route is protected, including `/api/health`, `/api/agents`, and
the Server-Sent Events stream at `/api/events`.

## WSL Service

```bash
bun run install:wsl-service
```

To bind beyond localhost during install:

```bash
AGENT_OFFICE_HOST=0.0.0.0 bun run install:wsl-service
```

The service still loads `.env` from the repo root, so auth variables can live there instead of in
the systemd unit.

Existing installs created before the local-only default may still have an explicit
`AGENT_OFFICE_HOST` or `PIXEL_AGENTS_HOST` in their service file. Re-run the installer or inspect
the unit if you want to confirm what address it binds to:

```bash
sudo systemctl cat agent-office-wsl
```

## Windows Task Scheduler

```powershell
bun run install:windows-service
```

To bind beyond localhost:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\install-windows-service.ps1 -HostName 0.0.0.0
```

## What Is Exposed

The dashboard can show provider names, process counts, workspace labels, and recent activity hints
from local agent logs. It does not need provider API keys and it does not modify agent CLIs, but the
metadata is still sensitive enough to keep private.

## Grok Activity Log

Grok process detection looks for a running `grok` command. Activity text is optional and comes from
`~/.grok/agent-activity.log` when present:

```bash
mkdir -p ~/.grok
chmod 700 ~/.grok
echo "Grok 4.3: working on documentation" >> ~/.grok/agent-activity.log
```

The latest non-empty line is shown in the dashboard.
