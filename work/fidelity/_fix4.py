import io, re

src = r"F:\sanguo\work\fidelity\gen_expect.fixed2.mjs"
dst = r"F:\sanguo\work\fidelity\gen_expect.fixed3.mjs"

t = io.open(src, encoding="utf-8").read()

# 311 行：注释把 const 声明吞进去了（换行被吃掉）→ 拆成注释 + 独立声明
t = re.sub(
    r"//[^\n]*?" + re.escape("const xlsPathBySeq = new Map("),
    "// XLS 与 TIMES 路径表按序号对齐\nconst xlsPathBySeq = new Map(",
    t,
)

io.open(dst, "w", encoding="utf-8", newline="\n").write(t)
print("written", dst)
