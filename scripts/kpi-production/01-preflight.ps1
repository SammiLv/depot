param(
    [Parameter(Mandatory = $true)]
    [string]$RunId
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\lib.ps1"

Initialize-KpiProduction -RunId $RunId
$npm = Get-KpiNativeCommand "npm"

if (Test-Path -LiteralPath $script:KpiRunDir) {
    Stop-KpiMigration "Run directory already exists; use a new run ID: $script:KpiRunDir"
}
New-Item -ItemType Directory -Path $script:KpiRunDir | Out-Null

Write-KpiRunSummary
Write-Host "Step 01: read-only production preflight"
Invoke-KpiNativeCommand `
    -FilePath $npm `
    -ArgumentList @(
        "run", "kpi:migration:preflight", "--",
        "--database", $script:KpiProdDb,
        "--output", $script:KpiPreflightReport
    ) `
    -LogPath $script:KpiPreflightLog

Write-Host ""
Write-Host "Step 01: migration dry-run"
Invoke-KpiNativeCommand `
    -FilePath $npm `
    -ArgumentList @(
        "run", "kpi:migration:run", "--",
        "--database", $script:KpiProdDb
    ) `
    -LogPath $script:KpiPreflightLog `
    -Append

Write-KpiMarker "01-preflight.ok"
Write-Host "Step 01 completed: $script:KpiPreflightReport"
