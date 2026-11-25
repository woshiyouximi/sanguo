// 取当前战况 + 某车道内全部单位的屏幕坐标（供 Python 裁切对齐）
export default async ({ evaluate, log }) => {
  const r = await evaluate(`(async () => {
    const sg = window.__sanguo, w = sg.state.world, st = sg.state;
    const P = await import('/dist/view/projection.js');
    const c = document.querySelector('canvas'), rc = c.getBoundingClientRect();
    const pickLane = 7;
    const lane = [];
    for (const u of w.units) {
      if (!u.alive || u.isGeneral || Math.abs(u.y - pickLane) > 0.5) continue;
      const p = P.projectUnit(u.x, u.y, st.camX);
      lane.push({ i: w.units.indexOf(u), side: u.side, kind: u.kind, x: +u.x.toFixed(2), y: +u.y.toFixed(2),
                  cd: u.cd, lat: u.lastAttackTick == null ? -1 : u.lastAttackTick,
                  lht: u.lastHitTick == null ? -1 : u.lastHitTick,
                  sx: +p.sx.toFixed(1), sy: +p.sy.toFixed(1), sc: +p.scale.toFixed(3) });
    }
    lane.sort((a, b) => a.sx - b.sx);
    return { tick: w.tick, camX: +st.camX.toFixed(2), mode: st.mode,
             rect: { x: rc.left, y: rc.top, w: rc.width, h: rc.height }, cp: rc.width / 750,
             atkA: w.stats.attacksA, atkB: w.stats.attacksB, hitsA: w.stats.hitsA, hitsB: w.stats.hitsB,
             blocks: w.stats.blocks, aliveA: w.sides.A.aliveCount, aliveB: w.sides.B.aliveCount,
             withLat: w.units.filter(u => u.lastAttackTick != null).length,
             withLht: w.units.filter(u => u.lastHitTick != null).length,
             lane };
  })()`);
  log(JSON.stringify(r));
  return r;
};
