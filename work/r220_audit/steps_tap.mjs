// R220：底栏按钮端到端 —— 用真实触摸坐标点「前軍前進」「保護主將」，看内核是否收到。
const ROOT = String.raw`(() => {
  var sc = cc.director.getScene(); if (!sc) return null;
  var st = [sc], root = null;
  while (st.length) { var n = st.pop(); var cs = n._components || n.components || [];
    for (var i = 0; i < cs.length; i++) { var nm = cs[i].__classname__ || (cs[i].constructor && cs[i].constructor.name); if (nm === 'BattleRoot') root = cs[i]; }
    var ch = n.children || []; for (var j = 0; j < ch.length; j++) st.push(ch[j]); }
  if (!root || !root.world) return null;
  var input = root.input;
  var hitAdvance = input.hitTest(574, 1072, root.camX);
  var effAdvance = input.tap(574, 1072, root.camX);
  var msgAdvance = input.message;
  var hitGuard = input.hitTest(58, 1143, root.camX);
  var effGuard = input.tap(58, 1143, root.camX);
  var msgGuard = input.message;
  var army = root.world.army && root.world.army.A;
  return {
    hitAdvance: hitAdvance && { type: hitAdvance.type, slot: hitAdvance.slot, label: hitAdvance.label, canUse: hitAdvance.canUse },
    effAdvance: (effAdvance || []).map(function (e) { return e && e.kind; }),
    msgAdvance: msgAdvance,
    hitGuard: hitGuard && { type: hitGuard.type, kind: hitGuard.kind, label: hitGuard.label, canUse: hitGuard.canUse },
    effGuard: (effGuard || []).map(function (e) { return e && e.kind; }),
    msgGuard: msgGuard,
    takenMul: army ? army.takenMul : null,
    flags: army ? army.flags : null,
  };
})()`;

export default async function steps({ evaluate, log, shot }) {
  const r1 = await evaluate(ROOT);
  log('tap1', JSON.stringify(r1));
  await shot('r220_tap.png');
  return { result: r1 ? 'OK' : 'CHECK', r1 };
}
