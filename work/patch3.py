import pathlib
p = pathlib.Path(r'F:\sanguo\proto\core.js')
t = p.read_text(encoding='utf-8')
old = t[t.index('  function camera(w) {'):t.index('  return {\n    TICK_HZ')]
new = """  function camera(w) {
    // 只看前锋：A 向 -x 推进，故其前锋是 min x；B 向 +x 推进，其前锋是 max x
    var ax = GRID_W - 1, bx = 0, minX = GRID_W - 1, maxX = 0, any = false;
    for (var i = 0; i < w.units.length; i++) {
      var u = w.units[i];
      if (!u.alive) continue;
      any = true;
      if (u.x < minX) minX = u.x;
      if (u.x > maxX) maxX = u.x;
      if (u.side === 'A') { if (u.x < ax) ax = u.x; }
      else { if (u.x > bx) bx = u.x; }
    }
    if (!any) return GRID_W / 2;
    var half = (900 / 2) / ROW_PX;            // ≈6.3 行
    // 一侧已全灭时 ax/bx 会失真，所以再用"全部存活单位的包围盒"兜一次
    var cam = (ax + bx) / 2;
    cam = Math.max(maxX - half, Math.min(minX + half, cam));
    return Math.max(half, Math.min(GRID_W - 1 - half, cam));
  }

"""
t = t.replace(old, new)
p.write_text(t, encoding='utf-8')
print('camera patched')
