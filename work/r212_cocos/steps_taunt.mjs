// R212：Cocos 侧「开场叫阵」验收 —— 两段台词、镜头硬切说话方、播完回我方主将、演出期间 tick 冻结。
// 跑法：
//   cd F:\sanguo\game; node web/serve.mjs 5299   （已有就复用）
//   $env:PAGE_URL='http://127.0.0.1:5299/cocos-build/web-mobile/index.html'; $env:MATCH='5299'; $env:PORT='9333'
//   $env:OUTDIR='F:\sanguo\work\r212_cocos'; $env:PROFILE='F:\sanguo\work\.edgeprof_r212'
//   node work\cocos_verify\cdpweb.mjs launch; node work\cocos_verify\cdpweb.mjs run work\r212_cocos\steps_taunt.mjs
import fs from 'node:fs';
import path from 'node:path';

const OUTDIR = process.env.OUTDIR || 'F:\\sanguo\\work\\r212_cocos';

const HELPER = String.raw`
window.__fg = {
  cn: function (c) { return (c && (c.__classname__ || (c.constructor && c.constructor.name))) || '?'; },
  walk: function (root, fn) {
    var st = [root];
    while (st.length) { var n = st.pop(); fn(n); var ch = n.children || []; for (var i = ch.length - 1; i >= 0; i--) st.push(ch[i]); }
  },
  find: function (root, name) {
    var hit = null;
    this.walk(root, function (n) {
      if (hit) return;
      var cs = n._components || n.components || [];
      for (var i = 0; i < cs.length; i++) if (this.cn(cs[i]) === name) hit = cs[i];
    }.bind(this));
    return hit;
  },
  byName: function (root, want) {
    var hit = null;
    this.walk(root, function (n) { if (!hit && n.name === want) hit = n; });
    return hit;
  },
  label: function (n) {
    if (!n) return null;
    var l = n.getComponent && n.getComponent('cc.Label');
    return l ? { text: String(l.string || ''), size: Math.round(Number(l.fontSize) || 0), active: !!n.activeInHierarchy } : null;
  },
  num: function (v) { return (typeof v === 'number' && isFinite(v)) ? Math.round(v * 1000) / 1000 : null; },
};
'ok'
`;

const SNAP = String.raw`
(function () {
  var h = window.__fg;
  var sc = cc.director.getScene();
  if (!sc) return { ok: false, error: 'no-scene' };
  var root = h.find(sc, 'BattleRoot');
  if (!root) return { ok: false, error: 'no-BattleRoot', scene: sc.name };
  var w = root.world;
  if (!w) return { ok: false, error: 'no-world', scene: sc.name };
  var genX = function (side) {
    for (var i = 0; i < w.units.length; i++) { var u = w.units[i]; if (u.isGeneral && u.side === side) return h.num(u.x); }
    return null;
  };
  var seq = root.tauntSeq || null;
  var line = seq && seq[root.tauntI] ? { side: seq[root.tauntI].side, text: String(seq[root.tauntI].text), hold: seq[root.tauntI].holdTicks } : null;
  var banner = h.byName(sc, 'TauntBanner');
  return {
    ok: true, scene: sc.name, frames: cc.director.getTotalFrames(),
    camX: h.num(root.camX), tick: h.num(w.tick), taunting: !!seq,
    line: line, genA: genX('A'), genB: genX('B'),
    bannerActive: !!(banner && banner.activeInHierarchy),
    who: h.label(h.byName(sc, 'TauntWho')),
    text: h.label(h.byName(sc, 'TauntLine')),
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

  // 等引擎起来
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

  await ev(HELPER, 'helper');
  let scene = await ev('(cc.director.getScene() ? cc.director.getScene().name : null)', 'scene');
  log('scene', scene);
  if (scene !== 'Battle') {
    // 带 ?taunt=0 时对比用；默认演叫阵
    await ev("(function () { try { cc.director.loadScene('Battle'); return 'go'; } catch (e) { return 'err:' + e; } })()", 'load');
  }

  // 采样：等到 world 起来，然后每 120ms 记一条，直到叫阵结束 + tick 恢复
  let shotEnemy = false;
  let shotOwn = false;
  let sawTaunt = false;
  for (let i = 0; i < 220; i++) {
    let v = null;
    try { v = await ev(SNAP, 'snap'); } catch (e) { v = { ok: false, error: String(e) }; }
    if (v && v.ok) {
      out.samples.push(v);
      if (v.taunting && !shotEnemy) { shotEnemy = true; await s('Page.bringToFront'); out.shots.enemy = await shot('t01_cocos_taunt_enemy.png'); }
      if (v.taunting) sawTaunt = true;
      if (sawTaunt && !v.taunting && v.tick > 0 && !shotOwn) {
        shotOwn = true;
        await s('Page.bringToFront');
        out.shots.own = await shot('t02_cocos_after_resume.png');
        break;
      }
    }
    await sleep(120);
  }
  const end = out.samples[out.samples.length - 1] || null;
  const tauntSamples = out.samples.filter((x) => x.taunting);
  const lines = [];
  for (const x of tauntSamples) if (x.line && !lines.some((y) => y.side === x.line.side && y.text === x.line.text)) lines.push(x.line);
  out.taunt = {
    seen: tauntSamples.length,
    cams: [...new Set(tauntSamples.map((x) => x.camX))],
    lines,
    ticks: [...new Set(tauntSamples.map((x) => x.tick))],
    bannerActive: tauntSamples.length ? tauntSamples[0].bannerActive : null,
    who: tauntSamples.length ? tauntSamples[0].who : null,
    text: tauntSamples.length ? tauntSamples[0].text : null,
  };
  out.end = end ? { camX: end.camX, tick: end.tick, genA: end.genA, genB: end.genB, bannerActive: end.bannerActive } : null;
  out.frames = await ev('cc.director.getTotalFrames()', 'frames');

  const ok = lines.length >= 2 && lines[0].side === 'B'
    && out.taunt.ticks.every((t) => t === out.taunt.ticks[0])
    && !!out.end && out.end.tick > 0 && out.end.bannerActive === false
    && out.end.genA !== null && Math.abs(out.end.genA - 2 - out.end.camX) < 0.6;
  out.result = ok ? 'OK' : 'CHECK';
  log('taunt', JSON.stringify(out.taunt));
  log('end', JSON.stringify(out.end));

  fs.mkdirSync(OUTDIR, { recursive: true });
  const dump = path.join(OUTDIR, 'taunt_cocos.json');
  fs.writeFileSync(dump, JSON.stringify(out, null, 1), 'utf8');
  log('RESULT', out.result, dump, fs.statSync(dump).size, 'B');
  return out;
}
