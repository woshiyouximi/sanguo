import io, re
P = r"F:\sanguo\project\02_战斗重构设计.md"
lines = io.open(P, encoding="utf-8").read().split("\n")

# 1) 去掉 fence 前/后的空行（fence 是块级，可打断段落）
out, i, r1 = [], 0, 0
while i < len(lines):
    l = lines[i]
    if l.strip().startswith("```") and not l.strip() == "---":
        # 前面空行可删
        if out and out[-1].strip() == "" and len(out) >= 2 and not out[-2].strip().startswith("|") \
           and out[-2].strip() != "" and not out[-2].strip().startswith("```"):
            out.pop(); r1 += 1
        out.append(l)
        # 复制 fence 内容直到闭合
        i += 1
        while i < len(lines):
            out.append(lines[i])
            if lines[i].strip().startswith("```"):
                break
            i += 1
        # 后面的空行可删
        if i+2 < len(lines) and lines[i+1].strip() == "":
            ns = lines[i+2].strip()
            if ns and not ns.startswith("|"):
                r1 += 1; i += 2; continue
        i += 1
        continue
    out.append(l); i += 1

# 2) `---` 后接标题：去掉空行
out2, i, r2 = [], 0, 0
while i < len(out):
    out2.append(out[i])
    if out[i].strip() == "---" and i+2 < len(out) and out[i+1].strip() == "" and out[i+2].startswith("#"):
        out2.append(out[i+2]); r2 += 1; i += 3; continue
    i += 1

s = "\n".join(out2)
io.open(P, "w", encoding="utf-8", newline="\n").write(s)
print("fence_blanks:", r1, "hr_head_blanks:", r2, "lines:", s.count("\n"))
