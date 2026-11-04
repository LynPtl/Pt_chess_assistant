<#
    setup.ps1 — one-shot setup for Pt chess assistant (Windows).

        powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
        powershell -ExecutionPolicy Bypass -File scripts\setup.ps1 -All

    Default: Node checks + npm install + build + write config.json.
    Optional switches install the heavy local pieces too:

        -EnCroissant   download and silently install En Croissant
        -Stockfish     download Stockfish into %LOCALAPPDATA%\en-croissant-engines
        -Maia          create a venv, install CPU torch + maia3, cache the 79M weights
        -All           all of the above

    Everything is idempotent: existing installs are detected and left alone.
    Messages are English on purpose — a .ps1 that has to survive a codepage change
    is not worth the risk; the README explains each step in Chinese.
#>
[CmdletBinding()]
param(
    [switch]$EnCroissant,
    [switch]$Stockfish,
    [switch]$Maia,
    [switch]$All
)

$ErrorActionPreference = "Stop"
if ($All) { $EnCroissant = $true; $Stockfish = $true; $Maia = $true }

$RepoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $RepoRoot

function Step($text) { Write-Host "`n==> $text" -ForegroundColor Cyan }
function Ok($text)   { Write-Host "    $text" -ForegroundColor Green }
function Warn($text) { Write-Host "    $text" -ForegroundColor Yellow }
function Die($text)  { Write-Host "`n[X] $text" -ForegroundColor Red; exit 1 }

function Get-NodeMajor {
    try { return [int]((node --version).TrimStart("v").Split(".")[0]) } catch { return 0 }
}

# ---------------------------------------------------------------- Node + build
Step "Checking Node.js"
$major = Get-NodeMajor
if ($major -eq 0) {
    Die "node not found. Install Node.js 22+ (winget install OpenJS.NodeJS.LTS) and re-run."
}
if ($major -lt 22) {
    Die "Node $major is too old; this project needs 22+ (node --test globbing, import.meta.resolve)."
}
Ok "Node v$(node --version)"

Step "Installing npm dependencies (this also copies the wasm runtime and the model)"
npm install
if ($LASTEXITCODE -ne 0) { Die "npm install failed" }

Step "Building the page"
npm run build
if ($LASTEXITCODE -ne 0) { Die "npm run build failed" }
Ok "dist/ is ready"

# ------------------------------------------------------- En Croissant (the GUI)
$EnCroissantExe = ""
$candidates = @(
    (Join-Path $env:LOCALAPPDATA "en-croissant\en-croissant.exe"),
    (Join-Path $env:LOCALAPPDATA "Programs\en-croissant\en-croissant.exe"),
    "C:\Program Files\en-croissant\en-croissant.exe"
)
foreach ($c in $candidates) { if (Test-Path $c) { $EnCroissantExe = $c; break } }

if (-not $EnCroissantExe -and $EnCroissant) {
    Step "Downloading En Croissant"
    $url = "https://github.com/franciscoBSalgueiro/en-croissant/releases/download/v0.15.1/en-croissant_0.15.1_x64-setup.exe"
    $installer = Join-Path $env:TEMP "en-croissant-setup.exe"
    Invoke-WebRequest -Uri $url -OutFile $installer
    Ok "downloaded $((Get-Item $installer).Length) bytes"
    Step "Installing silently (/S)"
    Start-Process -FilePath $installer -ArgumentList "/S" -Wait
    foreach ($c in $candidates) { if (Test-Path $c) { $EnCroissantExe = $c; break } }
}

if ($EnCroissantExe) {
    Ok "En Croissant: $EnCroissantExe"
} else {
    Warn "En Croissant not found. Install it from https://www.encroissant.org"
    Warn "(or re-run with -EnCroissant to let this script download and install it)"
}

# ----------------------------------------------------------------- Stockfish
$StockfishExe = ""
$sfDir = Join-Path $env:LOCALAPPDATA "en-croissant-engines\stockfish"
if (Test-Path $sfDir) {
    $found = Get-ChildItem $sfDir -Filter "stockfish*.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($found) { $StockfishExe = $found.FullName }
}

if (-not $StockfishExe -and $Stockfish) {
    Step "Downloading Stockfish (81 MB)"
    New-Item -ItemType Directory -Force -Path $sfDir | Out-Null
    $zip = Join-Path $env:TEMP "stockfish.zip"
    Invoke-WebRequest -Uri "https://github.com/official-stockfish/Stockfish/releases/download/sf_19/stockfish-windows-x86-64-universal.zip" -OutFile $zip
    Expand-Archive -LiteralPath $zip -DestinationPath $sfDir -Force
    $found = Get-ChildItem $sfDir -Filter "stockfish*.exe" -Recurse | Select-Object -First 1
    if ($found) { $StockfishExe = $found.FullName }
}

if ($StockfishExe) { Ok "Stockfish: $StockfishExe" } else { Warn "Stockfish not installed (optional: -Stockfish)" }

# ---------------------------------------------------------------------- Maia
$MaiaExe = ""
$venv = Join-Path $env:LOCALAPPDATA "maia3-venv"
$maiaCandidate = Join-Path $venv "Scripts\maia3-79m.exe"
if (Test-Path $maiaCandidate) { $MaiaExe = $maiaCandidate }

if (-not $MaiaExe -and $Maia) {
    Step "Creating the Maia venv"
    $py = (Get-Command python -ErrorAction SilentlyContinue).Source
    if (-not $py) { Die "python not found; install Python 3.10+ then re-run with -Maia" }
    python -m venv $venv
    $venvPy = Join-Path $venv "Scripts\python.exe"
    Step "Installing CPU-only torch (~200 MB)"
    & $venvPy -m pip install --upgrade pip | Out-Null
    & $venvPy -m pip install torch --index-url https://download.pytorch.org/whl/cpu
    if ($LASTEXITCODE -ne 0) { Die "torch install failed" }
    Step "Installing maia3 from GitHub"
    $maiaRepo = Join-Path $env:TEMP "maia3-src"
    if (Test-Path $maiaRepo) { Remove-Item -Recurse -Force $maiaRepo }
    git clone --depth 1 https://github.com/CSSLab/maia3.git $maiaRepo
    & $venvPy -m pip install $maiaRepo
    if ($LASTEXITCODE -ne 0) { Die "maia3 install failed" }
    Step "Caching the 79M weights (~301 MB, one time)"
    & (Join-Path $venv "Scripts\maia3-cache.exe") --model maia3-79m
    if (Test-Path $maiaCandidate) { $MaiaExe = $maiaCandidate }
}

if ($MaiaExe) { Ok "Maia 3: $MaiaExe" } else { Warn "Maia 3 not installed (optional: -Maia)" }

# -------------------------------------------------------------------- config
Step "Writing config.json"
$configPath = Join-Path $RepoRoot "config.json"
if (Test-Path $configPath) {
    Ok "config.json already exists - left untouched"
} else {
    $config = [ordered]@{
        enCroissantPath = ($EnCroissantExe -replace "\\", "/")
        port            = 8787
        pgnTempDir      = ""
        logPath         = "logs/recognitions.jsonl"
        logMaxBytes     = 2097152
    }
    $config | ConvertTo-Json | Set-Content -Encoding UTF8 $configPath
    Ok "config.json written"
}

# --------------------------------------------------------------------- done
Step "Done"
Write-Host ""
Write-Host "  Start it:   .\start.bat        (opens http://127.0.0.1:8787/)"
Write-Host "  Stop it:    close that window, or .\stop.bat"
Write-Host "  Tests:      npm test           (unit)"
Write-Host "              npm run verify     (real browser, needs the server running)"
Write-Host ""
if ($EnCroissantExe -or $StockfishExe -or $MaiaExe) {
    Write-Host "  Engines to add inside En Croissant (Engines -> +)" -ForegroundColor Cyan
    if ($MaiaExe) { Write-Host "    Maia 3 (79M):  $MaiaExe   [MultiPV 3, Elo <you>, Nodes = 1]" }
    if ($StockfishExe) { Write-Host "    Stockfish:     $StockfishExe   [Threads = cores, Hash = 1024, Infinite]" }
    Write-Host ""
}
