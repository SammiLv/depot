Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\lib.ps1"

$pm2 = Get-KpiNativeCommand "pm2"
$npm = Get-KpiNativeCommand "npm"
$node = Get-KpiNativeCommand "node"
$expectedDatabase = Join-Path $script:KpiProjectDir "db\dev.db"

if (-not (Test-Path -LiteralPath $expectedDatabase -PathType Leaf)) {
    Stop-KpiMigration "Production database not found: $expectedDatabase"
}

Write-Host "Project: $script:KpiProjectDir"
Write-Host "Expected database: $expectedDatabase"
Write-Host "Expected backup root: $(Join-Path (Split-Path -Parent $script:KpiProjectDir) 'depot-kpi-backups')"
Write-Host "Node: $(& $node --version)"
Write-Host "NPM: $(& $npm --version)"
Write-Host ""
Write-Host "PM2 process list:"
& $pm2 list
if ($LASTEXITCODE -ne 0) {
    Stop-KpiMigration "'pm2 list' failed."
}

$serviceName = Resolve-KpiPm2ServiceName
Write-Host ""
Write-Host "Detected PM2 service: $serviceName"
Write-Host "Environment check completed."
