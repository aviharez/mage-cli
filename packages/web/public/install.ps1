#Requires -Version 5.0
# Mage installer — Windows PowerShell
# Usage: irm https://mage.apps.ocpdevgra.dti.co.id/install.ps1 | iex

param(
    [string]$Version  = "",
    [switch]$NoConfig,
    [switch]$Help
)

$ErrorActionPreference = 'Stop'

$REGISTRY = "https://artifactory.intra.bca.co.id/artifactory/api/npm/MBB-Registry-npm/"
$PACKAGE  = "@mybcabisnis/mage"

# Allow version override via environment variable (useful with | iex one-liner)
if ($Version -eq "" -and $env:MAGE_VERSION) { $Version = $env:MAGE_VERSION }
$Version = $Version -replace '^v', ''

if ($Help) {
    Write-Host @"
Mage Installer

Usage: .\install.ps1 [options]

Options:
    -Help                    Display this help message
    -Version <version>       Install a specific version (e.g. 1.2.2)
    -NoConfig                Skip .npmrc configuration (assumes registry is already configured)

One-liner:
    irm https://mage.apps.ocpdevgra.dti.co.id/install.ps1 | iex

With a version pin (pipe form):
    `$env:MAGE_VERSION='1.2.2'; irm https://mage.apps.ocpdevgra.dti.co.id/install.ps1 | iex

Direct file:
    .\install.ps1
    .\install.ps1 -Version 1.2.2
"@
    exit 0
}

# ── helpers ──────────────────────────────────────────────────────────────────

function Test-Cmd($name) {
    $null -ne (Get-Command $name -ErrorAction SilentlyContinue)
}

function Write-Info($msg)    { Write-Host $msg -ForegroundColor DarkGray }
function Write-Ok($msg)      { Write-Host $msg -ForegroundColor Green }
function Write-Warn($msg)    { Write-Host $msg -ForegroundColor Yellow }
function Write-Err($msg)     { Write-Host $msg -ForegroundColor Red }

# ── 1. Prerequisites ─────────────────────────────────────────────────────────

if (-not (Test-Cmd "node")) {
    Write-Err "Error: Node.js is not installed or not on PATH."
    Write-Host "Mage requires Node.js >= 18. Download it from:"
    Write-Host "  https://nodejs.org/en/download"
    exit 1
}

if (-not (Test-Cmd "npm")) {
    Write-Err "Error: npm is not installed or not on PATH."
    Write-Host "npm ships with Node.js. Download it from:"
    Write-Host "  https://nodejs.org/en/download"
    exit 1
}

$nodeVer   = (node --version 2>$null) -replace '^v', ''
$nodeMajor = [int](($nodeVer -split '\.')[0])
if ($nodeMajor -lt 18) {
    Write-Warn "Warning: Node.js $nodeVer detected; Mage recommends Node >= 18."
    Write-Info "Upgrade at https://nodejs.org/en/download"
}

# ── 2. Configure %USERPROFILE%\.npmrc (idempotent) ───────────────────────────

if (-not $NoConfig) {
    $npmrcPath   = Join-Path $env:USERPROFILE ".npmrc"
    $markerStart = "# >>> mage >>>"
    $markerEnd   = "# <<< mage <<<"

    $block = @"
$markerStart
@mybcabisnis:registry=$REGISTRY
noproxy[]=artifactory.intra.bca.co.id
strict-ssl=false
//artifactory.intra.bca.co.id/artifactory/api/npm/MBB-Registry-npm/:_auth=dXNlcm1iYjpCY2FiY2ExMjM=
$markerEnd
"@

    # Read existing file (if any) and strip the managed block
    $kept = [System.Collections.Generic.List[string]]::new()
    if (Test-Path $npmrcPath) {
        $lines = [IO.File]::ReadAllLines($npmrcPath, [System.Text.Encoding]::UTF8)
        $inBlock = $false
        foreach ($line in $lines) {
            if ($line -eq $markerStart) { $inBlock = $true;  continue }
            if ($line -eq $markerEnd)   { $inBlock = $false; continue }
            if (-not $inBlock) { $kept.Add($line) }
        }
    }

    # Build new content: preserved lines + blank separator + managed block
    $base = ($kept | Where-Object { $_ -ne $null }) -join "`n"
    $base = $base.TrimEnd()
    $newContent = if ($base.Length -gt 0) { $base + "`n`n" + $block + "`n" } `
                  else                    { $block + "`n" }

    # Write UTF-8 without BOM (npm rejects a BOM'd .npmrc)
    $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
    [IO.File]::WriteAllText($npmrcPath, $newContent, $utf8NoBom)

    Write-Info "Artifactory registry configured in $npmrcPath"
}

# ── 3. Install ───────────────────────────────────────────────────────────────

$pkg = if ($Version -ne "") { "$PACKAGE@$Version" } else { $PACKAGE }

Write-Host ""
Write-Info "Installing $pkg ..."
Write-Host ""
npm install -g $pkg

# ── 4. Verify & banner ───────────────────────────────────────────────────────

$installedVersion = ""
if (Test-Cmd "mage") {
    $installedVersion = (mage --version 2>$null) -join ""
}

if ($installedVersion -ne "") {
    Write-Ok "Mage $installedVersion installed successfully"
    Write-Host ""
    Write-Info "Get started:"
    Write-Host ""
    Write-Host "  cd <your-project>"
    Write-Host "  mage"
    Write-Host ""
} else {
    Write-Ok "Mage installed"
    Write-Host ""
    $npmBin = "$(npm prefix -g 2>$null)" -replace '/', '\'
    Write-Warn "Note: 'mage' was not found on PATH."
    Write-Info "Add the npm global bin directory to your PATH:"
    Write-Host ""
    Write-Host "  [Environment]::SetEnvironmentVariable('PATH', `"$npmBin;`$env:PATH`", 'User')"
    Write-Host ""
    Write-Info "Then open a new terminal and run:  mage"
    Write-Host ""
}
