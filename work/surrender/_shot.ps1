# ASCII-only helper: launch Edge via Start-Process (argument ARRAY, so
# --window-size= never splits into two argv entries -> no "Multiple targets"
# headless error), then drive it with _cdp.mjs and tear it down.
#
# example:
#   pwsh -File _shot.ps1 -Url "http://127.0.0.1:5173/web/?sim=250&terrain=7" `
#        -Out F:\sanguo\work\battleui\after.png -Tap "655,1262" -Probe "1+1"
param(
  [Parameter(Mandatory = $true)][string]$Url,
  [Parameter(Mandatory = $true)][string]$Out,
  [int]$W = 750,
  [int]$H = 1334,
  [int]$Port = 9411,
  [int]$Wait = 12000,
  [string]$Js = '',
  [string]$Tap = '',
  [string]$Tap2 = '',
  [string]$Probe = '',
  [string]$Json = ''
)

$ErrorActionPreference = 'Stop'
$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$prof = Join-Path $env:TEMP ('edge-bui-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
$argv = @(
  '--headless=new',
  "--remote-debugging-port=$Port",
  "--user-data-dir=$prof",
  "--window-size=$W,$H",
  '--hide-scrollbars',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  '--enable-unsafe-swiftshader',
  'about:blank'
)
$proc = Start-Process -FilePath $edge -ArgumentList $argv -PassThru
try {
  Start-Sleep -Milliseconds 1400
  $cdpArgs = @(
    "F:\sanguo\work\battleui\_cdp.mjs",
    "--port=$Port",
    "--url=$Url",
    "--out=$Out",
    "--w=$W",
    "--h=$H",
    "--wait=$Wait"
  )
  if ($Js) { $cdpArgs += "--js=$Js" }
  if ($Tap) { $cdpArgs += "--tap=$Tap" }
  if ($Tap2) { $cdpArgs += "--tap2=$Tap2" }
  if ($Probe) { $cdpArgs += "--probe=$Probe" }
  if ($Json) { $cdpArgs += "--json=$Json" }
  & node @cdpArgs
  Write-Output "[shot] exit=$LASTEXITCODE"
} finally {
  Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 300
  Remove-Item -Recurse -Force $prof -ErrorAction SilentlyContinue
}
