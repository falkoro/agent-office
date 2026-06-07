#!/usr/bin/env bash
# Discover the host-local Hermes llm-proxy (Grok) for self-hosted runners.
set -euo pipefail

GW="$(ip route 2>/dev/null | awk '/default/{print $3; exit}')"
for H in host.containers.internal "$GW" 172.18.0.1 172.17.0.1 127.0.0.1; do
  [ -z "$H" ] && continue
  if curl -fsS --max-time 6 "http://$H:38765/status" >/dev/null 2>&1; then
    echo "url=http://$H:38765/api/v1/messages" >> "${GITHUB_OUTPUT}"
    echo "Hermes proxy reachable at $H:38765" >&2
    exit 0
  fi
done

echo "::error::Hermes proxy (:38765) unreachable from the runner" >&2
exit 1