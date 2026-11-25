import pathlib
p = pathlib.Path(r'F:\sanguo\proto\ui\style.css')
t = p.read_text(encoding='utf-8')
t += """
/* 軍師技 8 格更窄：名字再降一档，避免"保留…"这种截断 */
.skcell .s-n{font-size:15px}
.skcell .s-i{font-size:10px}
.skcell .s-i.dim{display:none}
.skcell{padding:6px 3px;text-align:center}
.skcell .s-n{overflow:visible;white-space:normal;word-break:break-all;display:block;line-height:1.1}
"""
p.write_text(t, encoding='utf-8')
print('narrow names')
