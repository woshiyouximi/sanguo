"""把 G11 编码守门插进 tools/gate_fidelity.ps1 的汇总之前。

约束：
- 该文件是 .ps1，必须带 UTF-8 BOM（PS 5.1 读无 BOM 的 UTF-8 会按 GBK 解，里面全中文 needle 会坏）。
- 不许用 PowerShell 改它（本轮硬约束），所以这里用 python 读改写，并保住原文件的换行风格。
- 幂等：已经插过就打印跳过，不重复插。
"""
import sys
from pathlib import Path

ROOT = Path(r"F:\sanguo")
TARGET = ROOT / "tools" / "gate_fidelity.ps1"
BOM = b"\xef\xbb\xbf"

BLOCK = """# ---- G11 编码守门（R199 事故：PS 5.1 的 Set-Content 默认 CP936，用 Get-Content|Set-Content 改源码
#      会把中文写成 U+FFFD —— game/src/core/battle.ts 报废 1962 处，全量测试 1544 -> 586。
#      这道关不设 SKIP：脚本缺了就是 FAIL，因为它守的是「源码本身还能不能被读」。
$encScript = Join-Path $root 'tools\\check_encoding.ps1'
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

ANCHOR = "# ---- 汇总"


def main() -> int:
    raw = TARGET.read_bytes()
    had_bom = raw.startswith(BOM)
    body = raw[3:] if had_bom else raw
    crlf = b"\r\n" in body
    text = body.decode("utf-8")

    if "G11" in text:
        print("already has G11 -> nothing to do")
        return 0
    if ANCHOR not in text:
        print(f"anchor {ANCHOR!r} not found -> abort")
        return 1

    block = BLOCK.replace("\r\n", "\n")
    if crlf:
        block = block.replace("\n", "\r\n")
    text = text.replace(ANCHOR, block + ANCHOR, 1)

    out = text.encode("utf-8")
    TARGET.write_bytes(BOM + out)
    old_lines = raw.count(b"\n")
    new_lines = (BOM + out).count(b"\n")
    print(
        f"{TARGET}  was_bom={had_bom} crlf={crlf} bytes {len(raw)} -> {len(BOM) + len(out)}  "
        f"lines {old_lines} -> {new_lines}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
