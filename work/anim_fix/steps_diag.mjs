// 只读诊断：world 字段、单位字段、图集加载状态、画布矩形
export default async ({ evaluate, log }) => {
  const r = await evaluate(`(async () => {
    const sg = window.__sanguo, st = sg.state, w = st.world;
    const c = document.querySelector('canvas');
    const rect = c ? c.getBoundingClientRect() : null;
    const keys = w ? Object.keys(w).slice(0, 40) : [];
    const u0 = w && w.units ? w.units[0] : null;
    const withLat = w ? w.units.filter(u => u.lastAttackTick != null).length : -1;
    const anySwing = w ? w.units.filter(u => u.cd > 16).length : -1;
    const cdHist = w ? (() => { const h = {}; for (const u of w.units) { const b = u.cd === 0 ? '0' : u.cd > 16 ? '17-40' : '1-16'; h[b] = (h[b] || 0) + 1; } return h; })() : null;
    return {
      mode: st.mode, tick: w && w.tick, camX: st.camX, rect,
      unitsLoaded: !!st.units, groups: st.units ? Object.keys(st.units.groups || {}).length : -1,
      frames: st.units ? Object.keys(st.units.frames || {}).length : -1,
      worldKeys: keys, unit0: u0 ? Object.keys(u0) : null,
      unit0vals: u0, withLat, anySwing, cdHist,
      armyA: st.armyA ? Object.keys(st.armyA) : null,
    };
  })()`);
  log(JSON.stringify(r, null, 1));
  return r;
};
