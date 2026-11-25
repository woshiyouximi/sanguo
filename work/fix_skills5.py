import pathlib
p = pathlib.Path(r'F:\sanguo\proto\ui\screens\g1.js')
t = p.read_text(encoding='utf-8')
old1 = """'<div class="s-i">Lv' + m.lv + ' 解鎖 · MP ' + m.mp + (m.attack ? ' · 攻 ' + m.attack : '') + '</div>' +"""
new1 = """'<div class="s-i">Lv' + m.lv + ' · MP' + m.mp + (m.attack ? ' · 攻' + m.attack : '') + '</div>' +"""
assert old1 in t
t = t.replace(old1, new1)
p.write_text(t, encoding='utf-8')
print('shorter cell text')
