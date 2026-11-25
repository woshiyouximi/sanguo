import pathlib
p = pathlib.Path(r'F:\sanguo\game\src\view\battleView.ts')
t = p.read_text(encoding='utf-8')
old = """      sy: 0,"""
new = """      sy: (pr.h - sh) * 0.16,   // 立绘人物通常从 15% 处开始，锚在头顶会让框里全是背景"""
assert old in t
p.write_text(t.replace(old, new, 1), encoding='utf-8')
print('sy anchor')
