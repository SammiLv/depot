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
$npm = Get-KpiNativeCommand "npm"

Write-Host "Step 03: prepare and build the new release"
$currentNext = Join-Path $script:KpiProjectDir ".next"
if (-not (Test-Path -LiteralPath $currentNext -PathType Container)) {
    Stop-KpiMigration (
        "Existing .next production build not found. " +
        "Automatic application rollback cannot be prepared."
    )
}
if (Test-Path -LiteralPath $script:KpiPreviousNext) {
    Stop-KpiMigration "Previous .next backup already exists: $script:KpiPreviousNext"
}
$prismaRollbackDirectories = @(
    @{
        Source = Join-Path $script:KpiProjectDir "node_modules\@prisma\client"
        Backup = $script:KpiPreviousPrismaClient
        Label = "@prisma/client"
    },
    @{
        Source = Join-Path $script:KpiProjectDir "node_modules\.prisma\client"
        Backup = $script:KpiPreviousPrismaGenerated
        Label = ".prisma/client"
    }
)
foreach ($directory in $prismaRollbackDirectories) {
    if (-not (Test-Path -LiteralPath $directory.Source -PathType Container)) {
        Stop-KpiMigration "Existing $($directory.Label) not found: $($directory.Source)"
    }
    if (Test-Path -LiteralPath $directory.Backup) {
        Stop-KpiMigration "Previous $($directory.Label) backup already exists: $($directory.Backup)"
    }
}

Write-Host "Step 03: preserve the currently running .next build for rollback"
Copy-Item `
    -LiteralPath $currentNext `
    -Destination $script:KpiPreviousNext `
    -Recurse
foreach ($directory in $prismaRollbackDirectories) {
    Write-Host "Step 03: preserve $($directory.Label) for rollback"
    Copy-Item `
        -LiteralPath $directory.Source `
        -Destination $directory.Backup `
        -Recurse
}

if (-not [string]::IsNullOrWhiteSpace($env:KPI_INSTALL_COMMAND)) {
    $cmd = Get-KpiNativeCommand "cmd"
    Write-Host "Running configured install command"
    Invoke-KpiNativeCommand `
        -FilePath $cmd `
        -ArgumentList @("/d", "/s", "/c", $env:KPI_INSTALL_COMMAND) `
        -LogPath $script:KpiBuildLog
}

$appendBuildLog = Test-Path -LiteralPath $script:KpiBuildLog
Invoke-KpiNativeCommand `
    -FilePath $npm `
    -ArgumentList @("run", "prisma:generate") `
    -LogPath $script:KpiBuildLog `
    -Append:$appendBuildLog
Invoke-KpiNativeCommand `
    -FilePath $npm `
    -ArgumentList @("run", "build") `
    -LogPath $script:KpiBuildLog `
    -Append

Write-KpiMarker "03-build.ok"
Write-Host "Step 03 completed"
