import pathlib
core = pathlib.Path(r'F:\sanguo\proto\core.js')
t = core.read_text(encoding='utf-8')
old = "      minor: 0,\n      winner: winnerSide,"
if old not in t:
    old = "      winner: winnerSide, mode: mode, modeName: modeName,"
    new = "      winner: winnerSide, mode: mode, modeName: modeName, enemyLevel: L.general.level,"
    assert old in t
    t = t.replace(old, new)
core.write_text(t, encoding='utf-8')

html = pathlib.Path(r'F:\sanguo\proto\battle.html')
h = html.read_text(encoding='utf-8')
h = h.replace("' 兵 ×6 ＋ 敵將 Lv' + world.sides.B.general.level + ' ×'", "' 兵 ×6 ＋ 敵將 Lv' + s.enemyLevel + ' ×'")
html.write_text(h, encoding='utf-8')
print('label fixed')
