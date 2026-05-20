param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
  [int]$Port = 4627,
  [string]$HostName = "0.0.0.0",
  [ValidateSet("auto", "bun", "node")]
  [string]$Runtime = "auto"
)

$ErrorActionPreference = "Stop"

function Find-Bun {
  $cmd = Get-Command bun -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }

  $candidate = Join-Path $env:USERPROFILE ".bun\bin\bun.exe"
  if (Test-Path $candidate) { return $candidate }

  return $null
}

function Find-Node {
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  return $null
}

$webIndex = Join-Path $Root "dist\webview\index.html"
if (-not (Test-Path $webIndex)) {
  throw "Web build output is missing. Run: bun install; cd webview-ui; bun install; cd ..; bun run build:webview"
}

$env:NODE_ENV = "production"
$env:PIXEL_AGENTS_HOST = $HostName
$env:PIXEL_AGENTS_PORT = [string]$Port
$env:PIXEL_AGENTS_WEB_ROOT = Join-Path $Root "dist\webview"

Set-Location $Root

$bun = Find-Bun
if (($Runtime -eq "auto" -or $Runtime -eq "bun") -and $bun) {
  & $bun (Join-Path $Root "standalone\server.ts")
  exit $LASTEXITCODE
}

$node = Find-Node
if (($Runtime -eq "auto" -or $Runtime -eq "node") -and $node) {
  $server = Join-Path $Root "dist\standalone\server.js"
  if (-not (Test-Path $server)) {
    throw "Node fallback build output is missing. Run: bun run build:standalone"
  }
  & $node $server
  exit $LASTEXITCODE
}

throw "No usable runtime found. Install Bun from https://bun.sh or Node.js from https://nodejs.org."
