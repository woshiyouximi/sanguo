$p = 'F:\sanguo\work\wechat_ide\logs\min_console.txt'
$lines = Get-Content $p -Encoding utf8
foreach ($pat in @('prerequisite-imports', 'does not exist', 'loadSubpackage', '3804', 'Mask', '分包')) {
  $n = 0
  $first = ''
  foreach ($l in $lines) {
    if ($l -like "*$pat*") { $n++; if ($first -eq '') { $first = $l.Trim() } }
  }
  Write-Host ("PATTERN [{0}] hits={1}" -f $pat, $n)
  if ($first -ne '') { Write-Host ("   first: " + $first) }
}
