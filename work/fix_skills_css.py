import pathlib
p = pathlib.Path(r'F:\sanguo\proto\ui\style.css')
t = p.read_text(encoding='utf-8')
t = t.replace(".skills{display:grid;grid-template-columns:repeat(7,1fr);gap:8px;padding:0 24px}",
              ".skills{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:0 24px}")
t = t.replace(".skills.w8{grid-template-columns:repeat(8,1fr)}",
              ".skills.w8{grid-template-columns:repeat(4,1fr)}")
p.write_text(t, encoding='utf-8')
print('skills 4x2')
