param(
    [Parameter(Mandatory = $true)]
    [string]$RunId
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\lib.ps1"

Initialize-KpiProduction -RunId $RunId
Assert-KpiRunDirectory
Assert-KpiMarker "06-verification.ok"
Assert-KpiPm2Service
$pm2 = Get-KpiNativeCommand "pm2"

Write-Host "Step 07: start the new production service"
Invoke-KpiNativeCommand `
    -FilePath $pm2 `
    -ArgumentList @("restart", $script:KpiPm2ServiceName, "--update-env")

$loginStatus = 0
for ($attempt = 1; $attempt -le 30; $attempt++) {
    $loginStatus = Get-KpiHttpStatus "$script:KpiAppUrl/login"
    if ($loginStatus -eq 200) {
        break
    }
    Start-Sleep -Seconds 1
}
if ($loginStatus -ne 200) {
    Stop-KpiMigration "Login page did not become healthy: HTTP $loginStatus"
}

$kpiStatus = Get-KpiHttpStatus "$script:KpiAppUrl/kpi"
$organizationStatus = Get-KpiHttpStatus "$script:KpiAppUrl/organization"
if ($kpiStatus -notin @(302, 307)) {
    Stop-KpiMigration "Protected KPI route returned unexpected HTTP status: $kpiStatus"
}
if ($organizationStatus -notin @(302, 307)) {
    Stop-KpiMigration "Protected organization route returned unexpected HTTP status: $organizationStatus"
}

@(
    "login=$loginStatus"
    "kpi=$kpiStatus"
    "organization=$organizationStatus"
    "checkedAt=$([DateTime]::UtcNow.ToString("o"))"
) | Set-Content -LiteralPath $script:KpiSmokeReport -Encoding UTF8

Write-KpiMarker "07-service-and-smoke.ok"
Write-Host "Step 07 completed: application smoke test passed"
