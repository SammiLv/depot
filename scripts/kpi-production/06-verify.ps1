param(
    [Parameter(Mandatory = $true)]
    [string]$RunId
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\lib.ps1"

Initialize-KpiProduction -RunId $RunId
Assert-KpiRunDirectory
Assert-KpiMarker "05-history-and-deploy.ok"
$npm = Get-KpiNativeCommand "npm"

Write-Host "Step 06: verify preserved data, cleared KPI data, schema, and migration history"
Invoke-KpiNativeCommand `
    -FilePath $npm `
    -ArgumentList @(
        "run", "kpi:migration:verify", "--",
        "--database", $script:KpiProdDb,
        "--baseline", $script:KpiBaselineReport,
        "--output", $script:KpiVerifyReport
    ) `
    -LogPath $script:KpiVerifyLog

Write-KpiMarker "06-verification.ok"
Write-Host "Step 06 completed: PASS"
