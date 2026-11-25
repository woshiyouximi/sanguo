import pathlib
p = pathlib.Path(r'F:\sanguo\game\web\main.js')
t = p.read_text(encoding='utf-8')
old = "  const castParam = params.get('cast');"
new = "  const castParam = params.get('cast');\n  if (castParam) { try { await initMagicProgram('../data/'); } catch (e) { console.warn(e); } }"
assert old in t
t = t.replace(old, new, 1)
p.write_text(t, encoding='utf-8')
print('debug cast preload')
