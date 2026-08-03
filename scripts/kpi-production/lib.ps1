Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Net.Http

$script:KpiProductionScriptDir = $PSScriptRoot
$script:KpiProjectDir = [System.IO.Path]::GetFullPath(
    (Join-Path $PSScriptRoot "..\..")
)

function Stop-KpiMigration {
    param([Parameter(Mandatory = $true)][string]$Message)
    throw $Message
}

function Get-KpiNativeCommand {
    param([Parameter(Mandatory = $true)][string]$Name)

    foreach ($candidate in @("$Name.cmd", "$Name.exe", $Name)) {
        $command = Get-Command $candidate -ErrorAction SilentlyContinue
        if ($null -ne $command) {
            return $command.Source
        }
    }
    Stop-KpiMigration "Required command not found: $Name"
}

function Invoke-KpiNativeCommand {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][string[]]$ArgumentList,
        [string]$LogPath,
        [switch]$Append
    )

    $previousErrorAction = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        if ([string]::IsNullOrWhiteSpace($LogPath)) {
            & $FilePath @ArgumentList
        }
        elseif ($Append) {
            & $FilePath @ArgumentList 2>&1 |
                Tee-Object -FilePath $LogPath -Append
        }
        else {
            & $FilePath @ArgumentList 2>&1 |
                Tee-Object -FilePath $LogPath
        }
    }
    finally {
        $ErrorActionPreference = $previousErrorAction
    }

    if ($LASTEXITCODE -ne 0) {
        Stop-KpiMigration (
            "Command failed with exit code {0}: {1} {2}" -f
            $LASTEXITCODE,
            $FilePath,
            ($ArgumentList -join " ")
        )
    }
}

function ConvertTo-KpiNormalizedPath {
    param([Parameter(Mandatory = $true)][string]$Path)
    return [System.IO.Path]::GetFullPath($Path).TrimEnd("\", "/").ToLowerInvariant()
}

function Get-KpiDepotProdBash {
    foreach ($candidate in @(
        "C:\Program Files\Git\bin\bash.exe",
        "C:\Program Files (x86)\Git\bin\bash.exe"
    )) {
        if (Test-Path -LiteralPath $candidate -PathType Leaf) {
            return $candidate
        }
    }
    Stop-KpiMigration "Git Bash not found; depot-prod.sh requires bash.exe"
}

function Resolve-KpiServiceMode {
    if ($env:KPI_SERVICE_MODE -eq "pm2" -or $env:KPI_SERVICE_MODE -eq "depot-prod") {
        return $env:KPI_SERVICE_MODE
    }
    $pm2 = Get-Command "pm2" -ErrorAction SilentlyContinue
    if ($null -ne $pm2) {
        return "pm2"
    }
    return "depot-prod"
}

function Resolve-KpiPm2ServiceName {
    if (-not [string]::IsNullOrWhiteSpace($env:KPI_PM2_SERVICE_NAME)) {
        return $env:KPI_PM2_SERVICE_NAME
    }

    $pm2 = Get-KpiNativeCommand "pm2"
    $rawJson = (& $pm2 jlist 2>$null) -join [Environment]::NewLine
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($rawJson)) {
        Stop-KpiMigration "Unable to read PM2 process list with 'pm2 jlist'."
    }

    try {
        $processes = @($rawJson | ConvertFrom-Json)
    }
    catch {
        Stop-KpiMigration "Unable to parse JSON returned by 'pm2 jlist': $($_.Exception.Message)"
    }

    $projectPath = ConvertTo-KpiNormalizedPath $script:KpiProjectDir
    $matches = @(
        $processes | Where-Object {
            $cwd = [string]$_.pm2_env.pm_cwd
            if ([string]::IsNullOrWhiteSpace($cwd)) {
                $false
            }
            else {
                try {
                    (ConvertTo-KpiNormalizedPath $cwd) -eq $projectPath
                }
                catch {
                    $false
                }
            }
        }
    )

    if ($matches.Count -gt 1) {
        $preferred = @(
            $matches | Where-Object {
                $arguments = @($_.pm2_env.args) -join " "
                $_.name -eq "department-management" -or
                    $arguments -match "start:office"
            }
        )
        if ($preferred.Count -eq 1) {
            $matches = $preferred
        }
    }

    if ($matches.Count -ne 1) {
        $candidateNames = @($matches | ForEach-Object { [string]$_.name })
        $candidateText = if ($candidateNames.Count -gt 0) {
            $candidateNames -join ", "
        }
        else {
            "none"
        }
        $message = (
            "Could not uniquely identify the PM2 process for {0}. Candidates: {1}. " +
            "Run 'pm2 list', then set `$env:KPI_PM2_SERVICE_NAME to the correct name."
        ) -f $script:KpiProjectDir, $candidateText
        Stop-KpiMigration $message
    }

    return [string]$matches[0].name
}

function Initialize-KpiProduction {
    param([Parameter(Mandatory = $true)][string]$RunId)

    if ($RunId -notmatch "^[A-Za-z0-9][A-Za-z0-9._-]*$") {
        Stop-KpiMigration "Invalid migration run ID: $RunId"
    }

    $script:KpiRunId = $RunId
    $script:KpiProdDb = [System.IO.Path]::GetFullPath(
        (Join-Path $script:KpiProjectDir "db\dev.db")
    )
    $projectParent = Split-Path -Parent $script:KpiProjectDir
    $script:KpiBackupRoot = [System.IO.Path]::GetFullPath(
        (Join-Path $projectParent "depot-kpi-backups")
    )
    $script:KpiAppUrl = if (
        [string]::IsNullOrWhiteSpace($env:KPI_APP_URL)
    ) {
        "http://depot.rj-info.com"
    }
    else {
        $env:KPI_APP_URL.TrimEnd("/")
    }
    $script:KpiServiceMode = Resolve-KpiServiceMode
    $script:KpiPm2ServiceName = if ($script:KpiServiceMode -eq "pm2") {
        Resolve-KpiPm2ServiceName
    }
    else {
        "depot-prod"
    }
    $script:KpiDepotProdScript = Join-Path $script:KpiProjectDir "scripts\depot-prod.sh"

    if (-not (Test-Path -LiteralPath $script:KpiProdDb -PathType Leaf)) {
        Stop-KpiMigration "Production database not found: $script:KpiProdDb"
    }
    if (-not (Test-Path -LiteralPath (Join-Path $script:KpiProjectDir "package.json") -PathType Leaf)) {
        Stop-KpiMigration "Project package.json not found: $script:KpiProjectDir"
    }
    if (-not (Test-Path -LiteralPath $script:KpiBackupRoot -PathType Container)) {
        New-Item -ItemType Directory -Path $script:KpiBackupRoot | Out-Null
    }

    $script:KpiRunDir = Join-Path $script:KpiBackupRoot "kpi-migration-$script:KpiRunId"
    $script:KpiPreflightReport = Join-Path $script:KpiRunDir "01-preflight.json"
    $script:KpiPreflightLog = Join-Path $script:KpiRunDir "01-preflight.log"
    $script:KpiBuildLog = Join-Path $script:KpiRunDir "03-build.log"
    $script:KpiPreviousNext = Join-Path $script:KpiRunDir "03-next-before-release"
    $script:KpiPreviousPrismaClient = Join-Path $script:KpiRunDir "03-prisma-client-before-release"
    $script:KpiPreviousPrismaGenerated = Join-Path $script:KpiRunDir "03-prisma-generated-before-release"
    $script:KpiMigrationBackup = Join-Path $script:KpiRunDir "04-prod-before-kpi.db"
    $script:KpiBaselineReport = Join-Path $script:KpiRunDir "04-preservation-baseline.json"
    $script:KpiMigrationResult = Join-Path $script:KpiRunDir "04-migration-result.json"
    $script:KpiAlignLog = Join-Path $script:KpiRunDir "05-align.log"
    $script:KpiVerifyReport = Join-Path $script:KpiRunDir "06-verification.json"
    $script:KpiVerifyLog = Join-Path $script:KpiRunDir "06-verification.log"
    $script:KpiSmokeReport = Join-Path $script:KpiRunDir "07-smoke.txt"
    $script:KpiFailedDatabase = Join-Path $script:KpiRunDir "08-failed-after-migration.db"
    $script:KpiFailedNext = Join-Path $script:KpiRunDir "08-failed-next"
    $script:KpiFailedPrismaClient = Join-Path $script:KpiRunDir "08-failed-prisma-client"
    $script:KpiFailedPrismaGenerated = Join-Path $script:KpiRunDir "08-failed-prisma-generated"

    Set-Location $script:KpiProjectDir
}

function Assert-KpiRunDirectory {
    if (-not (Test-Path -LiteralPath $script:KpiRunDir -PathType Container)) {
        Stop-KpiMigration (
            "Run directory does not exist. Execute 01-preflight.ps1 first: " +
            $script:KpiRunDir
        )
    }
}

function Assert-KpiMarker {
    param([Parameter(Mandatory = $true)][string]$Name)
    $markerPath = Join-Path $script:KpiRunDir $Name
    if (-not (Test-Path -LiteralPath $markerPath -PathType Leaf)) {
        Stop-KpiMigration "Required previous step is incomplete: $Name"
    }
}

function Write-KpiMarker {
    param([Parameter(Mandatory = $true)][string]$Name)
    $markerPath = Join-Path $script:KpiRunDir $Name
    [DateTime]::UtcNow.ToString("o") |
        Set-Content -LiteralPath $markerPath -Encoding UTF8
}

function Assert-KpiPm2Service {
    if ($script:KpiServiceMode -ne "pm2") {
        return
    }
    $pm2 = Get-KpiNativeCommand "pm2"
    & $pm2 describe $script:KpiPm2ServiceName *> $null
    if ($LASTEXITCODE -ne 0) {
        Stop-KpiMigration "PM2 service not found: $script:KpiPm2ServiceName"
    }
}

function Stop-KpiProductionService {
    if ($script:KpiServiceMode -eq "pm2") {
        Assert-KpiPm2Service
        $pm2 = Get-KpiNativeCommand "pm2"
        Invoke-KpiNativeCommand `
            -FilePath $pm2 `
            -ArgumentList @("stop", $script:KpiPm2ServiceName)
        return
    }

    $bash = Get-KpiDepotProdBash
    Invoke-KpiNativeCommand `
        -FilePath $bash `
        -ArgumentList @($script:KpiDepotProdScript, "stop")
}

function Start-KpiProductionService {
    if ($script:KpiServiceMode -eq "pm2") {
        Assert-KpiPm2Service
        $pm2 = Get-KpiNativeCommand "pm2"
        Invoke-KpiNativeCommand `
            -FilePath $pm2 `
            -ArgumentList @("restart", $script:KpiPm2ServiceName, "--update-env")
        return
    }

    $bash = Get-KpiDepotProdBash
    Invoke-KpiNativeCommand `
        -FilePath $bash `
        -ArgumentList @($script:KpiDepotProdScript, "start")
}

function Test-KpiFileUnlocked {
    param([Parameter(Mandatory = $true)][string]$Path)
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        return $true
    }
    try {
        $stream = [System.IO.File]::Open(
            $Path,
            [System.IO.FileMode]::Open,
            [System.IO.FileAccess]::ReadWrite,
            [System.IO.FileShare]::None
        )
        $stream.Dispose()
        return $true
    }
    catch {
        return $false
    }
}

function Test-KpiDatabaseReleased {
    foreach ($path in @(
        $script:KpiProdDb,
        "$($script:KpiProdDb)-wal",
        "$($script:KpiProdDb)-shm"
    )) {
        if (-not (Test-KpiFileUnlocked $path)) {
            return $false
        }
    }
    return $true
}

function Wait-KpiDatabaseRelease {
    for ($attempt = 1; $attempt -le 30; $attempt++) {
        if (Test-KpiDatabaseReleased) {
            return
        }
        Start-Sleep -Seconds 1
    }
    Stop-KpiMigration "Database is still open after service stop: $script:KpiProdDb"
}

function Get-KpiHttpStatus {
    param([Parameter(Mandatory = $true)][string]$Url)
    $handler = New-Object System.Net.Http.HttpClientHandler
    $handler.AllowAutoRedirect = $false
    $client = [System.Net.Http.HttpClient]::new($handler)
    $client.Timeout = [TimeSpan]::FromSeconds(10)
    try {
        $response = $client.GetAsync($Url).GetAwaiter().GetResult()
        try {
            return [int]$response.StatusCode
        }
        finally {
            $response.Dispose()
        }
    }
    catch {
        return 0
    }
    finally {
        $client.Dispose()
        $handler.Dispose()
    }
}

function Write-KpiRunSummary {
    Write-Host "Project: $script:KpiProjectDir"
    Write-Host "Database: $script:KpiProdDb"
    Write-Host "Backup directory: $script:KpiRunDir"
    Write-Host "Service mode: $script:KpiServiceMode"
    Write-Host "Service name: $script:KpiPm2ServiceName"
    Write-Host "Application URL: $script:KpiAppUrl"
}
