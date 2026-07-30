param(
    [Parameter(Mandatory = $true)]
    [string]$RunId,
    [switch]$Execute,
    [string]$Confirm
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\lib.ps1"

if (-not $Execute -or $Confirm -ne "PRODUCTION_KPI_MIGRATION") {
    Write-Host "Production KPI migration orchestrator"
    Write-Host ""
    Write-Host (
        "This command performs preflight, service stop, build, backup, " +
        "data migration, migration history alignment, verification, " +
        "service start, and smoke testing."
    )
    Write-Host ""
    Write-Host "Execute with:"
    Write-Host (
        ".\scripts\kpi-production\09-run-all.ps1 " +
        "-RunId $RunId -Execute -Confirm PRODUCTION_KPI_MIGRATION"
    )
    return
}

Initialize-KpiProduction -RunId $RunId

try {
    & "$PSScriptRoot\01-preflight.ps1" -RunId $RunId
    & "$PSScriptRoot\02-stop-service.ps1" -RunId $RunId
    & "$PSScriptRoot\03-build-release.ps1" -RunId $RunId
    & "$PSScriptRoot\04-migrate-data.ps1" -RunId $RunId
    & "$PSScriptRoot\05-align-and-deploy.ps1" -RunId $RunId
    & "$PSScriptRoot\06-verify.ps1" -RunId $RunId
    & "$PSScriptRoot\07-start-and-smoke.ps1" -RunId $RunId
}
catch {
    Write-Host ""
    Write-Warning "Production KPI migration stopped: $($_.Exception.Message)"
    if (
        (Test-Path -LiteralPath $script:KpiRunDir -PathType Container) -and
        (Test-Path -LiteralPath (Join-Path $script:KpiRunDir "02-service-stopped.ok"))
    ) {
        Write-Warning "The service was stopped. Review logs before taking action."
        if (Test-Path -LiteralPath (Join-Path $script:KpiRunDir "04-migration.ok")) {
            Write-Warning "Database migration started. Reviewed rollback command:"
            Write-Host (
                ".\scripts\kpi-production\08-rollback.ps1 " +
                "-RunId $RunId -Execute " +
                "-Confirm ROLLBACK_KPI_PRODUCTION"
            )
        }
        else {
            Write-Warning "Database migration has not started. Restart the old service with:"
            Write-Host "pm2 restart $script:KpiPm2ServiceName"
        }
    }
    throw
}

Write-Host ""
Write-Host "Production KPI migration completed successfully."
Write-Host "Run directory: $script:KpiRunDir"
Write-Host "Next manual actions:"
Write-Host "1. Configure KPI permissions"
Write-Host "2. Configure system and department approval policies"
Write-Host "3. Configure KPI templates and assignment scopes"
Write-Host "4. Reinitialize quarterly KPI"
