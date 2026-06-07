#!/usr/bin/env python3
"""Codex PR reviewer for Agent Office — runs codex exec against the PR base branch."""
from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

API = "https://api.github.com"
MARKER = "<!-- codex-review -->"
MODEL = os.environ.get("CODEX_MODEL", "gpt-5.5")
CODEX_BIN = os.environ.get("CODEX_BIN", "codex")
TIMEOUT_SEC = int(os.environ.get("CODEX_TIMEOUT_SEC", "900"))

PROMPT = """You are reviewing a pull request for Agent Office (VS Code extension + standalone browser service + pixel-agent webview). Write ONE concise review comment in Markdown. Use `file:line` references. Do not nitpick formatting. If it is clean, say so plainly.

Check, in priority order:
1. SECURITY — hook endpoint auth, unsafe file reads/writes, secret leakage in logs/env examples, webview message-trust mistakes, path traversal in asset loading, command injection via terminal spawning or JSONL parsing.
2. CORRECTNESS — terminal adoption, transcript parsing, layout/config persistence, server lifecycle, cross-window sync regressions, provider adapter detection edge cases.
3. API / CONTRACT CHANGES — breaking changes to standalone HTTP routes, webview/extension message shapes, env/config keys, or provider hooks without docs or migration notes.
4. EXTENSION UX — broken webview messaging, animation/state bugs, packaging/manifest issues, docs drift from actual behavior.

End with a single final line: `Verdict: <one sentence>`."""


def warning(message: str) -> None:
    print(f"::warning::{message}", file=sys.stderr)


def req(method, url, token, body=None, accept="application/vnd.github+json"):
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": accept,
        "User-Agent": "codex-review",
    }
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(request, timeout=120) as resp:
        return resp.status, resp.read()


def upsert_comment(repo: str, pr: str, token: str, text: str) -> str:
    body_md = f"{MARKER}\n## Codex review ({MODEL})\n\n{text}"
    _, raw = req("GET", f"{API}/repos/{repo}/issues/{pr}/comments?per_page=100", token)
    for comment in json.loads(raw):
        if MARKER in (comment.get("body") or ""):
            req(
                "PATCH",
                f"{API}/repos/{repo}/issues/comments/{comment['id']}",
                token,
                body={"body": body_md},
            )
            return "updated"
    req("POST", f"{API}/repos/{repo}/issues/{pr}/comments", token, body={"body": body_md})
    return "created"


def run_codex_review(base_ref: str, repo_root: Path) -> str:
    out_path = Path(tempfile.mkstemp(suffix=".md")[1])
    instructions = (
        f"{PROMPT}\n\n"
        f"You are reviewing an open pull request in this git repository.\n"
        f"Inspect the changes with: git diff origin/{base_ref}...HEAD\n"
        "Write ONE concise Markdown review with `file:line` references.\n"
        "End with a single line: `Verdict: <one sentence>`."
    )
    try:
        proc = subprocess.run(
            [
                CODEX_BIN,
                "exec",
                "--ephemeral",
                "-o",
                str(out_path),
                "-m",
                MODEL,
                "--dangerously-bypass-approvals-and-sandbox",
                "-",
            ],
            input=instructions,
            cwd=repo_root,
            capture_output=True,
            text=True,
            timeout=TIMEOUT_SEC,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        out_path.unlink(missing_ok=True)
        raise RuntimeError(f"codex timed out after {TIMEOUT_SEC}s") from exc

    if proc.returncode != 0:
        out_path.unlink(missing_ok=True)
        detail = (proc.stderr or proc.stdout or "").strip()
        raise RuntimeError(detail or f"codex exited {proc.returncode}")

    text = out_path.read_text(encoding="utf-8").strip()
    out_path.unlink(missing_ok=True)
    if not text:
        raise RuntimeError("codex returned no review text")
    return text


def main() -> None:
    token = os.environ["GITHUB_TOKEN"]
    repo = os.environ["REPO"]
    pr = os.environ["PR_NUMBER"]
    base_ref = os.environ.get("BASE_REF", "master")
    repo_root = Path(os.environ.get("REPO_ROOT", ".")).resolve()

    try:
        review = run_codex_review(base_ref, repo_root)
    except Exception as exc:
        warning(f"Codex review skipped: {exc}")
        return

    try:
        action = upsert_comment(repo, pr, token, review)
    except Exception as exc:
        warning(f"Codex review completed but failed to post comment: {exc}")
        return
    print(f"comment {action}")


if __name__ == "__main__":
    main()