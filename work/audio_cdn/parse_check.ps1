param([Parameter(Mandatory = $true)][string]$Path)
$full = (Resolve-Path -LiteralPath $Path).Path
$bytes = [System.IO.File]::ReadAllBytes($full)
$n = [Math]::Min(3, $bytes.Length)
$bom = (($bytes[0..($n - 1)]) | ForEach-Object { $_.ToString('X2') }) -join ' '
$tokens = $null
$errors = $null
[void][System.Management.Automation.Language.Parser]::ParseFile($full, [ref]$tokens, [ref]$errors)
"engine = $($PSVersionTable.PSVersion) ($($PSVersionTable.PSEdition))"
"file   = $full"
"size   = $($bytes.Length)"
"bom    = $bom"
"tokens = $($tokens.Count)"
"errors = $($errors.Count)"
foreach ($e in $errors) { "  L$($e.Extent.StartLineNumber): $($e.Message)" }
if ($errors.Count -gt 0) { exit 1 }
exit 0
