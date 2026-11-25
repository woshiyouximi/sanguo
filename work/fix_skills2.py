import pathlib, re
p = pathlib.Path(r'F:\sanguo\proto\ui\style.css')
t = p.read_text(encoding='utf-8')
t = t.replace(".skills{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:0 24px}",
              ".skills{display:grid;grid-template-columns:repeat(7,1fr);gap:6px;padding:0 20px}")
t = t.replace(".skills.w8{grid-template-columns:repeat(4,1fr)}",
              ".skills.w8{grid-template-columns:repeat(8,1fr)}")
t += """

/* G1 技能格：8 格一行放得下，靠缩字号而不是缩列（2026-11-24 修） */
.skcell{padding:7px 5px;border-radius:8px;min-height:0}
.skcell .s-n{font-size:16px;line-height:1.15;letter-spacing:0}
.skcell .s-i{font-size:11px;line-height:1.2}
.skcell .s-i.dim{opacity:.55}
"""
p.write_text(t, encoding='utf-8')
print('skills 7/8 compact')
