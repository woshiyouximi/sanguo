// R222：全局按钮可用性 —— 武將出擊被前排队友挡住时应拒绝；撤退后保護主將应拒绝。
const ROOT = String.raw`(() => {
  var sc = cc.director.getScene(); if (!sc) return null;
  var st = [sc], root = null;
  while (st.length) { var n = st.pop(); var cs = n._components || n.components || [];
    for (var i = 0; i < cs.length; i++) { var nm = cs[i].__classname__ || (cs[i].constructor && cs[i].constructor.name); if (nm === 'BattleRoot') root = cs[i]; }
    var ch = n.children || []; for (var j = 0; j < ch.length; j++) st.push(ch[j]); }
  return !!(root && root.world);
})()`;

const ACT = String.raw`(() => {
  var sc = cc.director.getScene(); var st = [sc], root = null;
  while (st.length) { var n = st.pop(); var cs = n._components || n.components || [];
    for (var i = 0; i < cs.length; i++) { var nm = cs[i].__classname__ || (cs[i].constructor && cs[i].constructor.name); if (nm === 'BattleRoot') root = cs[i]; }
    var ch = n.children || []; for (var j = 0; j < ch.length; j++) st.push(ch[j]); }
  if (!root || !root.world) return null;
  var input = root.input;
  var out = {};
  // 按顺序点：武將出擊(1) → 全軍撤退(3) → 保護主將(0)
  var xs = [58], ys = [1195, 1299, 1143];
  for (var k = 0; k < ys.length; k++) {
    input.tap(xs[0], ys[k], root.camX);
    out['tap' + k] = { msg: input.message, fled: !!(root.world.fled && root.world.fled.A) };
  }
  return out;
})()`;

export default async function steps({ s, evaluate, shot, sleep, log }) {
  await s('Page.bringToFront');
  let scene = null;
  for (let i = 0; i < 30; i++) {
    scene = await evaluate('(cc.director.getScene() ? cc.director.getScene().name : null)');
    if (scene === 'Battle') break;
    if (i === 0) {
      await evaluate("(function(){try{cc.director.loadScene('Battle');return 'go';}catch(e){return 'err:'+e;}})()");
    }
    await sleep(500);
  }
  for (let i = 0; i < 30; i++) {
    const r = await evaluate(ROOT);
    if (r) break;
    await sleep(300);
  }
  await sleep(800);
  const out = await evaluate(ACT);
  log('act', JSON.stringify(out));
  await shot('r222_after.png');
  return { result: out ? 'OK' : 'CHECK', out };
}
