param([string]$Path)
$errs = $null
[void][System.Management.Automation.Language.Parser]::ParseFile($Path, [ref]$null, [ref]$errs)
if ($errs) { $errs | ForEach-Object { $_.Message }; exit 1 } else { Write-Host "PARSE OK $Path"; exit 0 }
