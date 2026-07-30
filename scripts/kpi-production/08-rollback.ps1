param(
    [Parameter(Mandatory = $true)]
    [string]$RunId,
    [switch]$Execute,
    [string]$Confirm
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\lib.ps1"

Initialize-KpiProduction -RunId $RunId
Assert-KpiRunDirectory
Assert-KpiMarker "04-migration.ok"
Assert-KpiPm2Service

if (-not $Execute -or $Confirm -ne "ROLLBACK_KPI_PRODUCTION") {
    Write-Host "Rollback dry-run"
    Write-Host "Database to restore: $script:KpiMigrationBackup"
    Write-Host "Current database: $script:KpiProdDb"
    Write-Host "Failed database evidence path: $script:KpiFailedDatabase"
    Write-Host ""
    Write-Host "Execute with:"
    Write-Host (
        ".\scripts\kpi-production\08-rollback.ps1 " +
        "-RunId $script:KpiRunId -Execute " +
        "-Confirm ROLLBACK_KPI_PRODUCTION"
    )
    return
}

if (-not (Test-Path -LiteralPath $script:KpiMigrationBackup -PathType Leaf)) {
    Stop-KpiMigration "Migration backup not found: $script:KpiMigrationBackup"
}
if (Test-Path -LiteralPath $script:KpiFailedDatabase) {
    Stop-KpiMigration "Failed database evidence already exists: $script:KpiFailedDatabase"
}
if ([string]::IsNullOrWhiteSpace($env:KPI_ROLLBACK_CODE_COMMAND)) {
    if (-not (Test-Path -LiteralPath $script:KpiPreviousNext -PathType Container)) {
        Stop-KpiMigration (
            "Previous .next build backup is missing and " +
            "KPI_ROLLBACK_CODE_COMMAND is not configured."
        )
    }
    $prismaRollbackDirectories = @(
        @{
            Current = Join-Path $script:KpiProjectDir "node_modules\@prisma\client"
            Backup = $script:KpiPreviousPrismaClient
            Failed = $script:KpiFailedPrismaClient
            Label = "@prisma/client"
        },
        @{
            Current = Join-Path $script:KpiProjectDir "node_modules\.prisma\client"
            Backup = $script:KpiPreviousPrismaGenerated
            Failed = $script:KpiFailedPrismaGenerated
            Label = ".prisma/client"
        }
    )
    foreach ($directory in $prismaRollbackDirectories) {
        if (-not (Test-Path -LiteralPath $directory.Backup -PathType Container)) {
            Stop-KpiMigration "Previous $($directory.Label) backup not found: $($directory.Backup)"
        }
        if (Test-Path -LiteralPath $directory.Failed) {
            Stop-KpiMigration "Failed $($directory.Label) evidence already exists: $($directory.Failed)"
        }
    }
}

$pm2 = Get-KpiNativeCommand "pm2"
$npm = Get-KpiNativeCommand "npm"
$cmd = Get-KpiNativeCommand "cmd"

Write-Host "Step 08: stop the new service"
Invoke-KpiNativeCommand `
    -FilePath $pm2 `
    -ArgumentList @("stop", $script:KpiPm2ServiceName)
Wait-KpiDatabaseRelease

Write-Host "Step 08: verify the rollback database backup"
Invoke-KpiNativeCommand `
    -FilePath $npm `
    -ArgumentList @(
        "run", "kpi:migration:preflight", "--",
        "--database", $script:KpiMigrationBackup,
        "--output", (Join-Path $script:KpiRunDir "08-backup-preflight.json")
    )

Write-Host "Step 08: preserve the failed database and restore the old database"
foreach ($suffix in @("", "-wal", "-shm")) {
    $sourcePath = "$($script:KpiProdDb)$suffix"
    if (Test-Path -LiteralPath $sourcePath -PathType Leaf) {
        $evidencePath = "$($script:KpiFailedDatabase)$suffix"
        Move-Item -LiteralPath $sourcePath -Destination $evidencePath
    }
}
Copy-Item `
    -LiteralPath $script:KpiMigrationBackup `
    -Destination $script:KpiProdDb

Write-Host "Step 08: restore the previous application release"
if (-not [string]::IsNullOrWhiteSpace($env:KPI_ROLLBACK_CODE_COMMAND)) {
    Invoke-KpiNativeCommand `
        -FilePath $cmd `
        -ArgumentList @("/d", "/s", "/c", $env:KPI_ROLLBACK_CODE_COMMAND)
}
else {
    $currentNext = Join-Path $script:KpiProjectDir ".next"
    if (Test-Path -LiteralPath $script:KpiFailedNext) {
        Stop-KpiMigration "Failed .next evidence already exists: $script:KpiFailedNext"
    }
    if (Test-Path -LiteralPath $currentNext -PathType Container) {
        Move-Item -LiteralPath $currentNext -Destination $script:KpiFailedNext
    }
    Copy-Item `
        -LiteralPath $script:KpiPreviousNext `
        -Destination $currentNext `
        -Recurse

    foreach ($directory in $prismaRollbackDirectories) {
        if (Test-Path -LiteralPath $directory.Current -PathType Container) {
            Move-Item -LiteralPath $directory.Current -Destination $directory.Failed
        }
        Copy-Item `
            -LiteralPath $directory.Backup `
            -Destination $directory.Current `
            -Recurse
    }
}

Write-Host "Step 08: verify the restored database"
Invoke-KpiNativeCommand `
    -FilePath $npm `
    -ArgumentList @(
        "run", "kpi:migration:preflight", "--",
        "--database", $script:KpiProdDb,
        "--output", (Join-Path $script:KpiRunDir "08-restored-preflight.json")
    )

Write-Host "Step 08: start the previous application release"
Invoke-KpiNativeCommand `
    -FilePath $pm2 `
    -ArgumentList @("restart", $script:KpiPm2ServiceName, "--update-env")

Write-KpiMarker "08-rollback.ok"
Write-Host "Step 08 completed: database and application rollback executed"
