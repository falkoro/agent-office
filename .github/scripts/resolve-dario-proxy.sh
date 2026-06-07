#!/usr/bin/env bash
# Discover the host-local Dario proxy (Claude Max OAuth) for self-hosted runners.
set -euo pipefail

GW=""
if command -v ip >/dev/null 2>&1; then
  GW="$(ip route 2>/dev/null | awk '/default/{print $3; exit}')"
fi
for H in host.containers.internal "$GW" 172.18.0.1 172.17.0.1 127.0.0.1; do
  [ -z "$H" ] && continue
  if curl -fsS --max-time 8 \
    -X POST "http://$H:3456/v1/chat/completions" \
    -H 'content-type: application/json' \
    -H 'authorization: Bearer dario' \
    -d '{"model":"claude-haiku-4-5","messages":[{"role":"user","content":"ok"}],"max_tokens":4,"stream":false}' \
    >/dev/null 2>&1; then
    {
      echo "base_url=http://$H:3456"
      echo "api_key=dario"
    } >> "${GITHUB_OUTPUT}"
    echo "Dario proxy reachable at $H:3456" >&2
    exit 0
  fi
done

echo "::error::Dario proxy (:3456) unreachable from the runner" >&2
exit 1