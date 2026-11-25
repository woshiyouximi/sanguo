$ErrorActionPreference = 'Stop'
$target = $args[0]
$e = $null
$t = $null
[System.Management.Automation.Language.Parser]::ParseFile($target, [ref]$t, [ref]$e) | Out-Null
Write-Host ('PARSE_ERRORS=' + $e.Count)
foreach ($x in $e) { Write-Host ('  ' + $x.Extent.StartLineNumber + ':' + $x.Message) }
if ($e.Count -gt 0) { exit 1 }
exit 0
