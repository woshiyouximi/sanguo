param(
  [string]$Out = 'before.png',
  [string]$W = '750',
  [string]$H = '1334',
  [string]$Query = 'city=%E4%BB%A3%E7%B8%A3&force=1',
  [string]$Url = '',
  [string]$Profile = 'F:\sanguo\work\.edgeprof_lead'
)
$ErrorActionPreference = 'Stop'
$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$dir = 'F:\sanguo\work\cityart'
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
$png = Join-Path $dir $Out
if (Test-Path $png) { Remove-Item $png -Force }
$ws = '--window-size=' + $W + ',' + $H
$vt = '--virtual-time-budget=8000'
$prof = '--user-data-dir=' + $Profile
$shot = '--screenshot=' + $png
$url = if ($Url -ne '') { $Url } else { 'http://127.0.0.1:5173/web/city.html?' + $Query }
$a = @(
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--force-device-scale-factor=1', '--disable-features=Translate,BackForwardCache',
  $ws, $vt, $prof, $shot, $url
)
$p = Start-Process -FilePath $edge -ArgumentList $a -Wait -PassThru -NoNewWindow
if (Test-Path $png) {
  $b = (Get-Item $png).Length
  Write-Output ("OK " + $Out + " " + $b + " bytes exit=" + $p.ExitCode)
} else {
  Write-Output ("MISSING " + $Out + " exit=" + $p.ExitCode)
}
