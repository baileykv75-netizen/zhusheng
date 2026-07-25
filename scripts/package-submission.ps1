$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$outputDir = Join-Path $root "outputs"
$staging = Join-Path ([System.IO.Path]::GetTempPath()) "zhusheng-submission-package"
$zipPath = Join-Path $outputDir "zhusheng-digital-building-agent.zip"

New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
if (Test-Path -LiteralPath $staging) {
  $resolved = (Resolve-Path -LiteralPath $staging).Path
  $tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
  if (-not $resolved.StartsWith($tempRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "The staging path is outside the system temp directory. Packaging stopped."
  }
  Remove-Item -LiteralPath $resolved -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $staging | Out-Null

$files = @(
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "tsconfig.json",
  "next-env.d.ts",
  "next.config.ts",
  "README.md",
  ".env.example",
  "Dockerfile",
  ".dockerignore",
  "start-zhusheng.cmd",
  "stop-zhusheng.cmd"
)
foreach ($file in $files) {
  Copy-Item -LiteralPath (Join-Path $root $file) -Destination $staging
}
foreach ($directory in @("app", "components", "lib", "public", "docs", "tests", "scripts", "submission")) {
  $source = Join-Path $root $directory
  if (Test-Path -LiteralPath $source) {
    Copy-Item -LiteralPath $source -Destination $staging -Recurse
  }
}

if (Test-Path -LiteralPath $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force
}
Compress-Archive -Path (Join-Path $staging "*") -DestinationPath $zipPath -CompressionLevel Optimal
Write-Host "Submission package created: $zipPath"
