import pathlib
p = pathlib.Path(r'F:\sanguo\proto\ui\style.css')
t = p.read_text(encoding='utf-8')
t += """
/* 立繪：有 assets/hero/<姓名>.png 就盖住占位，没有就 onerror 自删 */
.portrait{position:relative;overflow:hidden}
.portrait img.real{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:50% 12%;z-index:3}
.portrait img.real + .silh,.portrait img.real ~ .ch{display:none}
"""
p.write_text(t, encoding='utf-8')
print('portrait css')
