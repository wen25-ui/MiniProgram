# Local API launcher. The database is remote MySQL.
#
# 启动方式（在 server 目录中执行）：
# powershell -ExecutionPolicy Bypass -File .\start-local.ps1
#
# 从项目根目录执行：
# powershell -ExecutionPolicy Bypass -File .\server\start-local.ps1

$ErrorActionPreference = 'Stop'
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptRoot

$apiPort = 3000
$listenerProcessIds = @(Get-NetTCPConnection -LocalPort $apiPort -State Listen -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique)

if ($listenerProcessIds.Count -gt 0) {
  Write-Host "Stopping existing API process(es) on port ${apiPort}: $($listenerProcessIds -join ', ')" -ForegroundColor Yellow
  Stop-Process -Id $listenerProcessIds -Force

  for ($attempt = 1; $attempt -le 20; $attempt++) {
    $remainingListeners = @(Get-NetTCPConnection -LocalPort $apiPort -State Listen -ErrorAction SilentlyContinue)
    if ($remainingListeners.Count -eq 0) { break }
    Start-Sleep -Milliseconds 250
  }

  if (@(Get-NetTCPConnection -LocalPort $apiPort -State Listen -ErrorAction SilentlyContinue).Count -gt 0) {
    throw "Port $apiPort is still in use; unable to start the API service."
  }
}

$env:DB_HOST = if ($env:DB_HOST) { $env:DB_HOST } else { 'mysql6.sqlpub.com' }
$env:DB_PORT = if ($env:DB_PORT) { $env:DB_PORT } else { '3311' }
$env:DB_NAME = if ($env:DB_NAME) { $env:DB_NAME } else { 'wx_xcxkf' }
$env:LOCAL_PROVINCE = if ($env:LOCAL_PROVINCE) { $env:LOCAL_PROVINCE } else { '广东' }
$env:LOCAL_CITY = if ($env:LOCAL_CITY) { $env:LOCAL_CITY } else { '深圳' }
$env:DB_USER = if ($env:DB_USER) { $env:DB_USER } else { 'gongbw' }
if (-not $env:DB_PASSWORD) {
  throw 'DB_PASSWORD is required. Set it in the current PowerShell session before starting the API.'
}

if (-not (Test-Path 'node_modules')) {
  npm install
}

$ErrorActionPreference = 'Continue'
node -e "require('mysql2/promise')" 2>$null
$driverExitCode = $LASTEXITCODE
$ErrorActionPreference = 'Stop'
if ($driverExitCode -ne 0) {
  Write-Host 'MySQL driver is invalid. Reinstalling dependencies...' -ForegroundColor Yellow
  Remove-Item -Recurse -Force 'node_modules'
  npm cache clean --force
  npm install --force
}

$env:API_HOST = '0.0.0.0'
$lanIps = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' -and $_.AddressState -eq 'Preferred' } |
  Select-Object -ExpandProperty IPAddress -Unique)

Write-Host "Starting API: http://127.0.0.1:$apiPort" -ForegroundColor Green
foreach ($lanIp in $lanIps) {
  Write-Host "Real-device LAN API: http://${lanIp}:$apiPort" -ForegroundColor Cyan
}
npm run migrate
npm start
