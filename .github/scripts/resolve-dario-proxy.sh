#!/usr/bin/env bash
# Discover the host-local Dario proxy (Claude Max OAuth) for self-hosted runners.
# Quota exhaustion (HTTP 402/429) is expected occasionally — skip review, do not fail the job.
set -euo pipefail

probe_dario() {
  local host="$1"
  local body_file http_code
  body_file="$(mktemp)"
  http_code="$(
    curl -sS --max-time 8 -o "$body_file" -w "%{http_code}" \
      -X POST "http://${host}:3456/v1/chat/completions" \
      -H 'content-type: application/json' \
      -H 'authorization: Bearer dario' \
      -d '{"model":"claude-haiku-4-5","messages":[{"role":"user","content":"ok"}],"max_tokens":4,"stream":false}' \
      2>/dev/null || echo "000"
  )"
  rm -f "$body_file"
  echo "$http_code"
}

GW=""
if command -v ip >/dev/null 2>&1; then
  GW="$(ip route 2>/dev/null | awk '/default/{print $3; exit}')"
fi

for H in host.containers.internal "$GW" 172.18.0.1 172.17.0.1 127.0.0.1; do
  [ -z "$H" ] && continue
  HTTP="$(probe_dario "$H")"
  case "$HTTP" in
    200)
      {
        echo "available=true"
        echo "base_url=http://$H:3456"
        echo "api_key=dario"
      } >> "${GITHUB_OUTPUT:-/dev/null}"
      echo "Dario proxy reachable at $H:3456" >&2
      exit 0
      ;;
    402|429)
      {
        echo "available=false"
      } >> "${GITHUB_OUTPUT:-/dev/null}"
      echo "::warning::Dario quota exhausted (HTTP $HTTP); Claude review skipped." >&2
      exit 0
      ;;
  esac
done

{
  echo "available=false"
} >> "${GITHUB_OUTPUT:-/dev/null}"
echo "::warning::Dario proxy (:3456) unreachable from the runner; Claude review skipped." >&2
exit 0