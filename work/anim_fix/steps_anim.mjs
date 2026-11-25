// anim 取证：连拍 6 张（间隔 150ms），同时记录每个 tick 的世界快照 + 攻击单位屏幕矩形。
// 用法：node work\cocos_verify\cdpweb.mjs run F:\sanguo\work\anim_fix\steps_anim.mjs
// 期望 env：PORT=9342 MATCH=5299 OUTDIR=F:\sanguo\work\anim_fix
const WAIT = `(async () => {
  const t0 = Date.now();
  while (Date.now() - t0 < 15000) {
    if (window.__sanguo && window.__sanguo.booted) return true;
    await new Promise(r => setTimeout(r, 200));
  }
  return false;
})()`;

// 页面内取快照：canvas 屏幕矩形 + tick + camX + 全部单位（含算好的屏幕脚底坐标）
const SNAP = `(async () => {
  const sg = window.__sanguo;
  if (!sg) return { err: 'no __sanguo' };
  const c = document.querySelector('canvas');
  const r = c.getBoundingClientRect();
  const P = await import('/dist/view/projection.js');
  const st = sg.state;
  const w = st.world;
  if (!w) return { err: 'no world', mode: st.mode, rect: { x: r.left, y: r.top, w: r.width, h: r.height } };
  const camX = st.camX;
  const units = [];
  for (let i = 0; i < w.units.length; i++) {
    const u = w.units[i];
    if (!u.alive) continue;
    const p = P.projectUnit(u.x, u.y, camX);
    units.push({
      i, side: u.side, kind: u.kind, gen: !!u.isGeneral,
      x: +u.x.toFixed(3), y: +u.y.toFixed(3),
      cd: u.cd, lat: u.lastAttackTick == null ? -1 : u.lastAttackTick,
      lht: u.lastHitTick == null ? -1 : u.lastHitTick,
      sx: +p.sx.toFixed(1), sy: +p.sy.toFixed(1), sc: +p.scale.toFixed(3),
    });
  }
  return {
    mode: st.mode, tick: w.tick, camX: +camX.toFixed(2),
    rect: { x: r.left, y: r.top, w: r.width, h: r.height },
    cssPerDesign: r.width / 750,
    unitsLoaded: !!st.units,
    groups: st.units ? Object.keys(st.units.groups || {}).length : -1,
    attacks: units.filter(u => u.cd > 16).length,
    units,
  };
})()`;

export default async ({ shot, evaluate, sleep, log, OUTDIR }) => {
  log('OUTDIR=' + OUTDIR);
  const booted = await evaluate(WAIT);
  log('booted=' + booted);
  let info = await evaluate(`(() => {
    const c = document.querySelector('canvas');
    const r = c ? c.getBoundingClientRect() : null;
    return { href: location.href, mode: window.__sanguo ? window.__sanguo.state.mode : '?',
             rect: r ? { x: r.left, y: r.top, w: r.width, h: r.height } : null };
  })()`);
  log('boot ' + JSON.stringify(info));
  if (info.mode !== 'fighting' && info.mode !== 'settled') {
    log('clicking #start');
    await evaluate(`document.getElementById('start').click(), 1`);
    await sleep(1200);
    info = await evaluate(`({ mode: window.__sanguo.state.mode, tick: window.__sanguo.state.world && window.__sanguo.state.world.tick })`);
    log('after start ' + JSON.stringify(info));
  }

  const snaps = [];
  const names = [];
  for (let k = 0; k < 6; k++) {
    const nm = `live_${k}`;
    const sn = await evaluate(SNAP);
    if (sn && !sn.err) {
      sn.k = k;
      snaps.push(sn);
      // 选「最像正在挥砍」的我方士兵：cd 最大（cd=40 刚出手），且在主将/近处
      const cand = sn.units.filter(u => u.side === 'A' && !u.gen && u.cd > 20)
        .sort((a, b) => Math.abs(a.x - sn.camX) - Math.abs(b.x - sn.camX))[0] || null;
      sn.pick = cand;
      log(`shot ${k} tick=${sn.tick} camX=${sn.camX} units=${sn.units.length} midswing=${sn.attacks} pick=${cand ? `${cand.kind}@(${cand.x},${cand.y}) cd=${cand.cd} sx=${cand.sx} sy=${cand.sy}` : 'none'}`);
    } else {
      log(`shot ${k} SNAPSHOT ERR ` + JSON.stringify(sn));
    }
    await shot(nm + '.png');
    names.push(nm);
    await sleep(150);
  }
  const pickTrack = snaps.map(s => ({ k: s.k, tick: s.tick, pick: s.pick }));
  return { rect: snaps[0] && snaps[0].rect, cssPerDesign: snaps[0] && snaps[0].cssPerDesign,
           unitsLoaded: snaps[0] && snaps[0].unitsLoaded, groups: snaps[0] && snaps[0].groups,
           track: pickTrack, names };
};
