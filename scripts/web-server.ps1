param(
    [ValidateSet('Start', 'Run', 'Install', 'Uninstall', 'Status')]
    [string]$Action = 'Start',
    [string]$NodePath
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$vite = Join-Path $projectRoot 'node_modules\vite\bin\vite.js'
$logRoot = Join-Path $projectRoot '.cache\web-server'
$runKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$runName = 'EasySIM-Web-5173'
$url = 'http://127.0.0.1:5173/'
$powershell = Join-Path $PSHOME 'powershell.exe'

function Test-WebServer {
    try {
        $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2
        return $response.StatusCode -eq 200 -and $response.Content -match 'EasySIM'
    } catch {
        return $false
    }
}

function Get-LaunchArguments {
    return "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$PSCommandPath`" -Action Run -NodePath `"$NodePath`""
}

function Write-ServerLog([string]$Message) {
    $path = Join-Path $logRoot 'supervisor.log'
    if ((Test-Path -LiteralPath $path) -and (Get-Item -LiteralPath $path).Length -gt 5MB) {
        Move-Item -LiteralPath $path -Destination "$path.previous" -Force
    }
    Add-Content -LiteralPath $path -Encoding UTF8 -Value "$(Get-Date -Format o) $Message"
}

if ($Action -eq 'Uninstall') {
    Remove-ItemProperty -LiteralPath $runKey -Name $runName -ErrorAction SilentlyContinue
    Write-Output 'EasySIM automatic startup disabled. The current web server is not stopped.'
    exit 0
}

if ($Action -eq 'Status') {
    $startup = Get-ItemPropertyValue -LiteralPath $runKey -Name $runName -ErrorAction SilentlyContinue
    [pscustomobject]@{
        URL = $url
        Accessible = Test-WebServer
        AutomaticStartup = [bool]$startup
        Logs = $logRoot
    }
    exit 0
}

if (-not $NodePath) {
    $NodePath = (Get-Command node.exe -ErrorAction Stop).Source
}
if (-not (Test-Path -LiteralPath $NodePath -PathType Leaf)) {
    throw "Node.js not found: $NodePath"
}
if (-not (Test-Path -LiteralPath $vite -PathType Leaf)) {
    throw "Vite not found. Run npm install in $projectRoot first."
}
New-Item -ItemType Directory -Path $logRoot -Force | Out-Null

if ($Action -eq 'Install') {
    if (-not (Test-Path -LiteralPath $runKey)) {
        New-Item -Path $runKey -Force | Out-Null
    }
    $command = '"' + $powershell + '" ' + (Get-LaunchArguments)
    if ($command.Length -gt 260) {
        throw 'Startup command is too long. Move the project to a shorter path.'
    }
    New-ItemProperty -LiteralPath $runKey -Name $runName -PropertyType String -Value $command -Force | Out-Null
    Write-Output 'EasySIM will start in the background when this Windows user signs in.'
}

if ($Action -ne 'Run') {
    if (-not (Test-WebServer)) {
        Start-Process -FilePath $powershell -ArgumentList (Get-LaunchArguments) -WorkingDirectory $projectRoot -WindowStyle Hidden | Out-Null
        $deadline = (Get-Date).AddSeconds(60)
        while ((Get-Date) -lt $deadline) {
            Start-Sleep -Milliseconds 500
            if (Test-WebServer) { break }
        }
    }
    if (-not (Test-WebServer)) {
        throw "Web server not ready. Check logs in $logRoot"
    }
    Write-Output "EasySIM is available at $url"
    exit 0
}

$mutex = [Threading.Mutex]::new($false, 'Local\EasySIM-Web-5173')
$locked = $false
try {
    try { $locked = $mutex.WaitOne(0) }
    catch [Threading.AbandonedMutexException] { $locked = $true }
    if (-not $locked) { exit 0 }
    Write-ServerLog "Background supervisor started (PID $PID)."
    while ($true) {
        # Never terminate or displace another program already using the fixed port.
        $listener = Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue
        if ($listener) {
            Start-Sleep -Seconds 10
            continue
        }
        foreach ($name in @('stdout.log', 'stderr.log')) {
            $path = Join-Path $logRoot $name
            if ((Test-Path -LiteralPath $path) -and (Get-Item -LiteralPath $path).Length -gt 5MB) {
                Move-Item -LiteralPath $path -Destination "$path.previous" -Force
            }
        }
        try {
            $server = Start-Process -FilePath $NodePath `
                -ArgumentList @("`"$vite`"", '--host', '127.0.0.1', '--port', '5173', '--strictPort') `
                -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru `
                -RedirectStandardOutput (Join-Path $logRoot 'stdout.log') `
                -RedirectStandardError (Join-Path $logRoot 'stderr.log')
            Write-ServerLog "Web server started (PID $($server.Id))."
            $server.WaitForExit()
            Write-ServerLog "Web server exited with code $($server.ExitCode); retrying in 5 seconds."
        } catch {
            Write-ServerLog "Start failed: $($_.Exception.Message); retrying in 5 seconds."
        }
        Start-Sleep -Seconds 5
    }
} finally {
    if ($locked) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
