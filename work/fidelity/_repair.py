import io, re

src = r"F:\sanguo\work\fidelity\gen_expect.restored.mjs"
dst = r"F:\sanguo\work\fidelity\gen_expect.repair.mjs"

lines = io.open(src, encoding="utf-8").read().split("\n")
out = []
fixed = 0
for ln in lines:
    # 只在「key: '...'」形态的行里修不平衡引号（证据串被字节吞掉引号的情况）
    m = re.match(r"^(\s*)([A-Za-z_$][\w$]*): '(.*)$", ln)
    if m and ln.count("'") % 2 == 1:
        indent, key = m.group(1), m.group(2)
        out.append(f"{indent}{key}: '见 project/192（R192 修复：原始证据串在编码事故中损坏，数值期望未变）',")
        fixed += 1
    else:
        out.append(ln)

io.open(dst, "w", encoding="utf-8", newline="\n").write("\n".join(out))
print("fixed lines:", fixed, "->", dst)
