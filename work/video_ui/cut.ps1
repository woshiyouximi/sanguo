param(
  [Parameter(Mandatory=$true)][string]$Src,
  [Parameter(Mandatory=$true)][string]$OutDir,
  [Parameter(Mandatory=$true)][string]$Prefix,
  [Parameter(Mandatory=$true)][string]$Times,   # comma separated seconds
  [int]$Width = 1280
)
$ff = 'C:\Users\liutian\AppData\Local\oopz\ffmpeg.exe'
if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Force $OutDir | Out-Null }
foreach ($raw in ($Times -split ',')) {
  $t = $raw.Trim()
  if ($t -eq '') { continue }
  $sec = [double]$t
  $m = [int][math]::Floor($sec / 60)
  $s = [int][math]::Floor($sec - $m * 60)
  $frac = [int][math]::Round(($sec - [math]::Floor($sec)) * 10)
  $ts = ('{0:00}' -f $m) + '-' + ('{0:00}' -f $s)
  if ($frac -gt 0) { $ts = $ts + '_' + $frac }
  $out = Join-Path $OutDir ("{0}_{1}.png" -f $Prefix, $ts)
  & $ff -hide_banner -loglevel error -y -ss $sec -i $Src -frames:v 1 -vf "scale=$($Width):-1:flags=lanczos" $out
  if (Test-Path $out) { Write-Output ("OK  {0}  <- {1}s" -f (Split-Path $out -Leaf), $sec) } else { Write-Output ("FAIL {0}s" -f $sec) }
}
