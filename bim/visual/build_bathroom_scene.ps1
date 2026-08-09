param(
    [string]$BlenderPath = $env:BLENDER_PATH,
    [string]$PythonPath = $env:PYTHON_PATH
)

$ErrorActionPreference = "Stop"
$VisualRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$BimRoot = Split-Path -Parent $VisualRoot
$RepoRoot = Split-Path -Parent $BimRoot

function Resolve-Executable {
    param(
        [string]$Requested,
        [string[]]$Candidates,
        [string]$Label
    )
    if ($Requested -and (Test-Path -LiteralPath $Requested)) {
        return (Resolve-Path -LiteralPath $Requested).Path
    }
    foreach ($candidate in $Candidates) {
        if (-not $candidate) {
            continue
        }
        if (Test-Path -LiteralPath $candidate) {
            return (Resolve-Path -LiteralPath $candidate).Path
        }
        $command = Get-Command $candidate -ErrorAction SilentlyContinue
        if ($command) {
            return $command.Source
        }
    }
    throw "Unable to locate $Label. Pass the path explicitly."
}

$Python = Resolve-Executable -Requested $PythonPath -Label "Python 3.12" -Candidates @(
    "python",
    "py",
    "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe"
)
$Blender = Resolve-Executable -Requested $BlenderPath -Label "Blender 4.5" -Candidates @(
    "blender",
    "C:\Program Files\Blender Foundation\Blender 4.5\blender.exe"
)

$Spec = Join-Path $BimRoot "building-spec.json"
$Ifc = Join-Path $BimRoot "output\ZS-DEMO-001.ifc"
$Memory = Join-Path $BimRoot "data\building-memory.seed.json"
$Blend = Join-Path $VisualRoot "bathroom-1602.blend"
$Glb = Join-Path $VisualRoot "bathroom-1602.glb"
$Manifest = Join-Path $VisualRoot "bathroom-1602.manifest.json"
$Screenshots = Join-Path $VisualRoot "screenshots"
$BuildScript = Join-Path $VisualRoot "scripts\build_bathroom_scene.py"
$ValidateScript = Join-Path $VisualRoot "scripts\validate_bathroom_scene.py"

Write-Host "[1/7] Generate IFC"
& $Python (Join-Path $BimRoot "scripts\generate_ifc.py")
if ($LASTEXITCODE -ne 0) { throw "IFC generation failed." }

Write-Host "[2/7] Validate IFC"
& $Python (Join-Path $BimRoot "scripts\validate_ifc.py")
if ($LASTEXITCODE -ne 0) { throw "IFC validation failed." }

Write-Host "[3/7] Generate building memory"
& $Python (Join-Path $BimRoot "scripts\generate_memory_seed.py")
if ($LASTEXITCODE -ne 0) { throw "Building memory generation failed." }

Write-Host "[4/7] Build Blender scene, render screenshots, export GLB and manifest"
& $Blender --background --python $BuildScript -- --spec $Spec --memory $Memory --blend $Blend --glb $Glb --manifest $Manifest --screenshots $Screenshots
if ($LASTEXITCODE -ne 0) { throw "Blender scene generation failed." }

Write-Host "[5/7] Reopen BLEND and reimport GLB"
& $Blender --background $Blend --python $ValidateScript -- --blend $Blend --glb $Glb --manifest $Manifest
if ($LASTEXITCODE -ne 0) { throw "Blender visual validation failed." }

Write-Host "[6/7] Run BIM tests"
& $Python -m pytest (Join-Path $BimRoot "tests")
if ($LASTEXITCODE -ne 0) { throw "BIM tests failed." }

Write-Host "[7/7] Complete"
Write-Host "BLEND: $Blend"
Write-Host "GLB: $Glb"
Write-Host "Manifest: $Manifest"
Write-Host "Synthetic demonstration model. Not for construction."
