param([string]$BlenderPath = $env:BLENDER_PATH)

$ErrorActionPreference = "Stop"
$VisualRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$BimRoot = Split-Path -Parent $VisualRoot
$RepoRoot = Split-Path -Parent $BimRoot
$Blender = if ($BlenderPath -and (Test-Path -LiteralPath $BlenderPath)) { $BlenderPath } else { "C:\Program Files\Blender Foundation\Blender 4.5\blender.exe" }
if (-not (Test-Path -LiteralPath $Blender)) { throw "Blender 4.5 not found. Pass -BlenderPath." }

$Script = Join-Path $VisualRoot "scripts\build_building_hero.py"
$Spec = Join-Path $BimRoot "building-spec.json"
$Ifc = Join-Path $BimRoot "output\ZS-DEMO-001.ifc"
$Blend = Join-Path $VisualRoot "building-hero.blend"
$Glb = Join-Path $VisualRoot "building-hero.glb"
$Anchors = Join-Path $VisualRoot "building-hero.anchors.json"
$Validation = Join-Path $VisualRoot "building-hero.validation.json"
$Screenshots = Join-Path $VisualRoot "screenshots\building-hero"

& $Blender --background --python $Script -- --spec $Spec --ifc $Ifc --blend $Blend --glb $Glb --anchors $Anchors --validation $Validation --screenshots $Screenshots
if ($LASTEXITCODE -ne 0) { throw "Building Hero build failed." }

$PublicRoot = Join-Path $RepoRoot "public\assets\v6\building"
New-Item -ItemType Directory -Force -Path $PublicRoot | Out-Null
Copy-Item -LiteralPath $Glb -Destination (Join-Path $PublicRoot "building-hero.glb") -Force
Copy-Item -LiteralPath $Anchors -Destination (Join-Path $PublicRoot "building-hero.anchors.json") -Force
Copy-Item -LiteralPath $Validation -Destination (Join-Path $PublicRoot "building-hero.validation.json") -Force
Write-Host "BUILDING_HERO_PUBLIC_ASSETS_READY $PublicRoot"
