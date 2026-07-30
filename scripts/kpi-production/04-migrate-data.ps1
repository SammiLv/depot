param(
    [Parameter(Mandatory = $true)]
    [string]$RunId
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\lib.ps1"

Initialize-KpiProduction -RunId $RunId
Assert-KpiRunDirectory
Assert-KpiMarker "02-service-stopped.ok"
Assert-KpiMarker "03-build.ok"
if (-not (Test-KpiDatabaseReleased)) {
    Stop-KpiMigration "Database is open; migration is blocked: $script:KpiProdDb"
}
$npm = Get-KpiNativeCommand "npm"

Write-Host "Step 04: backup and migrate KPI data"
Invoke-KpiNativeCommand `
    -FilePath $npm `
    -ArgumentList @(
        "run", "kpi:migration:run", "--",
        "--database", $script:KpiProdDb,
        "--backup", $script:KpiMigrationBackup,
        "--baseline-out", $script:KpiBaselineReport,
        "--result-out", $script:KpiMigrationResult,
        "--execute",
        "--confirm", "RESET_KPI_DATA"
    )

Write-KpiMarker "04-migration.ok"
Write-Host "Step 04 completed"
