import pathlib
p = pathlib.Path(r'F:\sanguo\project\README.md')
t = p.read_text(encoding='utf-8')
rows = [
 ("12_技能特效接入.md", "818 帧 / 40 目录 / 103 技有特效、横向帧转纵向、施法运镜"),
 ("16_单位动作接入.md", "attack/hit/death 三套背视动作帧 + 8 处合并 diff（待合并）"),
]
for name, desc in rows:
    if name not in t:
        t = t.replace("\n", "\n| `%s` | %s |\n" % (name, desc), 1) if False else t
        # 追加到专项文档表末尾更稳：找最后一行以 "| `1" 开头的行后插入
lines = t.split("\n")
out, done = [], set()
for ln in lines:
    out.append(ln)
    for name, desc in rows:
        if name in ln:
            done.add(name)
# 若表里没有，就追加在 14 行之后
if len(done) < len(rows):
    for i, ln in enumerate(out):
        if "`14_物品与装备.md`" in ln:
            ins = ["| `%s` | %s |" % (n, d) for n, d in rows if n not in done]
            out[i+1:i+1] = ins
            break
p.write_text("\n".join(out), encoding='utf-8')
print('readme rows:', [n for n,_ in rows])
