# Agent Office Windows Background Service

Windows can run the same standalone dashboard for native Windows Codex, Claude, Grok, OpenCode, and
Antigravity processes. The bundled installer uses Task Scheduler because plain Node/Bun processes are not
Windows Service Control Manager services unless wrapped by WinSW, NSSM, or a similar service
wrapper.

The task:

- starts at user logon
- serves the dashboard at `http://localhost:4627`
- prefers Bun when installed
- falls back to the built Node bundle
- scans native Windows processes through `Get-CimInstance Win32_Process`

## Build

From PowerShell:

```powershell
bun install
cd webview-ui
bun install
cd ..
bun run build
```

If Bun is not installed on Windows, Node still works:

```powershell
npm install
cd webview-ui
npm install
cd ..
npm run build
```

## Run Once

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\run-windows-dashboard.ps1
```

## Install

```powershell
bun run install:windows-service
```

or:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\install-windows-service.ps1
```

Useful commands:

```powershell
Get-ScheduledTask AgentOfficeDashboard
Start-ScheduledTask AgentOfficeDashboard
Stop-ScheduledTask AgentOfficeDashboard
bun run uninstall:windows-service
```

For a true SCM Windows Service, wrap `scripts\run-windows-dashboard.ps1` with WinSW or NSSM.

Configuration can be set in `.env` or passed to the runner. Local-only is the default:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\run-windows-dashboard.ps1 -HostName 127.0.0.1 -Port 4627
```

For private remote access, set a non-local host only with auth or an access-controlled proxy:

```env
AGENT_OFFICE_HOST=0.0.0.0
AGENT_OFFICE_AUTH_USER=agent-office
AGENT_OFFICE_AUTH_PASSWORD=replace-with-a-long-random-password
```

See [Self-Hosting](self-hosting.md) for the full configuration table.
