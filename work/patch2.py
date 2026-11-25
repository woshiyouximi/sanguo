import pathlib, re

core = pathlib.Path(r'F:\sanguo\proto\core.js')
t = core.read_text(encoding='utf-8')

old_proj = """  function project(worldX, worldY, camX) {
    return {
      x: worldY * LANE_PX,
      y: 900 - (worldX - camX) * ROW_PX
    };
  }"""
new_proj = """  // 竖屏投影（PROJECT_BRIEF §6.1）：
  //   worldX = 沿战场纵深（0 = 敌方后阵，70 = 我方后阵），worldY = 14 条车道
  //   screenX = worldY * LANE_PX；screenY = CAM_Y + (worldX - camX) * ROW_PX
  // 我方 worldX 大 → screenY 大 → 画面下方；敌方在上方。
  var CAM_Y = 550;           // 战场可视带 100..1000 的正中
  function project(worldX, worldY, camX) {
    return {
      x: worldY * LANE_PX,
      y: CAM_Y + (worldX - camX) * ROW_PX
    };
  }"""
assert old_proj in t
t = t.replace(old_proj, new_proj)

old_cam = """  function camera(w) {
    // 只看前锋：双方最靠前（面向对方）的那个兵
    var ax = 0, bx = GRID_W - 1;
    for (var i = 0; i < w.units.length; i++) {
      var u = w.units[i];
      if (!u.alive) continue;
      if (u.side === 'A' && u.x > ax) ax = u.x;
      if (u.side === 'B' && u.x < bx) bx = u.x;
    }
    return (ax + bx) / 2;
  }"""
new_cam = """  function camera(w) {
    // 只看前锋：A 向 -x 推进，故其前锋是 min x；B 向 +x 推进，其前锋是 max x
    var ax = GRID_W - 1, bx = 0;
    for (var i = 0; i < w.units.length; i++) {
      var u = w.units[i];
      if (!u.alive) continue;
      if (u.side === 'A') { if (u.x < ax) ax = u.x; }
      else { if (u.x > bx) bx = u.x; }
    }
    var cam = (ax + bx) / 2;
    // 夹住，别让可视带跑出战场
    var half = (900 / 2) / ROW_PX;        // ≈6.3 行
    return Math.max(half, Math.min(GRID_W - 1 - half, cam));
  }"""
assert old_cam in t
t = t.replace(old_cam, new_cam)

old_gen = """      var back = side === 'A' ? Math.max(0.5, Math.min.apply(null, pos.map(function (p) { return p.x; })) - 2)
                              : Math.min(GRID_W - 1.5, Math.max.apply(null, pos.map(function (p) { return p.x; })) + 2);"""
new_gen = """      // 主将站在**后阵**：A 往后阵方向（+x）退 2 格，B 往 -x 退 2 格
      var xs = pos.map(function (p) { return p.x; });
      var back = side === 'A'
        ? Math.min(GRID_W - 0.5, Math.max.apply(null, xs) + 2)
        : Math.max(0.5, Math.min.apply(null, xs) - 2);"""
assert old_gen in t
t = t.replace(old_gen, new_gen)
core.write_text(t, encoding='utf-8')
print('core.js patched')

# ---------------- battle.html
p = pathlib.Path(r'F:\sanguo\proto\battle.html')
h = p.read_text(encoding='utf-8')

old_units = """      var pr = C.project(u.x, u.y, cam);
      var sx = pr.x, sy = pr.y - (TOP + H - 100);"""
new_units = """      var pr = C.project(u.x, u.y, cam);
      var sx = pr.x, sy = pr.y;"""
assert old_units in h
h = h.replace(old_units, new_units)

old_row = """      var p = C.project(r, 0, cam);
      var y = p.y - (TOP + H - 100);"""
new_row = """      var p = C.project(r, 0, cam);
      var y = p.y;"""
assert old_row in h
h = h.replace(old_row, new_row)

old_nan = "' &nbsp;|&nbsp; 已击杀 <b>' + me.start - me.aliveCount + '</b> 兵'"
new_nan = "' &nbsp;|&nbsp; 已击杀 <b>' + (me.start - me.aliveCount) + '</b> 兵'"
assert old_nan in h
h = h.replace(old_nan, new_nan)

# 把"我"从顶部 HUD 挪到底部（我方在下）
old_hud = """      <div class="side">
        <div class="bar"><i id="meHp"></i></div>
        <span class="tag" id="meTag">—</span>
        <span class="name" style="color:var(--blue2)">我</span>
      </div>
    </div>"""
new_hud = """    </div>
    <div id="hudMe">
      <div class="side">
        <div class="bar"><i id="meHp"></i></div>
        <span class="tag" id="meTag">—</span>
        <span class="name" style="color:var(--blue2)">我</span>
      </div>
    </div>"""
assert old_hud in h
h = h.replace(old_hud, new_hud)

# 顶部 HUD 只留敌方，样式改成一行
h = h.replace("#hud{position:absolute;left:0;top:0;width:750px;display:flex;",
              "#hudMe{position:absolute;left:0;top:920px;width:750px;display:flex;justify-content:flex-end;padding:0 26px;}\n"
              "#hud{position:absolute;left:0;top:0;width:750px;display:flex;")

p.write_text(h, encoding='utf-8')
print('battle.html patched')
