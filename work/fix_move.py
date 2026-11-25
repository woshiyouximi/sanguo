import pathlib
p = pathlib.Path(r'F:\sanguo\game\src\core\battle.ts')
t = p.read_text(encoding='utf-8')
old = """  for (const u of world.units) {
    if (!u.alive || u.isGeneral) continue;
    const target = nearestEnemy(world, u);
    if (!target) continue;
    const dx = target.x - u.x;
    const dy = target.y - u.y;
    const d = Math.hypot(dx, dy);
    if (d > ENGAGE_RANGE && d > 1e-6) {
      u.x += (dx / d) * MOVE_PER_TICK;
      u.y += (dy / d) * MOVE_PER_TICK;
      u.x = Math.max(0.2, Math.min(GRID_W - 1.2, u.x));
      u.y = Math.max(0.2, Math.min(GRID_H - 1.2, u.y));
    }
  }"""
new = """  // 先算位移、再统一应用：否则先遍历的一侧用"旧位置"、后遍历的一侧用"新位置"，
  // 几百 tick 积累下来会把战线几何系统性地偏给某一侧（实测镜像局会 100% 一边胜）。
  const moves: { u: Unit; dx: number; dy: number }[] = [];
  for (const u of world.units) {
    if (!u.alive || u.isGeneral) continue;
    const target = nearestEnemy(world, u);
    if (!target) continue;
    const dx = target.x - u.x;
    const dy = target.y - u.y;
    const d = Math.hypot(dx, dy);
    if (d > ENGAGE_RANGE && d > 1e-6) moves.push({ u, dx: (dx / d) * MOVE_PER_TICK, dy: (dy / d) * MOVE_PER_TICK });
  }
  for (const m of moves) {
    m.u.x = Math.max(0.2, Math.min(GRID_W - 1.2, m.u.x + m.dx));
    m.u.y = Math.max(0.2, Math.min(GRID_H - 1.2, m.u.y + m.dy));
  }"""
assert old in t
t = t.replace(old, new)
p.write_text(t, encoding='utf-8')
print('simultaneous movement')
