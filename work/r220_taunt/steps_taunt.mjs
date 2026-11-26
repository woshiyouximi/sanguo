// R220：开场叫阵框位置验收 —— 敌将喊话时框应出现在战场上半（敌方一侧）。
import fs from 'node:fs';
import path from 'node:path';

const OUTDIR = process.env.OUTDIR || 'F:\\sanguo\\work\\r220_taunt';

const READ = String.raw`
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
  if (!root || !root.world) return null;
  var byName = function (want) {
    var s2 = [sc], hit = null;
    while (s2.length) { var n2 = s2.pop(); if (!hit && n2.name === want) hit = n2; var c2 = n2.children || []; for (var k = 0; k < c2.length; k++) s2.push(c2[k]); }
    return hit;
  };
  var read = function (name) {
    var n = byName(name); if (!n) return null;
    var l = n.getComponent && n.getComponent('cc.Label');
    return { text: l ? String(l.string || '') : '', y: Math.round(n.position.y), active: !!n.activeInHierarchy };
  };
  return {
    scene: sc.name, tick: Math.round(root.world.tick),
    who: read('TauntWho'), line: read('TauntLine'),
    seq: (root.tauntSeq || []).map(function (x) { return x.side; }),
    i: root.tauntI,
  };
})()
`;

export default async function steps({ s, evaluate, shot, sleep, log }) {
  await s('Page.bringToFront');
  const out = { shots: {}, samples: [] };
  for (let i = 0; i < 30; i++) {
    const v = await evaluate(READ);
    if (v) break;
    await sleep(400);
  }
  let scene = await evaluate('(cc.director.getScene() ? cc.director.getScene().name : null)');
  if (scene !== 'Battle') {
    await evaluate("(function(){try{cc.director.loadScene('Battle');return 'go';}catch(e){return 'err:'+e;}})()");
    await sleep(400);
  }
  // 叫阵头 1.5 秒：每 150ms 抓一次 TauntWho 位置，并在第一次 active 时截图
  let shotDone = false;
  for (let i = 0; i < 24; i++) {
    await sleep(150);
    const v = await evaluate(READ);
    if (!v) continue;
    out.samples.push({ i: v.i, tick: v.tick, who: v.who, line: v.line, seq: v.seq });
    if (!shotDone && v.who && v.who.active) {
      out.shots.start = await shot('r220_taunt_start.png');
      shotDone = true;
    }
    if (v.who && v.who.text && v.who.text !== '張角') break;
  }
  log('samples', JSON.stringify(out.samples.slice(0, 6)));
  out.result = shotDone ? 'OK' : 'CHECK';
  fs.mkdirSync(OUTDIR, { recursive: true });
  fs.writeFileSync(path.join(OUTDIR, 'taunt.json'), JSON.stringify(out, null, 1), 'utf8');
  return out;
}
