# Deployment Options

This fork currently ships:

- WSL systemd service with Bun
- Windows Task Scheduler background task with Bun or Node fallback

Other useful ways to run it:

- **Docker/Podman**: good for a portable dashboard, but process observation needs host mounts or a sidecar collector.
- **WinSW or NSSM**: turns the Windows runner into a true Windows Service Control Manager service.
- **launchd**: the macOS equivalent of the WSL systemd unit.
- **Caddy, nginx, or Traefik**: reverse proxy the dashboard behind TLS and a friendly hostname.
- **Cloudflare Tunnel or Tailscale Funnel**: private remote access without opening router ports.
- **Agent hooks**: richer status than process scanning when a CLI supports hooks or structured event logs.
- **OpenTelemetry/file tail adapters**: a good next step for tools that emit logs but not hooks.
