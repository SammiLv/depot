param(
    [Parameter(Mandatory = $true)]
    [string]$RunId
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\lib.ps1"

Initialize-KpiProduction -RunId $RunId
Assert-KpiRunDirectory
Assert-KpiMarker "04-migration.ok"
$npm = Get-KpiNativeCommand "npm"
$npx = Get-KpiNativeCommand "npx"

Write-Host "Step 05: align KPI migration history"
Invoke-KpiNativeCommand `
    -FilePath $npm `
    -ArgumentList @(
        "run", "kpi:migration:align", "--",
        "--database", $script:KpiProdDb,
        "--baseline", $script:KpiBaselineReport,
        "--execute",
        "--confirm", "ALIGN_KPI_MIGRATION_HISTORY"
    ) `
    -LogPath $script:KpiAlignLog

Write-Host ""
Write-Host "Step 05: apply and verify any remaining reviewed migrations"
$previousDatabaseUrl = $env:DATABASE_URL
try {
    $env:DATABASE_URL = "file:$script:KpiProdDb"
    Invoke-KpiNativeCommand `
        -FilePath $npx `
        -ArgumentList @(
            "prisma", "migrate", "deploy",
            "--config", "db/prisma.config.ts"
        ) `
        -LogPath $script:KpiAlignLog `
        -Append
    Invoke-KpiNativeCommand `
        -FilePath $npx `
        -ArgumentList @(
            "prisma", "migrate", "status",
            "--config", "db/prisma.config.ts"
        ) `
        -LogPath $script:KpiAlignLog `
        -Append
}
finally {
    $env:DATABASE_URL = $previousDatabaseUrl
}

Write-KpiMarker "05-history-and-deploy.ok"
Write-Host "Step 05 completed"
