$ErrorActionPreference = 'Stop'
$src = 'F:\sanguo\game\src\view\battleView.ts'
$tmp = 'F:\sanguo\work\bg_orig\_restore.ts'
$enc = [System.Text.Encoding]::GetEncoding(936)

# Invert the cp936 decoder: char -> original byte(s).
$map = New-Object 'System.Collections.Generic.Dictionary[char, byte[]]'
# single-byte high range (0x80 -> U+20AC euro, etc.)
for ($a = 0x80; $a -le 0xFF; $a++) {
  $s1 = $enc.GetString([byte[]]@([byte]$a))
  if ($s1.Length -eq 1) { $map[$s1[0]] = [byte[]]@([byte]$a) }
}
# two-byte pairs
for ($a = 0x81; $a -le 0xFE; $a++) {
  for ($b = 0x40; $b -le 0xFE; $b++) {
    if ($b -eq 0x7F) { continue }
    $s = $enc.GetString([byte[]]@([byte]$a, [byte]$b))
    if ($s.Length -eq 1) {
      $ch = $s[0]
      if (-not $map.ContainsKey($ch)) { $map[$ch] = [byte[]]@([byte]$a, [byte]$b) }
    }
  }
}
"table=$($map.Count)"

$txt = [System.IO.File]::ReadAllText($src, [System.Text.Encoding]::UTF8)
if ($txt.Length -gt 0 -and $txt[0] -eq [char]0xFEFF) { $txt = $txt.Substring(1) }
$out = New-Object 'System.Collections.Generic.List[byte]'
$bad = 0
foreach ($ch in $txt.ToCharArray()) {
  $cp = [int][char]$ch
  if ($cp -lt 0x80) { $out.Add([byte]$cp); continue }
  if ($map.ContainsKey($ch)) {
    $p = $map[$ch]
    foreach ($x in $p) { $out.Add($x) }
  } else { $bad++ }
}
"bad=$bad out=$($out.Count)"
[System.IO.File]::WriteAllBytes($tmp, $out.ToArray())
"wrote $tmp"
