import pathlib
p = pathlib.Path(r'F:\sanguo\work\dbg_view.mjs')
s = p.read_text(encoding='utf-8')
s = s.replace("const cmds = V.buildFrame", "const sides = {}; for (const u of w.units) sides[String(u.side)] = (sides[String(u.side)] || 0) + 1;\nconsole.log('unit sides', sides);\nconst cmds = V.buildFrame")
p.write_text(s, encoding='utf-8')
print('ok')
