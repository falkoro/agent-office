<h1 align="center">
  <img src="webview-ui/public/agent-office.svg" alt="Agent Office logo" width="96" height="96">
  <br>
  Agent Office
</h1>

<p align="center">
  A browser office where local AI agents come to life.
</p>

<p align="center">
  <a href="https://github.com/falkoro/agent-office/issues">Issues</a>
  ·
  <a href="https://github.com/falkoro/agent-office/discussions">Discussions</a>
  ·
  <a href="docs/wsl-standalone-service.md">WSL service</a>
  ·
  <a href="docs/windows-standalone-service.md">Windows service</a>
  ·
  <a href="docs/self-hosting.md">Self-hosting</a>
  ·
  <a href="ATTRIBUTION.md">Attribution</a>
</p>

Agent Office lets you watch local AI CLI agents work together in a shared pixel office. Each
running agent becomes a character you can see at a glance: working at a desk, waiting on a couch,
or asking for approval with a visible bell signal in the browser tab.

It is Bun-first, runs in a normal browser, and ships with service runners for WSL/systemd and
Windows Task Scheduler. Today it observes Codex, Claude, Grok, OpenCode, Antigravity, and Goose
processes, with room for more provider adapters.

PRs, provider adapters, layouts, bug reports, and feature requests are very welcome.

![Agent Office screenshot](webview-ui/public/Screenshot.jpg)

## Demo

[Watch the browser demo](docs/assets/agent-office-demo.webm).

## What It Does

- Shows local CLI agents as animated characters in a pixel office.
- Serves the office in a browser at `http://localhost:4627`.
- Runs as a WSL systemd service or a Windows background scheduled task.
- Detects Codex, Claude, OpenCode, Antigravity/`agy`, and Goose processes.
- Detects Grok TUI sessions through a lightweight local activity log.
- Shows live browser title counts like `(4) Agent Office`.
- Shows a bell in the title and toolbar when approval is needed.
- Collects pending confirmations in an approval inbox grouped beside provider counts.
- Lets you click an agent to inspect activity, tokens, workspace, and set a friendly name.
- Adds a numbered roster, live event timeline, and per-agent history for busy rooms.
- Includes a service health and setup wizard for WSL/systemd and Windows Task Scheduler.
- Includes a fit-to-page control that recenters the office around the visible workspace.
- Sends waiting agents to sofa and bench seats, then returns them to work when active again.
- Includes the original office layout editor, furniture assets, character sprites, and overlays.
- Saves custom layouts from the browser service.

## Quick Start: WSL

```bash
bun install
cd webview-ui && bun install && cd ..
bun run build
bun run install:wsl-service
```

Open `http://localhost:4627`.

Useful commands:

```bash
sudo systemctl status agent-office-wsl
sudo journalctl -u agent-office-wsl -f
sudo systemctl restart agent-office-wsl
bun run uninstall:wsl-service
```

## Quick Start: Windows

From PowerShell:

```powershell
bun install
cd webview-ui
bun install
cd ..
bun run build
bun run install:windows-service
```

Open `http://localhost:4627`.

Useful commands:

```powershell
Get-ScheduledTask AgentOfficeDashboard
Start-ScheduledTask AgentOfficeDashboard
Stop-ScheduledTask AgentOfficeDashboard
bun run uninstall:windows-service
```

The Windows runner uses Task Scheduler. For a true Windows Service Control Manager service, wrap
`scripts/run-windows-dashboard.ps1` with WinSW or NSSM.

## Run Once

```bash
AGENT_OFFICE_PORT=4627 bun run start:standalone
```

Node remains available as a fallback:

```bash
bun run build:standalone
bun run start:standalone:node
```

## Self-Hosting

Agent Office is meant to be self-hosted by the person running the agents. Local-only use needs no
extra configuration:

```env
AGENT_OFFICE_HOST=127.0.0.1
AGENT_OFFICE_PORT=4627
```

If you bind to `0.0.0.0` or put it on a hostname, protect it with Cloudflare Access, Tailscale, VPN
auth, a reverse-proxy access policy, or the built-in HTTP Basic auth:

```env
AGENT_OFFICE_HOST=0.0.0.0
AGENT_OFFICE_AUTH_USER=agent-office
AGENT_OFFICE_AUTH_PASSWORD=replace-with-a-long-random-password
```

See [Self-Hosting](docs/self-hosting.md) for the full configuration table.

## Supported Agents

| Agent       | Process detection        | Activity hints                              |
| ----------- | ------------------------ | ------------------------------------------- |
| Codex       | `codex`, `@openai/codex` | `~/.codex/log/codex-tui.log`                |
| Claude      | `claude`                 | `~/.claude/projects/**/*.jsonl`             |
| Grok        | `grok`                   | `~/.grok/agent-activity.log`                |
| OpenCode    | `opencode`               | `~/.local/share/opencode/storage/**/*.json` |
| Antigravity | `agy`, `antigravity`     | common Antigravity config/cache log folders |
| Goose       | `goose`, `@block/goose`  | common Goose config/cache log folders       |

The standalone server is intentionally observational. It watches process metadata and common local
state/log files without requiring agent CLIs to be modified.

Because the dashboard shows local process status, workspaces, and recent activity hints, keep it on
localhost or place it behind auth before exposing it outside your machine.

## Development

```bash
bun install
cd webview-ui && bun install && cd ..
bun run build
bun run test
bun run verify:standalone
```

The VS Code extension code is still present because Agent Office is built from Pixel Agents, but
the standalone browser service is the main focus here.

## Contributing

Feature requests and PRs are welcome:

- Use [Issues](https://github.com/falkoro/agent-office/issues) for bugs, feature requests, and
  small improvements.
- Use [Discussions](https://github.com/falkoro/agent-office/discussions) for bigger ideas,
  provider design, and roadmap questions.
- Provider adapters are especially useful: if a CLI exposes hooks, logs, JSONL, OpenTelemetry, or
  another event stream, Agent Office can probably visualize it.

Good first areas:

- More provider detectors and activity parsers.
- Better waiting, approval, and completion animations.
- Windows service wrappers with WinSW or NSSM.
- Docker, launchd, and reverse-proxy examples.
- Custom office layouts and asset packs.

## Huge Thank You

Agent Office began from [Pixel Agents](https://github.com/pablodelucca/pixel-agents) by
[Pablo Delucca](https://github.com/pablodelucca) and contributors. The original project created
the pixel office, the canvas renderer, the layout editor, the character animations, the furniture
system, and the Claude Code extension experience that made this possible.

Huge thank you to Pablo and everyone who contributed upstream. This project keeps that credit
prominent and preserves the MIT license. See [ATTRIBUTION.md](ATTRIBUTION.md) for details.

Character sprites are based on
[JIK-A-4, Metro City](https://jik-a-4.itch.io/metrocity-free-topdown-character-pack).

## License

MIT. See [LICENSE](LICENSE).
