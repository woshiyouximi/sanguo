$p = 'F:\sanguo\work\wechat_ide\logs\v3_console_all.txt'
$lines = Get-Content $p -Encoding utf8
Write-Host "lines=$($lines.Count)"
Write-Host "=== pattern counts"
foreach ($pat in @('prerequisite-imports', 'loadBundle', 'does not exist', 'data/wises', 'Bundle res', '3804', 'Res not found', 'app.json')) {
  $n = 0
  $first = ''
  foreach ($l in $lines) { if ($l -like "*$pat*") { $n++; if ($first -eq '') { $first = $l.Trim() } } }
  Write-Host ("  [{0}] = {1}" -f $pat, $n)
  if ($first -ne '' -and $first.Length -gt 220) { Write-Host ("      first: " + $first.Substring(0,220)) } elseif ($first -ne '') { Write-Host ("      first: " + $first) }
}
$stackPat = '^\s*(\(anonymous\)|at\s|[A-Za-z_$][\w$.\<>\[\]]*\s+@\s|Promise\.|Object\.|Array\.|globalThis|setTimeout|requestAnimationFrame|wxRequest|Show \d+ more|__awaiter|new Promise)'
$seen = @{}
foreach ($raw in $lines) {
  $l = $raw.Trim()
  if ($l -eq '') { continue }
  if ($l -match $stackPat) { continue }
  $k = $l
  if ($k.Length -gt 170) { $k = $k.Substring(0, 170) }
  if ($seen.ContainsKey($k)) { $seen[$k] = $seen[$k] + 1 } else { $seen[$k] = 1 }
}
Write-Host "=== distinct messages: $($seen.Count)"
$pairs = @()
foreach ($k in $seen.Keys) { $pairs += [pscustomobject]@{ Key = $k; N = $seen[$k] } }
$pairs | Sort-Object -Property N -Descending | Select-Object -First 25 | ForEach-Object { "{0,4}x  {1}" -f $_.N, $_.Key }
