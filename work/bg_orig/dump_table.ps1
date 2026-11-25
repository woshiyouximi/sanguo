$ErrorActionPreference = 'Stop'
$enc = [System.Text.Encoding]::GetEncoding(936)
$acc = @{}
function Add-Map([string]$s, [string]$hex) {
  if ($s.Length -ne 1) { return }
  $cp = [int][char]$s[0]
  if (-not $acc.ContainsKey($cp)) { $acc[$cp] = New-Object 'System.Collections.Generic.List[string]' }
  if (-not $acc[$cp].Contains($hex)) { $acc[$cp].Add($hex) }
}
for ($a = 0x80; $a -le 0xFF; $a++) {
  Add-Map ($enc.GetString([byte[]]@([byte]$a))) ('{0:x2}' -f $a)
}
for ($a = 0x81; $a -le 0xFE; $a++) {
  for ($b = 0x40; $b -le 0xFE; $b++) {
    if ($b -eq 0x7F) { continue }
    Add-Map ($enc.GetString([byte[]]@([byte]$a, [byte]$b))) (('{0:x2}' -f $a) + ('{0:x2}' -f $b))
  }
}
$o = @{}
foreach ($k in $acc.Keys) { $o[[string]$k] = $acc[$k].ToArray() }
$json = $o | ConvertTo-Json -Depth 4 -Compress
[System.IO.File]::WriteAllText('F:\sanguo\work\bg_orig\cp936_table.json', $json, (New-Object System.Text.UTF8Encoding($false)))
"chars=$($o.Count) amb=$((($o.Values | Where-Object { $_.Count -gt 1 })).Count)"
