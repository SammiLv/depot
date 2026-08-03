param(
    [Parameter(Mandatory = $true)]
    [string]$RunId
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\lib.ps1"

Initialize-KpiProduction -RunId $RunId
Assert-KpiRunDirectory
Assert-KpiMarker "01-preflight.ok"

Write-Host "Step 02: stop production writes before modifying build artifacts or data"
Stop-KpiProductionService
Wait-KpiDatabaseRelease

Write-KpiMarker "02-service-stopped.ok"
Write-Host "Step 02 completed: service stopped and database handles released"
