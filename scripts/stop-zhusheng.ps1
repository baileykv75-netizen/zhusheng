$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$pidFile = Join-Path $root ".zhusheng-server.pid"
if (-not (Test-Path -LiteralPath $pidFile)) {
  Write-Host "No Zhusheng service started by the launcher was found."
  exit 0
}

$serverPid = [int](Get-Content -LiteralPath $pidFile -Encoding ASCII)
$process = Get-Process -Id $serverPid -ErrorAction SilentlyContinue
if ($process) {
  if ($process.ProcessName -ne "node") {
    throw "PID $serverPid is not a Node process. Stop cancelled."
  }
  Stop-Process -Id $serverPid
}
Remove-Item -LiteralPath $pidFile -Force
Write-Host "Zhusheng service stopped."
