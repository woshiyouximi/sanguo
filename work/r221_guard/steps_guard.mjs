// R221：点「保護主將」后，7 个士兵槽应变 9（歸陣），士兵平均 x 应往己方线退。
const ROOT = String.raw`(() => {
  var sc = cc.director.getScene(); if (!sc) return null;
  var st = [sc], root = null;
  while (st.length) { var n = st.pop(); var cs = n._components || n.components || [];
    for (var i = 0; i < cs.length; i++) { var nm = cs[i].__classname__ || (cs[i].constructor && cs[i].constructor.name); if (nm === 'BattleRoot') root = cs[i]; }
    var ch = n.children || []; for (var j = 0; j < ch.length; j++) st.push(ch[j]); }
  if (!root || !root.world) return null;
  var sum = 0, cnt = 0;
  for (var k = 0; k < root.world.units.length; k++) { var u = root.world.units[k]; if (u.alive && u.side === 'A' && !u.isGeneral) { sum += u.x; cnt++; } }
  return {
    root: true, avgX: cnt ? sum / cnt : null, tick: Math.round(root.world.tick),
    cmds: (root.world.army && root.world.army.A) ? root.world.army.A : null,
    hit: (function () { var h = root.input.hitTest(58, 1143, root.camX); return h && { type: h.type, kind: h.kind, canUse: h.canUse }; })(),
    apply: (function () { try { root.input.tap(58, 1143, root.camX); return root.input.message; } catch (e) { return 'err:' + e; } })(),
  };
})()`;

export default async function steps({ s, evaluate, sleep, log, shot }) {
  await s('Page.bringToFront');
  await s('Emulation.setFocusEmulationEnabled', { enabled: true });
  const before = await evaluate(ROOT);
  log('before ' + JSON.stringify(before));
  await sleep(6000);
  const after = await evaluate(ROOT);
  log('after ' + JSON.stringify(after));
  await shot('r221_guard.png');
  return { result: before && after ? 'OK' : 'CHECK', before, after };
}
