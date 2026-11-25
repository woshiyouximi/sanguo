"""修 G11：Run-Step 是按数组 splat 传参的，命名参数 -Scope 会被当成位置参数串到 -Max 上
（实测报错：Cannot convert value "game/src" to type "System.Int32"）。
改成用 powershell.exe -File 起子进程跑 check_encoding.ps1，参数交给 powershell.exe 自己解析。
仍然用 python 读写，保住 UTF-8 BOM。
"""
import sys
from pathlib import Path

TARGET = Path(r"F:\sanguo\tools\gate_fidelity.ps1")
BOM = b"\xef\xbb\xbf"

OLD = """$encScript = Join-Path $root 'tools\\check_encoding.ps1'
if (-not (Test-Path $encScript)) {
    Say '---- G11 编码守门'
    Say '     FAIL :: tools\\check_encoding.ps1 不存在'
    $script:res += [pscustomobject]@{ Step = 'G11 编码守门'; Status = 'FAIL'; Code = -1; Tail = 'check_encoding.ps1 missing' }
} else {
    Push-Location $root
    Run-Step 'G11 编码守门' $root $encScript @('-Scope', 'game/src') 'ENCODING check: PASS' | Out-Null
    Pop-Location
}
"""

NEW = """#      注意：Run-Step 用数组 splat 传参，命名参数会被当成位置值（-Scope 会串到 -Max 上），
#      所以这里用 powershell.exe -File 起子进程，把参数交给 powershell.exe 自己解析。
$encScript = Join-Path $root 'tools\\check_encoding.ps1'
$psHost = Join-Path $env:SystemRoot 'System32\\WindowsPowerShell\\v1.0\\powershell.exe'
if (-not (Test-Path $encScript)) {
    Say '---- G11 编码守门'
    Say '     FAIL :: tools\\check_encoding.ps1 不存在'
    $script:res += [pscustomobject]@{ Step = 'G11 编码守门'; Status = 'FAIL'; Code = -1; Tail = 'check_encoding.ps1 missing' }
} elseif (-not (Test-Path $psHost)) {
    Say '---- G11 编码守门'
    Say '     FAIL :: 找不到 powershell.exe（Windows PowerShell 5.1）'
    $script:res += [pscustomobject]@{ Step = 'G11 编码守门'; Status = 'FAIL'; Code = -1; Tail = 'powershell.exe not found' }
} else {
    Push-Location $root
    Run-Step 'G11 编码守门' $root $psHost @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $encScript, '-Scope', 'game/src') 'ENCODING check: PASS' | Out-Null
    Pop-Location
}
"""


def main() -> int:
    raw = TARGET.read_bytes()
    had_bom = raw.startswith(BOM)
    text = (raw[3:] if had_bom else raw).decode("utf-8")
    if OLD not in text:
        print("old G11 block not found -> abort")
        return 1
    text = text.replace(OLD, NEW, 1)
    out = BOM + text.encode("utf-8")
    TARGET.write_bytes(out)
    print(f"patched {TARGET}: {len(raw)} -> {len(out)} bytes, bom={had_bom}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
