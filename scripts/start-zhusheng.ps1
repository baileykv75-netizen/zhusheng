$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root

$envFile = Join-Path $root ".env"
if (Test-Path -LiteralPath $envFile) {
  foreach ($line in Get-Content -LiteralPath $envFile -Encoding UTF8) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith("#") -or -not $trimmed.Contains("=")) { continue }
    $name, $value = $trimmed.Split("=", 2)
    [Environment]::SetEnvironmentVariable($name.Trim(), $value.Trim(), "Process")
  }
}

$node = Get-Command node -ErrorAction Stop
$npm = Get-Command npm.cmd -ErrorAction Stop
$version = & $node.Source -p "process.versions.node"
if ([int]($version.Split(".")[0]) -lt 20) {
  throw "筑生需要 Node.js 20 或更高版本。当前版本：$version"
}

$port = if ($env:PORT) { $env:PORT } else { "4173" }
$url = "http://127.0.0.1:$port"

try {
  $health = Invoke-RestMethod -Uri "$url/api/health" -TimeoutSec 1
  if ($health.ok) {
    Start-Process $url
    Write-Host "筑生已在运行：$url"
    exit 0
  }
} catch {}

if (-not (Test-Path -LiteralPath (Join-Path $root "node_modules\next"))) {
  Write-Host "首次运行：正在安装依赖..."
  & $npm.Source install
  if ($LASTEXITCODE -ne 0) { throw "依赖安装失败。" }
}

Write-Host "正在生成生产版本..."
& $npm.Source run build
if ($LASTEXITCODE -ne 0) { throw "生产构建失败。" }

$next = Join-Path $root "node_modules\next\dist\bin\next"
$stdout = Join-Path $root "server.stdout.log"
$stderr = Join-Path $root "server.stderr.log"
$process = Start-Process `
  -FilePath $node.Source `
  -ArgumentList @($next, "start", $root, "-H", "127.0.0.1", "-p", $port) `
  -WorkingDirectory $root `
  -WindowStyle Hidden `
  -RedirectStandardOutput $stdout `
  -RedirectStandardError $stderr `
  -PassThru

Set-Content -LiteralPath (Join-Path $root ".zhusheng-server.pid") -Value $process.Id -Encoding ASCII

for ($attempt = 0; $attempt -lt 40; $attempt += 1) {
  Start-Sleep -Milliseconds 250
  try {
    $health = Invoke-RestMethod -Uri "$url/api/health" -TimeoutSec 1
    if ($health.ok) {
      Start-Process $url
      Write-Host "筑生已启动：$url"
      Write-Host "结束时双击 stop-zhusheng.cmd。"
      exit 0
    }
  } catch {}
}

throw "筑生未能按时启动，请查看 server.stderr.log。"
