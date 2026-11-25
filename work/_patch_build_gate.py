# -*- coding: utf-8 -*-
"""把 verify_pkg.js 的资产包自洽 gate 插进 tools/build_wechat.ps1（保住 UTF-8 BOM）。

背景：`edit` 工具写 .ps1 会抹掉 BOM，PowerShell 5.1 会按 cp936 读从而级联报错，
所以这里用 python 显式 utf-8-sig 读写。幂等：已存在 marker 就直接退出。
"""
import io
import sys

PATH = r"F:\sanguo\tools\build_wechat.ps1"
MARK = "# 4b) 资产包自洽检验"

ANCHOR = (
    'else { Write-Host ("  \u2713 整体 {0} < 20 MB" -f (Format-Size $total)) -ForegroundColor Green }'
)

BLOCK = """

# 4b) 资产包自洽检验（config → uuids → versions.native → native/import 四段对齐）
# 由 work\\map_ide\\verify_pkg.js 提供：抓「文件在磁盘上却读不到」这类错配（曾在旧包里踩过）。
if ($Mode -eq 'upload') {
  $verifyPkg = Join-Path $Tools 'map_ide\\verify_pkg.js'
  if (Test-Path -LiteralPath $verifyPkg) {
    & node $verifyPkg $out
    if ($LASTEXITCODE -ne 0) {
      Fail "资产包自洽检验未通过（verify_pkg.js exit=$LASTEXITCODE），不要上传这个包"
    } else {
      Write-Host "  \u2713 资产包自洽检验通过（config/native/import 四段对齐）" -ForegroundColor Green
    }
  } else {
    Write-Host "  ! 未找到 work\\map_ide\\verify_pkg.js，跳过资产包自洽检验" -ForegroundColor Yellow
  }
}
"""

with io.open(PATH, "r", encoding="utf-8-sig", newline="") as f:
    text = f.read()

if MARK in text:
    print("already patched, nothing to do")
    sys.exit(0)

if ANCHOR not in text:
    print("ANCHOR NOT FOUND")
    sys.exit(2)

text = text.replace(ANCHOR, ANCHOR + BLOCK, 1)

with io.open(PATH, "w", encoding="utf-8-sig", newline="") as f:
    f.write(text)

raw = open(PATH, "rb").read(3)
print("patched; bom=%s size=%d" % (raw == b"\xef\xbb\xbf", len(open(PATH, "rb").read())))
