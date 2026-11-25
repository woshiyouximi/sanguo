# 一次性脚本（w9-render3）：给 Draw.ts 的 vBands/hBands 加「split 那一维的整数色阶」
import io

p = r'F:\sanguo\game\cocos\assets\scripts\Draw.ts'
s = io.open(p, encoding='utf-8').read()

v_old = """      const color = mixHex(from, to, mixT(t, ct));
      out.push({ x: x + xs[j][0], y: y + a, w: xs[j][1] - xs[j][0], h: b - a, color, alpha: washAlpha(alpha, ct) });"""
v_new = """      const color = shiftHex(mixHex(from, to, mixT(t, ct)), Math.round((ct - 0.5) * 2 * COL_SHIFT));
      out.push({ x: x + xs[j][0], y: y + a, w: xs[j][1] - xs[j][0], h: b - a, color, alpha: washAlpha(alpha, ct) });"""

h_old = """      const color = mixHex(from, to, mixT(t, ct));
      out.push({ x: x + a, y: y + ys[j][0], w: b - a, h: ys[j][1] - ys[j][0], color, alpha: washAlpha(alpha, ct) });"""
h_new = """      const color = shiftHex(mixHex(from, to, mixT(t, ct)), Math.round((ct - 0.5) * 2 * COL_SHIFT));
      out.push({ x: x + a, y: y + ys[j][0], w: b - a, h: ys[j][1] - ys[j][0], color, alpha: washAlpha(alpha, ct) });"""

c_old = "const WASH_STRENGTH = 0.16;"
c_new = "const WASH_STRENGTH = 0.16;\n\n/** `split` 那一維的整數色階幅度（見 `shiftHex`）：±5 級，約等於 web `.sec` 的絹面反光 */\nconst COL_SHIFT = 5;"

for a, b in [(v_old, v_new), (h_old, h_new), (c_old, c_new)]:
    assert s.count(a) == 1, (repr(a[:40]), s.count(a))
    s = s.replace(a, b)

io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('ok')
