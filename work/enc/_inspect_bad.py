"""只读勘察：看 14 个 BAD 文件到底是什么货色（历史归档？现役数据？）。

全程只读，不写任何源文件；输出写到 work/enc/_inspect_out.txt（UTF-8），
因为 PS 5.1 控制台是 GBK，直接 print 含 U+FFFD 的文本会 UnicodeEncodeError。
"""
import json
import sys
from pathlib import Path

ROOT = Path(r"F:\sanguo")
OUT = ROOT / "work" / "enc" / "_inspect_out.txt"
FFFD = "\ufffd"

BAD_FILES = [
    "docs/02_资源格式规格.md",
    "work/fidelity/_cmp_regen.json",
    "work/fidelity/fidelity_expect.pre_backfill.json",
    "work/fidelity/fidelity_expect.regen.json",
    "work/fidelity/gen_expect.mjs",
    "work/fidelity/gen_expect.fixed.mjs",
    "work/fidelity/gen_expect.fixed.restored.mjs",
    "work/fidelity/gen_expect.fixed2.mjs",
    "work/fidelity/gen_expect.fixed3.mjs",
    "work/fidelity/gen_expect.recovered.mjs",
    "work/fidelity/gen_expect.recovered.restored.mjs",
    "work/fidelity/gen_expect.repair.mjs",
    "work/fidelity/gen_expect.repair2.mjs",
    "work/fidelity/gen_expect.restored.mjs",
]

# 现役对照：G2 用的数据文件与原始脚本
LIVE = [
    "work/fidelity/fidelity_expect.json",
    "work/fidelity/gen_expect.src.mjs",
    "work/fidelity/check.mjs",
]

lines = []


def emit(s=""):
    lines.append(s)


def scan(p: Path):
    try:
        raw = p.read_bytes()
    except OSError as e:
        return {"err": str(e)}
    txt = raw.decode("utf-8", errors="replace")
    mtime = p.stat().st_mtime
    import datetime

    return {
        "size": len(raw),
        "lines": txt.count("\n") + (0 if txt.endswith("\n") else 1),
        "fffd": txt.count(FFFD),
        "mtime": datetime.datetime.fromtimestamp(mtime).strftime("%Y-%m-%d %H:%M:%S"),
        "bom": raw.startswith(b"\xef\xbb\xbf"),
        "txt": txt,
    }


emit("== 14 个 BAD 文件 ==")
for rel in BAD_FILES:
    p = ROOT / rel
    if not p.exists():
        emit(f"{rel}  MISSING")
        continue
    info = scan(p)
    emit(
        f"{rel}\n  size={info['size']} lines={info['lines']} fffd={info['fffd']} "
        f"bom={info['bom']} mtime={info['mtime']}"
    )

emit()
emit("== docs/02 第 283 行全文（前 400 字符）==")
p = ROOT / "docs/02_资源格式规格.md"
t = scan(p)["txt"].splitlines()
for i in (281, 282, 283):
    if i - 1 < len(t):
        s = t[i - 1]
        emit(f"L{i} len={len(s)}: {s[:400]}")

emit()
emit("== work/fidelity 目录里所有 .json/.mjs 的 FFFD 计数 ==")
for p in sorted((ROOT / "work" / "fidelity").glob("*")):
    if p.suffix.lower() not in (".json", ".mjs"):
        continue
    info = scan(p)
    if "err" in info:
        emit(f"{p.name}  ERR {info['err']}")
        continue
    emit(f"{p.name:44s} size={info['size']:8d} fffd={info['fffd']:6d} mtime={info['mtime']}")

emit()
emit("== 现役文件对照（应为 0 FFFD）==")
for rel in LIVE:
    p = ROOT / rel
    if not p.exists():
        emit(f"{rel}  MISSING")
        continue
    info = scan(p)
    emit(f"{rel}  size={info['size']} fffd={info['fffd']} mtime={info['mtime']}")

emit()
emit("== 三个 json 的头部（看是不是 expect 数据的坏副本）==")
for rel in [
    "work/fidelity/_cmp_regen.json",
    "work/fidelity/fidelity_expect.pre_backfill.json",
    "work/fidelity/fidelity_expect.regen.json",
]:
    p = ROOT / rel
    info = scan(p)
    emit(f"--- {rel} ---")
    emit("\n".join(info["txt"].splitlines()[:6])[:1200])
    try:
        json.loads(info["txt"].replace(FFFD, "X"))
        emit("  [json 可解析，替换 FFFD 后]")
    except Exception as e:
        emit(f"  [json 解析失败: {e}]")

emit()
emit("== gen_expect 家族头部 3 行 ==")
for p in sorted((ROOT / "work" / "fidelity").glob("gen_expect*.mjs")):
    info = scan(p)
    head = "\n".join(info["txt"].splitlines()[:3])[:300]
    emit(f"--- {p.name} fffd={info['fffd']} bom={info['bom']} ---")
    emit(head)

OUT.write_text("\n".join(lines), encoding="utf-8")
print("written", OUT, len(lines), "lines")
