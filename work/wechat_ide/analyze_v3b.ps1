$p = 'F:\sanguo\work\wechat_ide\logs\v3_console_battle.txt'
$lines = Get-Content $p -Encoding utf8
Write-Host "lines=$($lines.Count)"
foreach ($pat in @('prerequisite-imports', 'loadBundle', 'data/wises', 'Bundle res', 'map/chinamap', '3804')) {
  $n = 0
  foreach ($l in $lines) { if ($l -like "*$pat*") { $n++ } }
  Write-Host ("  [{0}] lines = {1}" -f $pat, $n)
}
$de = 0
$mp3 = 0
$webp = 0
foreach ($l in $lines) {
  if ($l -like '*does not exist*') {
    $de++
    if ($l -like '*.mp3*') { $mp3++ }
    if ($l -like '*.webp*') { $webp++ }
  }
}
Write-Host ("  [does not exist] lines = {0}  (mp3 rows={1}, webp rows={2})" -f $de, $mp3, $webp)
