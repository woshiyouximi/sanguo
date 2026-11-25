import pathlib
p = pathlib.Path(r'F:\sanguo\proto\ui\style.css')
t = p.read_text(encoding='utf-8')
t += """
/* 单元格固定高 + 裁切，杜绝最后一行被下一节压住 */
.skcell{height:78px;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-start;gap:2px}
.skcell .s-i{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
"""
p.write_text(t, encoding='utf-8')
print('cell clamp')
