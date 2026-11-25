import pathlib
p = pathlib.Path(r'F:\sanguo\game\src\core\battle.ts')
t = p.read_text(encoding='utf-8')
old = "    aiSides: { A: opts.aiSides?.A ?? false, B: opts.aiSides?.B ?? true },"
new = "    // 默认两侧都不放技：AI 放技是显式 opt-in，否则镜像局里 \"B 有 AI\" 会变成系统性优势\n    aiSides: { A: opts.aiSides?.A ?? false, B: opts.aiSides?.B ?? false },"
assert old in t
p.write_text(t.replace(old, new), encoding='utf-8')
print('aiSides default off')
