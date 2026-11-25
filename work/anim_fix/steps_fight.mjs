// anim 取证 2：先逼双方接战（待機默认不动），再连拍 6 张（150ms），跟踪同一个「刚出手」的我方士兵。
export default async ({ shot, evaluate, sleep, log }) => {
  const st0 = await evaluate(`(() => { const w = window.__sanguo.state.world;
    return { tick: w.tick, atkA: w.stats.attacksA, atkB: w.stats.attacksB,
             hitsA: w.stats.hitsA, hitsB: w.stats.hitsB,
             aliveA: w.sides.A.aliveCount, aliveB: w.sides.B.aliveCount,
             rush: w.rush, mode: window.__sanguo.state.mode }; })()`);
  log('before ' + JSON.stringify(st0));

  // 双方接战：全軍突擊（与点「突 擊」按钮同一条路径）
  await evaluate(`(window.__sanguo.rushCommand(), 1)`);
  for (let i = 0; i < 40; i++) {
    const n = await evaluate(`window.__sanguo.state.world.stats.attacksA + window.__sanguo.state.world.stats.attacksB`);
    if (n > 30) break;
    await sleep(250);
  }
  const st1 = await evaluate(`(() => { const w = window.__sanguo.state.world;
    const lat = w.units.filter(u => u.lastAttackTick != null).length;
    const lht = w.units.filter(u => u.lastHitTick != null).length;
    return { tick: w.tick, atkA: w.stats.attacksA, atkB: w.stats.attacksB,
             hitsA: w.stats.hitsA, hitsB: w.stats.hitsB, blocks: w.stats.blocks,
             aliveA: w.sides.A.aliveCount, aliveB: w.sides.B.aliveCount,
             units: w.units.length, withLastAttackTick: lat, withLastHitTick: lht }; })()`);
  log('after-rush ' + JSON.stringify(st1));

  const snaps = [];
  for (let k = 0; k < 6; k++) {
    const sn = await evaluate(`(async () => {
      const sg = window.__sanguo, w = sg.state.world, st = sg.state;
      const P = await import('/dist/view/projection.js');
      const c = document.querySelector('canvas'), r = c.getBoundingClientRect();
      const pick = w.units.filter(u => u.side === 'A' && !u.isGeneral && u.alive && u.lastAttackTick != null)
        .sort((a, b) => (b.lastAttackTick - a.lastAttackTick) || (Math.abs(a.x - st.camX) - Math.abs(b.x - st.camX)))[0] || null;
      let p = null, foe = null;
      if (pick) {
        const pr = P.projectUnit(pick.x, pick.y, st.camX);
        const e = w.units.find(u => u.side === 'B' && u.alive && Math.abs(u.y - pick.y) < 0.01 && Math.abs(u.x - pick.x) < 1.6);
        const er = e ? P.projectUnit(e.x, e.y, st.camX) : null;
        p = { i: w.units.indexOf(pick), x: pick.x, y: pick.y, cd: pick.cd, lat: pick.lastAttackTick,
              since: w.tick - pick.lastAttackTick, sx: +pr.sx.toFixed(1), sy: +pr.sy.toFixed(1), sc: +pr.scale.toFixed(3) };
        foe = e && er ? { i: w.units.indexOf(e), x: e.x, y: e.y, cd: e.cd, lat: e.lastAttackTick == null ? -1 : e.lastAttackTick,
                          lht: e.lastHitTick == null ? -1 : e.lastHitTick,
                          sx: +er.sx.toFixed(1), sy: +er.sy.toFixed(1), sc: +er.scale.toFixed(3) } : null;
      }
      return { tick: w.tick, camX: +st.camX.toFixed(2),
               rect: { x: r.left, y: r.top, w: r.width, h: r.height },
               cp: +(r.width / 750).toFixed(4),
               midswing: w.units.filter(u => u.alive && u.cd > 16).length,
               alive: w.units.filter(u => u.alive).length, pick: p, foe };
    })()`);
    sn.k = k;
    snaps.push(sn);
    log(`shot ${k} tick=${sn.tick} camX=${sn.camX} midswing=${sn.midswing}/${sn.alive} ` +
        (sn.pick ? `pick#${sn.pick.i}@(${sn.pick.x},${sn.pick.y}) since=${sn.pick.since} sx=${sn.pick.sx} sy=${sn.pick.sy} ` : 'no-pick ') +
        (sn.foe ? `foe#${sn.foe.i} lht=${sn.foe.lht}` : 'no-foe'));
    await shot('live_' + k + '.png');
    await sleep(150);
  }
  return { st0, st1, snaps };
};
