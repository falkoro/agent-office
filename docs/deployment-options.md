# Deployment Options

Agent Office currently ships:

- WSL systemd service with Bun
- Windows Task Scheduler background task with Bun or Node fallback

Other useful ways to run it:

- **Docker/Podman**: good for a portable dashboard, but process observation needs host mounts or a sidecar collector.
- **WinSW or NSSM**: turns the Windows runner into a true Windows Service Control Manager service.
- **launchd**: the macOS equivalent of the WSL systemd unit.
- **Caddy, nginx, or Traefik**: reverse proxy the dashboard behind TLS and a friendly hostname.
- **Cloudflare Tunnel or Tailscale Funnel**: private remote access without opening router ports. Require an access policy if the tunnel is reachable from the public internet.
- **Agent hooks**: richer status than process scanning when a CLI supports hooks or structured event logs.
- **OpenTelemetry/file tail adapters**: a good next step for tools that emit logs but not hooks.

See [Self-Hosting](self-hosting.md) for environment variables, built-in Basic auth, and local-only
versus remote/private setup examples.

## Exposure Note

Agent Office is meant to observe local developer tools. The standalone server can reveal process
counts, provider names, workspace labels, and recent activity hints. For remote or public-hostname
access, use built-in Basic auth, Cloudflare Access, Tailscale, VPN auth, or an equivalent gate. Do
not expose an unauthenticated instance directly to the internet.
