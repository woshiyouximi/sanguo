import pathlib
p = pathlib.Path(r'F:\sanguo\proto\core.js')
t = p.read_text(encoding='utf-8')
start = t.index('  function camera(w) {')
end = t.index('  return {\n    TICK_HZ')
new = """  function camera(w) {
    // 取景：两军都还有兵时，看"双方前锋的中点"；一侧清空后，看剩下那侧的包围盒中心。
    var half = (900 / 2) / ROW_PX;            // 一屏半高 ≈6.3 行
    var aN = 0, bN = 0, aMin = 1e9, aMax = -1e9, bMin = 1e9, bMax = -1e9;
    for (var i = 0; i < w.units.length; i++) {
      var u = w.units[i];
      if (!u.alive) continue;
      if (u.side === 'A') { aN++; if (u.x < aMin) aMin = u.x; if (u.x > aMax) aMax = u.x; }
      else { bN++; if (u.x < bMin) bMin = u.x; if (u.x > bMax) bMax = u.x; }
    }
    var cam;
    if (aN && bN) cam = (aMin + bMax) / 2;        // A 前锋 = aMin，B 前锋 = bMax
    else if (aN) cam = (aMin + aMax) / 2;
    else if (bN) cam = (bMin + bMax) / 2;
    else cam = GRID_W / 2;
    return Math.max(half, Math.min(GRID_W - 1 - half, cam));
  }

"""
t = t[:start] + new + t[end:]
p.write_text(t, encoding='utf-8')
print('camera v2')
