"""写一个只读的 PS 5.1 语法校验脚本（utf-8-sig），用来验证改过的 .ps1 还能被 5.1 解析。"""
from pathlib import Path

TARGET = r"F:\sanguo\tools\gate_fidelity.ps1"
OUT = Path(r"F:\sanguo\work\enc\_staging\parse_check.ps1")

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(
    "$ErrorActionPreference = 'Stop'\n"
    "$target = $args[0]\n"
    "$e = $null\n"
    "$t = $null\n"
    "[System.Management.Automation.Language.Parser]::ParseFile($target, [ref]$t, [ref]$e) | Out-Null\n"
    "Write-Host ('PARSE_ERRORS=' + $e.Count)\n"
    "foreach ($x in $e) { Write-Host ('  ' + $x.Extent.StartLineNumber + ':' + $x.Message) }\n"
    "if ($e.Count -gt 0) { exit 1 }\n"
    "exit 0\n",
    encoding="utf-8-sig",
)
print("wrote", OUT, "target =", TARGET)
