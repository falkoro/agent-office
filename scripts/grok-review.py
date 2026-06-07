#!/usr/bin/env python3
"""Grok PR reviewer (Hermes proxy) for Agent Office."""
import json
import os
import sys
import urllib.error
import urllib.request

API = "https://api.github.com"
MARKER = "<!-- grok-review -->"
MODEL = os.environ.get("GROK_MODEL", "grok-4.3")
DIFF_LIMIT = 50_000

DEFAULT_PROMPT = """You are reviewing a pull request for Agent Office (VS Code extension + pixel-agent webview). Write ONE concise review comment in Markdown. Use `file:line` references. Do not nitpick formatting. If it is clean, say so plainly.

Check, in priority order:

1. SECURITY — hook endpoint auth, unsafe file reads/writes, secret leakage, webview message-trust mistakes, path traversal in asset loading.
2. CORRECTNESS — terminal adoption, transcript parsing, layout/config persistence, server lifecycle, cross-window sync regressions.
3. EXTENSION UX — broken webview messaging, animation/state bugs, packaging/manifest issues, docs drift from actual behavior.

End with a single final line: `Verdict: <one sentence>`.

Here is the unified diff:

```diff
{diff}
```"""

PROMPT = os.environ.get("GROK_REVIEW_PROMPT", DEFAULT_PROMPT)


def req(method, url, token, body=None, accept="application/vnd.github+json"):
    headers = {"Authorization": f"Bearer {token}", "Accept": accept,
               "User-Agent": "grok-review"}
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    r = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(r, timeout=120) as resp:
        return resp.status, resp.read()


def get_diff(repo, pr, token):
    _, raw = req("GET", f"{API}/repos/{repo}/pulls/{pr}", token,
                 accept="application/vnd.github.v3.diff")
    return raw.decode("utf-8", "replace")


def call_grok(url, diff):
    body = {
        "model": MODEL,
        "max_tokens": 1800,
        "stream": False,
        "messages": [{"role": "user", "content": PROMPT.format(diff=diff)}],
    }
    r = urllib.request.Request(
        url, data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json",
                 "anthropic-version": "2023-06-01"},
        method="POST")
    with urllib.request.urlopen(r, timeout=180) as resp:
        payload = json.loads(resp.read())
    parts = [b.get("text", "") for b in payload.get("content", [])
             if b.get("type") == "text"]
    return "".join(parts).strip()


def upsert_comment(repo, pr, token, text):
    body_md = f"{MARKER}\n## 🔎 Grok review (Hermes · grok-4.3)\n\n{text}"
    _, raw = req("GET", f"{API}/repos/{repo}/issues/{pr}/comments?per_page=100", token)
    for c in json.loads(raw):
        if MARKER in (c.get("body") or ""):
            req("PATCH", f"{API}/repos/{repo}/issues/comments/{c['id']}", token,
                body={"body": body_md})
            return "updated"
    req("POST", f"{API}/repos/{repo}/issues/{pr}/comments", token,
        body={"body": body_md})
    return "created"


def main():
    token = os.environ["GITHUB_TOKEN"]
    repo = os.environ["REPO"]
    pr = os.environ["PR_NUMBER"]
    url = os.environ["GROK_URL"]

    diff = get_diff(repo, pr, token)
    if not diff.strip():
        print("empty diff; nothing to review")
        return
    truncated = len(diff) > DIFF_LIMIT
    if truncated:
        diff = diff[:DIFF_LIMIT] + "\n\n[... diff truncated for length ...]"

    try:
        review = call_grok(url, diff)
    except urllib.error.HTTPError as e:
        print(f"grok proxy error {e.code}: {e.read()[:300]!r}", file=sys.stderr)
        sys.exit(1)
    if not review:
        print("model returned no text", file=sys.stderr)
        sys.exit(1)
    if truncated:
        review += "\n\n_Note: the diff was truncated; review covers the first part only._"

    action = upsert_comment(repo, pr, token, review)
    print(f"comment {action}")


if __name__ == "__main__":
    main()