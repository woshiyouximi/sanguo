// R215：主将贴脸时头像牌是否错开（测试专用：直接把两个主将挪到同一格再重绘）
// 跑法：PAGE_URL=... PORT=9354 PROFILE=work\.edgeprof_r215m OUTDIR=work\r215_cocos
import fs from 'node:fs';
import path from 'node:path';

const OUTDIR = process.env.OUTDIR || 'F:\\sanguo\\work\\r215_cocos';

const ROOT = String.raw`(function () {
  var sc = cc.director.getScene(), st = [sc], root = null;
  while (st.length) {
    var n = st.pop(), cs = n._components || n.components || [];
    for (var i = 0; i < cs.length; i++) {
      var nm = cs[i].__classname__ || (cs[i].constructor && cs[i].constructor.name);
      if (nm === 'BattleRoot') root = cs[i];
    }
    var ch = n.children || [];
    for (var j = 0; j < ch.length; j++) st.push(ch[j]);
  }
  return !!root;
})()`;

const MOVE = String.raw`(function () {
  var sc = cc.director.getScene(), st = [sc], root = null;
  while (st.length) {
    var n = st.pop(), cs = n._components || n.components || [];
    for (var i = 0; i < cs.length; i++) {
      var nm = cs[i].__classname__ || (cs[i].constructor && cs[i].constructor.name);
      if (nm === 'BattleRoot') root = cs[i];
    }
    var ch = n.children || []; for (var j = 0; j < ch.length; j++) st.push(ch[j]);
  }
  if (!root || !root.world) return { ok: false };
  var w = root.world, moved = [];
  for (var u = 0; u < w.units.length; u++) {
    var un = w.units[u];
    if (!un.isGeneral) continue;
    un.x = un.side === 'A' ? 36 : 35.2;
    un.y = 6;
    moved.push({ side: un.side, x: un.x, y: un.y });
  }
  root.redraw();
  var byName = function (want) {
    var s2 = [cc.director.getScene()], hit = null;
    while (s2.length) { var n2 = s2.pop(); if (!hit && n2.name === want) hit = n2; var c2 = n2.children || []; for (var k = 0; k < c2.length; k++) s2.push(c2[k]); }
    return hit;
  };
  var pos = function (name) { var n = byName(name); return n ? { x: Math.round(n.position.x * 10) / 10, y: Math.round(n.position.y * 10) / 10 } : null; };
  return { ok: true, moved: moved, tick: w.tick, faceA: pos('GeneralFaceA'), faceB: pos('GeneralFaceB'), nameA: pos('GeneralNameA'), nameB: pos('GeneralNameB') };
})()`;

export default async function steps({ s, evaluate, shot, sleep, log }) {
  const ev = async (expr, tag) => {
    const v = await evaluate(expr);
    if (v && v.__throw) throw new Error((tag || 'eval') + ' threw: ' + v.__throw);
    return v;
  };
  await s('Page.bringToFront');
  await s('Emulation.setFocusEmulationEnabled', { enabled: true });
  const poll = "(function () { try { if (typeof cc !== 'object' || !cc.director) return null; var sc = cc.director.getScene(); return sc ? { scene: sc.name, frames: cc.director.getTotalFrames() } : null; } catch (e) { return null; } })()";
  let ready = null;
  for (let i = 0; i < 40; i++) {
    ready = await evaluate(poll);
    if (ready && !ready.__throw && ready.frames > 3) break;
    await sleep(1000);
  }
  if (!ready || ready.__throw) throw new Error('引擎没起来');
  let scene = await ev('(cc.director.getScene() ? cc.director.getScene().name : null)', 'scene');
  if (scene !== 'Battle') {
    await ev("(function () { try { cc.director.loadScene('Battle'); return 'go'; } catch (e) { return 'err:' + e; } })()", 'load');
    await sleep(1800);
  }
  let root = null;
  for (let i = 0; i < 30; i++) {
    root = await ev(ROOT, 'root');
    if (root) break;
    await sleep(500);
  }
  if (!root) throw new Error('没有 BattleRoot');

  const out = {};
  out.meet = await ev(MOVE, 'move');
  await sleep(300);
  await s('Page.bringToFront');
  out.shot = await shot('r215_meet.png');

  // 隔开两条车道再看一眼：不应有错位
  out.away = await ev(String.raw`(function () {
    var sc = cc.director.getScene(), st = [sc], root = null;
    while (st.length) { var n = st.pop(), cs = n._components || n.components || [];
      for (var i = 0; i < cs.length; i++) { var nm = cs[i].__classname__ || (cs[i].constructor && cs[i].constructor.name); if (nm === 'BattleRoot') root = cs[i]; }
      var ch = n.children || []; for (var j = 0; j < ch.length; j++) st.push(ch[j]); }
    var w = root.world;
    for (var u = 0; u < w.units.length; u++) { var un = w.units[u]; if (!un.isGeneral) continue; un.y = un.side === 'A' ? 2 : 11; }
    root.redraw();
    var byName = function (want) { var s2 = [cc.director.getScene()], hit = null; while (s2.length) { var n2 = s2.pop(); if (!hit && n2.name === want) hit = n2; var c2 = n2.children || []; for (var k = 0; k < c2.length; k++) s2.push(c2[k]); } return hit; };
    var pos = function (name) { var n = byName(name); return n ? { x: Math.round(n.position.x * 10) / 10, y: Math.round(n.position.y * 10) / 10 } : null; };
    return { faceA: pos('GeneralFaceA'), faceB: pos('GeneralFaceB') };
  })()`, 'away');
  await sleep(300);
  out.shot2 = await shot('r215_meet_spread.png');

  log('meet', JSON.stringify(out.meet));
  log('away', JSON.stringify(out.away));
  fs.mkdirSync(OUTDIR, { recursive: true });
  fs.writeFileSync(path.join(OUTDIR, 'meet.json'), JSON.stringify(out, null, 1), 'utf8');
  return out;
}
