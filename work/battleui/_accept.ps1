# ASCII-only helper: launch Edge via Start-Process (argument ARRAY so
# --window-size= never splits into two argv entries), then run _accept.mjs
# (real CDP mouse clicks + live state probe) and tear the browser down.
#
# example:
#   powershell -NoProfile -ExecutionPolicy Bypass -File _accept.ps1 `
#     -Url "http://127.0.0.1:5173/web/?sim=60&terrain=7&freeze=1&auto=1" `
#     -Json F:\sanguo\work\battleui\_accept.json
param(
  [Parameter(Mandatory = $true)][string]$Url,
  [string]$Json = '' ,
  [switch]$SeedQi,
  [int]$W = 750,
  [int]$H = 1334,
  [int]$Port = 9411,
  [int]$Wait = 12000
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
  $nodeArgs = @(
    "F:\sanguo\work\battleui\_accept.mjs",
    "--port=$Port",
    "--url=$Url",
    "--wait=$Wait"
  )
  if ($Json) { $nodeArgs += "--json=$Json" }
  if ($SeedQi) { $nodeArgs += "--seedqi=1" }
  & node @nodeArgs
  Write-Output "[accept] exit=$LASTEXITCODE"
} finally {
  Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 300
  Remove-Item -Recurse -Force $prof -ErrorAction SilentlyContinue
}

