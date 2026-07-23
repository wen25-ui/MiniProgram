# Local API launcher. The database is remote MySQL.
#
# 启动方式（在 server 目录中执行）：
# powershell -ExecutionPolicy Bypass -File .\start-local.ps1
#
# 从项目根目录执行：
# powershell -ExecutionPolicy Bypass -File .\server\start-local.ps1

$ErrorActionPreference = 'Stop'
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptRoot
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
$env:LOCAL_AREA_CODE = '510100'
$env:DB_USER = if ($env:DB_USER) { $env:DB_USER } else { 'gongbw' }
$env:DB_PASSWORD = if ($env:DB_PASSWORD) { $env:DB_PASSWORD } else { 'szeyQss5AIaYPfdx' }

$phoneEnvPath = Join-Path $scriptRoot '.env.phone'
if (Test-Path -LiteralPath $phoneEnvPath) {
  foreach ($line in Get-Content -LiteralPath $phoneEnvPath) {
    if ($line -match '^([^#=]+)=(.*)$') { Set-Item -Path "Env:$($matches[1].Trim())" -Value $matches[2].Trim() }
  }
}
$env:PHONE_DB_PORT = if ($env:PHONE_DB_PORT) { $env:PHONE_DB_PORT } else { '4000' }

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
function Test-PrivateIpv4($ipAddress) {
  $parts = [string]$ipAddress -split '\.'
  if ($parts.Count -ne 4) { return $false }

  $octets = @()
  foreach ($part in $parts) {
    $value = 0
    if (-not [int]::TryParse($part, [ref]$value) -or $value -lt 0 -or $value -gt 255) { return $false }
    $octets += $value
  }

  return ($octets[0] -eq 10) -or
    ($octets[0] -eq 172 -and $octets[1] -ge 16 -and $octets[1] -le 31) -or
    ($octets[0] -eq 192 -and $octets[1] -eq 168)
}

$lanIps = @(Get-NetIPConfiguration -ErrorAction SilentlyContinue |
  Where-Object { $_.IPv4DefaultGateway -and $_.IPv4Address } |
  ForEach-Object { $_.IPv4Address.IPAddress } |
  Where-Object { Test-PrivateIpv4 $_ } |
  Select-Object -Unique)

if ($env:API_LAN_HOST) {
  if (-not (Test-PrivateIpv4 $env:API_LAN_HOST)) {
    throw 'API_LAN_HOST 必须是与手机同网段的私有 IPv4，例如 192.168.1.18。'
  }
  $lanHost = $env:API_LAN_HOST
} elseif ($lanIps.Count -gt 0) {
  $lanHost = $lanIps[0]
} else {
  throw '未检测到可用于真机调试的局域网 IPv4。请连接 Wi-Fi，或设置 API_LAN_HOST 后重新运行脚本。'
}

if ($lanIps.Count -gt 1 -and -not $env:API_LAN_HOST) {
  Write-Host "检测到多个局域网地址，当前使用 $lanHost。若手机无法访问，请设置 API_LAN_HOST 为与手机同网段的 IPv4 后重试。" -ForegroundColor Yellow
}

$apiConfigPath = Join-Path $projectRoot 'config\api.js'
$apiConfigContent = @"
// 由 server/start-local.ps1 在本机调试时自动更新。
// 真机必须与此地址处于同一局域网；生产环境必须改为已备案的 HTTPS 域名。
const lanHost = '$lanHost'

module.exports = {
  baseUrl: 'http://${lanHost}:$apiPort'
}
"@
$utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($apiConfigPath, $apiConfigContent, $utf8WithoutBom)

$firewallRuleName = "MiniProgram Local API $apiPort"
if (-not (Get-NetFirewallRule -DisplayName $firewallRuleName -ErrorAction SilentlyContinue)) {
  try {
    New-NetFirewallRule -DisplayName $firewallRuleName -Direction Inbound -Action Allow -Protocol TCP -LocalPort $apiPort -Profile Private -ErrorAction Stop | Out-Null
    Write-Host "已添加 Windows 专用网络入站规则：TCP $apiPort" -ForegroundColor Green
  } catch {
    Write-Host "无法自动添加 Windows 防火墙规则。请以管理员身份运行 PowerShell，或手动允许专用网络 TCP $apiPort 入站。" -ForegroundColor Yellow
  }
}

Write-Host "Starting API: http://127.0.0.1:$apiPort" -ForegroundColor Green
Write-Host "Real-device LAN API: http://${lanHost}:$apiPort" -ForegroundColor Cyan
Write-Host "已同步小程序请求地址：$apiConfigPath" -ForegroundColor Cyan
npm run migrate
npm start
