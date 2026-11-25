import io, re
P = r"F:\sanguo\project\02_战斗重构设计.md"
s = io.open(P, encoding="utf-8").read()
lines = s.split("\n")
fence = sum(1 for l in lines if l.strip().startswith("```"))
h1 = [l for l in lines if re.match(r"^# ", l)]
h2 = [l for l in lines if re.match(r"^## ", l)]
h3 = [l for l in lines if re.match(r"^### ", l)]
tbl_sep = sum(1 for l in lines if re.match(r"^\|\s*-{2,}", l.strip()))
print("lines", len(lines)-1, "chars", len(s), "fence", fence, "h1", len(h1), "h2", len(h2), "h3", len(h3), "tables", tbl_sep)
print("依据", s.count("（依据："), "新设计", s.count("（新设计"), "建议改", s.count("（建议改"), "待定", s.count("待定"))
# 表格行连续性检查：表格块前后是否缺空行导致吞并
bad = 0
infence = False
for i, l in enumerate(lines):
    if l.strip().startswith("```"): infence = not infence
    if infence: continue
    if l.strip().startswith("|") and i+1 < len(lines):
        nx = lines[i+1]
        if nx.strip() and not nx.strip().startswith("|"):
            bad += 1
            print("TBL_END_NO_BLANK", i+1, repr(l[:30]), "->", repr(nx[:30]))
print("table_end_issues", bad)
# 标题后是否紧跟内容（无空行）——抽样确认不是空标题
print("h2:", [h[:24] for h in h2])
