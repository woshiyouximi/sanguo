"""收尾核验 layout.ts：0 个 U+FFFD、0 个占位符、非注释代码行逐字节未变。

对照物是事故现场的原件备份 work/enc/archive/layout.damaged.r199.ts（150 个 U+FFFD / 252 行）。
"非注释行"的判定：去掉行尾换行后，既不以 // 开头、也不在 /* */ 块内、也不以 * 开头。
（本文件的代码行里没有行尾注释，所以这个判定够用；脚本还会断言两次统计的代码行数相等。）
"""
import unicodedata
from pathlib import Path

ROOT = Path(r"F:\sanguo")
CUR = ROOT / "game" / "src" / "view" / "layout.ts"
OLD = ROOT / "work" / "enc" / "archive" / "layout.damaged.r199.ts"
OUT = ROOT / "work" / "enc" / "_verify_out.txt"
FFFD = "\ufffd"


def load(p):
    raw = p.read_bytes()
    return raw, raw.decode("utf-8")


def split_code(text):
    """返回 (代码行列表, 注释行数)。块注释状态跨行跟踪。"""
    code = []
    in_block = False
    comment_lines = 0
    for line in text.split("\n"):
        s = line.strip()
        if in_block:
            comment_lines += 1
            if "*/" in s:
                in_block = False
            continue
        if s.startswith("/*"):
            comment_lines += 1
            if "*/" not in s:
                in_block = True
            continue
        if s.startswith("//") or s.startswith("*"):
            comment_lines += 1
            continue
        if s == "":
            continue
        code.append(line.rstrip("\r"))
    return code, comment_lines


lines = []


def emit(s=""):
    lines.append(s)


raw_cur, cur = load(CUR)
raw_old, old = load(OLD)

emit("== 基本指标 ==")
emit(f"current : {CUR}")
emit(f"          {len(raw_cur)} bytes, {cur.count(chr(10)) + 1} lines, U+FFFD={cur.count(FFFD)}, "
     f"placeholder={cur.count('@@R198FIX@@')}, bom={raw_cur.startswith(b'\\xef\\xbb\\xbf')}")
emit(f"archive : {OLD}")
emit(f"          {len(raw_old)} bytes, {old.count(chr(10)) + 1} lines, U+FFFD={old.count(FFFD)}")

code_cur, cmt_cur = split_code(cur)
code_old, cmt_old = split_code(old)
emit(f"code lines: current={len(code_cur)} archive={len(code_old)} identical={code_cur == code_old}")
emit(f"comment/blank lines: current={cmt_cur} archive={cmt_old}")

if code_cur != code_old:
    for i, (a, b) in enumerate(zip(code_cur, code_old)):
        if a != b:
            emit(f"  FIRST CODE DIFF at #{i + 1}:\n    cur: {a!r}\n    old: {b!r}")
            break

emit()
emit("== 归档件里 47 个坏行 -> 现在的对应注释（按上下文就近展示）==")
bad_lines = [i + 1 for i, ln in enumerate(old.split("\n")) if FFFD in ln]
emit(f"damaged lines in archive: {len(bad_lines)}")
cur_lines = cur.split("\n")
for n in bad_lines:
    # 在现文本里按「去掉 U+FFFD 和问号后的骨架」找回对应行
    src = old.split("\n")[n - 1]
    skeleton = src.replace(FFFD, "").replace("?", "").strip()
    key = skeleton[:12]
    hit = None
    for i, cl in enumerate(cur_lines):
        if key and key in cl.replace("?", ""):
            hit = i + 1
            break
    span = ""
    if hit:
        span = f"L{hit}: {cur_lines[hit - 1].strip()[:110]}"
    emit(f"  old L{n}: {src.strip()[:100]}")
    emit(f"    now -> {span or '(未定位到，可能已拆成多行)'}")

emit()
emit("== 非 ASCII 字符里的意外字符（除了中文标点/全角，不该有别的）==")
unexpected = {}
for ch in cur:
    if ord(ch) < 0x80:
        continue
    name = unicodedata.name(ch, "UNNAMED")
    if name.startswith("CJK UNIFIED IDEOGRAPH") or name.startswith("IDEOGRAPHIC"):
        continue
    unexpected[ch] = unexpected.get(ch, 0) + 1
emit(" ".join(f"{ch!r}(U+{ord(ch):04X},x{n})" for ch, n in sorted(unexpected.items())) or "(none)")

OUT.write_text("\n".join(lines), encoding="utf-8")
print("written", OUT)
