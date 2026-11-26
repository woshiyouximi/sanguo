// R215：全图战场视觉验收 —— 整幅 71×14、武将头像双环、小兵小点、无动作帧。
// 跑法：
//   $env:PAGE_URL='http://127.0.0.1:5299/cocos-build/web-mobile/index.html'; $env:PORT='9345'
//   $env:OUTDIR='F:\sanguo\work\r215_cocos'; $env:PROFILE='F:\sanguo\work\.edgeprof_r215'
//   node work\cocos_verify\cdpweb.mjs launch
//   node work\cocos_verify\cdpweb.mjs run work\r215_cocos\steps_map.mjs
import fs from 'node:fs';
import path from 'node:path';

const OUTDIR = process.env.OUTDIR || 'F:\\sanguo\\work\\r215_cocos';

const SNAP = String.raw`
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
  if (!root) return { ok: false, error: 'no-BattleRoot', scene: sc.name };
  var w = root.world;
  if (!w) return { ok: false, error: 'no-world', scene: sc.name };
  var byName = function (want) {
    var s2 = [sc], hit = null;
    while (s2.length) { var n2 = s2.pop(); if (!hit && n2.name === want) hit = n2; var c2 = n2.children || []; for (var k = 0; k < c2.length; k++) s2.push(c2[k]); }
    return hit;
  };
  var readLabel = function (name) {
    var n = byName(name); if (!n) return null;
    var l = n.getComponent && n.getComponent('cc.Label');
    var p = n.position || { x: 0, y: 0 };
    return l ? { text: String(l.string || ''), x: Math.round(p.x), y: Math.round(p.y), active: !!n.activeInHierarchy } : null;
  };
  var readFace = function (side) {
    var n = byName('GeneralFace' + side); if (!n) return null;
    var inner = n.children && n.children[0]; if (!inner) return null;
    var sp = inner.getComponent && inner.getComponent('cc.Sprite');
    var p = n.position || { x: 0, y: 0 };
    return { x: Math.round(p.x), y: Math.round(p.y), active: !!n.activeInHierarchy, hasFrame: !!(sp && sp.spriteFrame) };
  };
  var gens = {};
  var live = 0, dotsA = 0, dotsB = 0;
  for (var u = 0; u < w.units.length; u++) {
    var un = w.units[u];
    if (!un.alive) continue;
    if (un.isGeneral) { var gs = w.sides[un.side] && w.sides[un.side].general; gens[un.side] = { name: gs ? gs.name : '', x: Math.round(un.x * 100) / 100, y: Math.round(un.y * 100) / 100, hp: un.hp, maxHp: un.maxHp, mp: un.mp }; }
    else if (un.side === 'A') dotsA++; else dotsB++;
  }
  var gm = byName('GeneralMarkers');
  return {
    ok: true, scene: sc.name, tick: Math.round(w.tick), camX: Math.round(root.camX * 100) / 100,
    generals: gens, dotsA: dotsA, dotsB: dotsB,
    nameA: readLabel('GeneralNameA'), nameB: readLabel('GeneralNameB'),
    faceA: readFace('A'), faceB: readFace('B'),
    zoneEnemy: readLabel('Label_敵 陣'), zoneOurs: readLabel('Label_我 陣'),
    frontLine: readLabel('Label_前 線'),
    markersNode: !!gm,
    bgNode: !!byName('BattleBg'), generalArtNode: !!byName('GeneralArt'), unitSprites: !!byName('UnitSprites'),
    mapNode: !!byName('BattleMap'),
    paused: !!cc.director.isPaused(),
  };
})()
`;

export default async function steps({ s, evaluate, shot, sleep, log }) {
  const ev = async (expr, tag) => {
    const v = await evaluate(expr);
    if (v && v.__throw) throw new Error((tag || 'eval') + ' threw: ' + v.__throw);
    return v;
  };
  const out = { samples: [], shots: {} };
  await s('Page.bringToFront');
  await s('Emulation.setFocusEmulationEnabled', { enabled: true });

  const poll = "(function () { try { if (typeof cc !== 'object' || !cc.director) return null; var sc = cc.director.getScene(); return sc ? { scene: sc.name, frames: cc.director.getTotalFrames() } : null; } catch (e) { return null; } })()";
  let ready = null;
  for (let i = 0; i < 40; i++) {
    ready = await evaluate(poll);
    if (ready && !ready.__throw && ready.frames > 3) break;
    await sleep(1000);
  }
  out.waitCc = ready;
  log('waitCc', JSON.stringify(ready));
  if (!ready || ready.__throw) throw new Error('引擎没起来');

  let scene = await ev('(cc.director.getScene() ? cc.director.getScene().name : null)', 'scene');
  log('scene', scene);
  if (scene !== 'Battle') {
    await ev("(function () { try { cc.director.loadScene('Battle'); return 'go'; } catch (e) { return 'err:' + e; } })()", 'load');
    await sleep(1500);
  }

  // 等 world 起来
  let first = null;
  for (let i = 0; i < 40; i++) {
    first = await ev(SNAP, 'snap');
    if (first && first.ok) break;
    await sleep(500);
  }
  log('first', JSON.stringify(first));
  if (!first || !first.ok) throw new Error('world 没起来');
  out.first = first;

  await s('Page.bringToFront');
  out.shots.map = await shot('r215_fullmap_00.png');
  await sleep(2500);
  out.shots.mid = await shot('r215_fullmap_01.png');
  await sleep(5000);
  out.shots.late = await shot('r215_fullmap_02.png');
  out.late = await ev(SNAP, 'snap');

  // 可选：多等一会儿看接战后的真实状态（红环掉血、小兵点变少、没有动作帧）
  const fightWait = Number(process.env.FIGHT_WAIT || 0);
  if (fightWait > 0) {
    await sleep(fightWait);
    out.shots.fight = await shot('r215_fight.png');
    out.fight = await ev(SNAP, 'snap');
    log('fight', JSON.stringify(out.fight));
  }

  const named = (v) => !!(v && v.active && v.text);
  const ok = out.first.dotsA > 50 && out.first.dotsB > 50
    && out.first.faceA && out.first.faceA.hasFrame && out.first.faceB && out.first.faceB.hasFrame
    && !out.first.bgNode && !out.first.generalArtNode && !out.first.unitSprites
    && out.first.mapNode && out.first.markersNode
    && named(out.first.nameA) && named(out.first.nameB)
    && out.first.nameA.text === out.first.generals.A.name && out.first.nameB.text === out.first.generals.B.name
    && named(out.first.zoneEnemy) && named(out.first.zoneOurs);
  out.result = ok ? 'OK' : 'CHECK';
  log('result', JSON.stringify({ ok, first: out.first, late: out.late }));

  fs.mkdirSync(OUTDIR, { recursive: true });
  const dump = path.join(OUTDIR, 'map_cocos.json');
  fs.writeFileSync(dump, JSON.stringify(out, null, 1), 'utf8');
  log('RESULT', out.result, dump, fs.statSync(dump).size, 'B');
  return out;
}
