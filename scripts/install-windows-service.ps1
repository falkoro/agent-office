param(
  [string]$TaskName = "AgentOfficeDashboard",
  [int]$Port = 4627,
  [string]$HostName = "127.0.0.1",
  [ValidateSet("auto", "bun", "node")]
  [string]$Runtime = "auto"
)

$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$runner = Join-Path $root "scripts\run-windows-dashboard.ps1"

if (-not (Test-Path (Join-Path $root "dist\webview\index.html"))) {
  throw "Web build output is missing. Run: bun install; cd webview-ui; bun install; cd ..; bun run build:webview"
}

$legacyTaskName = "PixelAgentsDashboard"
if ($TaskName -ne $legacyTaskName) {
  $legacyTask = Get-ScheduledTask -TaskName $legacyTaskName -ErrorAction SilentlyContinue
  if ($legacyTask) {
    Stop-ScheduledTask -TaskName $legacyTaskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $legacyTaskName -Confirm:$false
  }
}

$pwsh = Get-Command pwsh -ErrorAction SilentlyContinue
if ($pwsh) {
  $ps = $pwsh.Source
} else {
  $ps = (Get-Command powershell.exe -ErrorAction Stop).Source
}

$arguments = @(
  "-NoProfile",
  "-ExecutionPolicy", "Bypass",
  "-File", "`"$runner`"",
  "-Root", "`"$root`"",
  "-Port", $Port,
  "-HostName", $HostName,
  "-Runtime", $Runtime
) -join " "

$action = New-ScheduledTaskAction -Execute $ps -Argument $arguments -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -AtLogOn
$userId = if ($env:USERDOMAIN) { "$env:USERDOMAIN\$env:USERNAME" } else { $env:USERNAME }
$principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel LeastPrivilege

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Principal $principal `
  -Description "Agent Office dashboard for native Windows Codex, Claude, Grok, OpenCode, Antigravity, and Goose processes." `
  -Force | Out-Null

Start-ScheduledTask -TaskName $TaskName

Write-Host "Agent Office Windows background task is installed and running."
Write-Host "Open http://localhost:$Port"
Write-Host "Task name: $TaskName"
