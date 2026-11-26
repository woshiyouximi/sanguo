// R224 车轮战烟测：注入 3v3 小兵力对局，验证「结算→續戰→下一位上场→胜者残兵继承」。
// 跑法：先 cdpweb launch（OUTDIR=work/r221_duel；页面进 Battle 场景），再 run 本文件。
const OUTDIR = process.env.OUTDIR || 'F:\\sanguo\\work\\r221_duel';

const ROOT = String.raw`
(function () {
  var sc = cc.director.getScene();
  if (!sc) return null;
  var st = [sc], root = null;
  while (st.length) {
    var n = st.pop(); var cs = n._components || n.components || [];
    for (var i = 0; i < cs.length; i++) {
      var nm = cs[i].__classname__ || (cs[i].constructor && cs[i].constructor.name);
      if (nm === 'BattleRoot') root = cs[i];
    }
    var ch = n.children || []; for (var j = 0; j < ch.length; j++) st.push(ch[j]);
  }
  return root;
})()
`;

const STATE = String.raw`
(function () {
  var sc = cc.director.getScene();
  if (!sc) return { ok: false, error: 'no-scene' };
  var st = [sc], root = null;
  while (st.length) {
    var n = st.pop(); var cs = n._components || n.components || [];
    for (var i = 0; i < cs.length; i++) {
      var nm = cs[i].__classname__ || (cs[i].constructor && cs[i].constructor.name);
      if (nm === 'BattleRoot') root = cs[i];
    }
    var ch = n.children || []; for (var j = 0; j < ch.length; j++) st.push(ch[j]);
  }
  if (!root) return { ok: false, error: 'no-BattleRoot' };
  var byName = function (want) {
    var s2 = [sc], hit = null;
    while (s2.length) { var n2 = s2.pop(); if (!hit && n2.name === want) hit = n2; var c2 = n2.children || []; for (var k = 0; k < c2.length; k++) s2.push(c2[k]); }
    return hit;
  };
  var readLabel = function (name) {
    var n = byName(name); if (!n) return null;
    var l = n.getComponent && n.getComponent('cc.Label');
    return l ? String(l.string || '') : null;
  };
  var w = root.world;
  var gens = {};
  if (w) {
    for (var u = 0; u < w.units.length; u++) {
      var un = w.units[u];
      if (!un.alive || !un.isGeneral) continue;
      var gs = w.sides[un.side] && w.sides[un.side].general;
      gens[un.side] = { name: gs ? gs.name : '', hp: gs ? Math.round(gs.hp) : 0, mp: gs ? Math.round(gs.mp) : 0 };
    }
  }
  var dots = { A: 0, B: 0 };
  if (w) for (var v = 0; v < w.units.length; v++) { var uu = w.units[v]; if (uu.alive && !uu.isGeneral) dots[uu.side]++; }
  return {
    ok: true,
    tick: w ? Math.round(w.tick) : -1,
    over: !!(w && w.over),
    winner: root.settlement ? root.settlement.winner : null,
    settle: !!root.settlement,
    gens: gens,
    dots: dots,
    indexA: root.launch ? root.launch.indexA : null,
    indexB: root.launch ? root.launch.indexB : null,
    nextName: root.nextName || null,
    nextGen: root.nextBout ? (root.nextBout.gen || null) : null,
    nextBgen: root.nextBout ? (root.nextBout.bgen || null) : null,
    nextSoldiers: root.nextBout ? root.nextBout.soldiers : null,
    nextBSoldiers: root.nextBout ? root.nextBout.bsoldiers : null,
    carryA: root.nextBout ? root.nextBout.carryA : null,
    carryB: root.nextBout ? root.nextBout.carryB : null,
    again: readLabel('SettleAgainLabel'),
    againSub: readLabel('SettleAgainSub'),
  };
})()
`;

const START = String.raw`
(function () {
  var sc = cc.director.getScene();
  var st = [sc], root = null;
  while (st.length) {
    var n = st.pop(); var cs = n._components || n.components || [];
    for (var i = 0; i < cs.length; i++) {
      var nm = cs[i].__classname__ || (cs[i].constructor && cs[i].constructor.name);
      if (nm === 'BattleRoot') root = cs[i];
    }
    var ch = n.children || []; for (var j = 0; j < ch.length; j++) st.push(ch[j]);
  }
  if (!root) return { ok: false, error: 'no-BattleRoot' };
  root.launch = {
    from: 'campaign', city: '平原', seed: 20261124, terrain: 0, month: 2,
    troop: 2, form: 0, soldiers: 2, btroop: 10, bform: 3, bsoldiers: 2,
    gen: '關羽', genStr: 97, genInt: 75, genLevel: 6,
    bgen: '張角', bstr: 70, bint: 88,
    rosterA: ['關羽', '張飛', '劉備'],
    rosterB: ['張角', '張梁', '張寶'],
    indexA: 0, indexB: 0
  };
  root.settlement = null;
  root.nextBout = null;
  root.nextName = null;
  root.loading = false;
  root.boot();
  return { ok: true, launched: true };
})()
`;

const NEXT = String.raw`
(function () {
  var sc = cc.director.getScene();
  var st = [sc], root = null;
  while (st.length) {
    var n = st.pop(); var cs = n._components || n.components || [];
    for (var i = 0; i < cs.length; i++) {
      var nm = cs[i].__classname__ || (cs[i].constructor && cs[i].constructor.name);
      if (nm === 'BattleRoot') root = cs[i];
    }
    var ch = n.children || []; for (var j = 0; j < ch.length; j++) st.push(ch[j]);
  }
  if (!root || !root.nextBout) return { ok: false, error: 'no-next-bout' };
  var nb = root.nextBout;
  root.launch = nb;
  root.nextBout = null;
  root.nextName = null;
  root.settlement = null;
  root.input.setSettled(false);
  root.loading = false;
  root.boot();
  return { ok: true, gen: nb.gen, bgen: nb.bgen, indexA: nb.indexA, indexB: nb.indexB };
})()
`;

export default async function steps({ s, evaluate, shot, sleep, log }) {
  const ev = async (expr, tag) => {
    const v = await evaluate(expr);
    if (v && v.__throw) throw new Error((tag || 'eval') + ' threw: ' + v.__throw);
    return v;
  };
  const out = { result: 'CHECK' };
  await s('Page.bringToFront');
  await s('Emulation.setFocusEmulationEnabled', { enabled: true });
  const scene = await ev("(cc.director.getScene() ? cc.director.getScene().name : null)", 'scene');
  const scene0 = scene;
  if (scene0 !== 'Battle') {
    for (let i = 0; i < 12; i++) {
      await ev("(function () { try { cc.director.loadScene('Battle'); return 'go'; } catch (e) { return 'err:' + e; } })()", 'load');
      await sleep(900);
      const now = await ev("(cc.director.getScene() ? cc.director.getScene().name : null)", 'scene2');
      if (now === 'Battle') break;
    }
  }
  for (let i = 0; i < 60; i++) {
    const st = await ev(STATE, 'state');
    if (st && st.ok) break;
    await sleep(500);
  }
  out.start = await ev(START, 'start');
  await sleep(1500);
  let st = await ev(STATE, 'state');
  out.started = st;
  for (let i = 0; i < 100; i++) {
    st = await ev(STATE, 'state');
    if (st && st.settle) break;
    await sleep(500);
  }
  out.after1 = st;
  await shot('r221_duel_settle.png');
  if (st && st.settle && st.nextName) {
    out.next = await ev(NEXT, 'next');
    await sleep(2000);
    for (let i = 0; i < 30; i++) {
      const st2 = await ev(STATE, 'state');
      if (st2 && st2.ok && st2.tick >= 0 && !st2.settle) break;
      await sleep(400);
    }
    out.after2 = await ev(STATE, 'state');
    await shot('r221_duel_next.png');
  }
  const a = out.after1 || {};
  out.result = a.ok && a.settle && !!a.nextName && out.after2 && out.after2.ok && out.after2.tick >= 0 ? 'OK' : 'CHECK';
  log('RESULT', out.result, 'after1', JSON.stringify(out.after1), 'after2', JSON.stringify(out.after2));
  return out;
}
