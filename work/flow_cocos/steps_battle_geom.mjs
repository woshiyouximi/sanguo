// 采集 Cocos 战斗开局几何：camX / tick / 双方主将与全单位 x 范围 / 屏幕投影 / 3 张截图。
//   OUTDIR=F:\sanguo\work\flow_cocos node work\cocos_verify\cdpweb.mjs run work\flow_cocos\steps_battle_geom.mjs
// 纪律：截屏前 Page.bringToFront，并确认 getTotalFrames() 在涨（后台 rAF 停 = 死数据）。
import fs from 'node:fs';
import path from 'node:path';

const OUTDIR = process.env.OUTDIR || 'F:\\sanguo\\work\\flow_cocos';

// 页面内小工具（按类名找组件；节点名自己 walk 比）
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
  num: function (v) { return (typeof v === 'number' && isFinite(v)) ? Math.round(v * 1000) / 1000 : null; },
};
'ok'
`;

// 常量（core/field.ts + view/layout.ts；构建产物里不在全局，照源码抄，报告里注明来源）
const CONST = String.raw`
window.__F = {
  GRID_W: 71, GRID_H: 14,
  ROW_PX: 96 * 750 / 1008,      // 71.42857
  LANE_PX: 750 / 14,            // 53.57143
  FIELD_TOP: 100, FIELD_H: 900, FIELD_BOTTOM: 1000, FIELD_CENTER_Y: 550,
  DESIGN_W: 750, DESIGN_H: 1334,
};
'ok'
`;

// 采集：一次性把当前帧的几何全算完
const SNAP = String.raw`
(function () {
  var h = window.__fg, F = window.__F;
  var sc = cc.director.getScene();
  if (!sc) return { ok: false, error: 'no-scene' };
  var root = h.find(sc, 'BattleRoot');
  if (!root) return { ok: false, error: 'no-BattleRoot', scene: sc.name };
  var w = root.world;
  if (!w) return { ok: false, error: 'no-world', scene: sc.name, frames: cc.director.getTotalFrames() };
  var r3 = function (v) { return Math.round(v * 1000) / 1000; };
  var proj = function (camX, x, y) {
    return { sx: r3(y * F.LANE_PX + F.LANE_PX / 2), sy: r3(550 + (x - camX) * F.ROW_PX) };
  };
  var camX = root.camX;
  var out = {
    ok: true, scene: sc.name, frames: cc.director.getTotalFrames(),
    camX: h.num(camX), ticks: h.num(w.tick), over: !!w.over,
    autoStart: !!root.autoStart,
    launch: root.launch ? JSON.parse(JSON.stringify(root.launch)) : null,
    sides: {}, units: [], generals: {},
  };
  var agg = { A: { n: 0, minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity },
              B: { n: 0, minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity } };
  for (var i = 0; i < w.units.length; i++) {
    var u = w.units[i];
    var p = proj(camX, u.x, u.y);
    var onScreen = (p.sy >= F.FIELD_TOP && p.sy <= F.FIELD_BOTTOM && p.sx >= 0 && p.sx <= F.DESIGN_W);
    out.units.push({
      side: u.side, x: h.num(u.x), y: h.num(u.y), prevX: h.num(u.prevX), prevY: h.num(u.prevY),
      cd: h.num(u.cd), kind: String(u.kind), alive: !!u.alive, isGeneral: !!u.isGeneral,
      sx: p.sx, sy: p.sy, onScreen: onScreen,
    });
    if (u.alive && (u.side === 'A' || u.side === 'B')) {
      var a = agg[u.side];
      a.n++;
      if (u.x < a.minX) a.minX = u.x;
      if (u.x > a.maxX) a.maxX = u.x;
      if (u.y < a.minY) a.minY = u.y;
      if (u.y > a.maxY) a.maxY = u.y;
    }
    if (u.isGeneral) {
      out.generals[u.side] = {
        x: h.num(u.x), y: h.num(u.y), prevX: h.num(u.prevX), prevY: h.num(u.prevY),
        cd: h.num(u.cd), alive: !!u.alive, kind: String(u.kind),
        sx: p.sx, sy: p.sy, onScreen: onScreen,
      };
    }
  }
  ['A', 'B'].forEach(function (s) {
    var a = agg[s];
    out.sides[s] = { aliveN: a.n, minX: h.num(a.minX), maxX: h.num(a.maxX), minY: h.num(a.minY), maxY: h.num(a.maxY) };
  });
  // 一屏可见纵深（常数投影，core/battle.ts:3107 与 view/layout.ts:134 同源）
  var half = F.FIELD_H / 2 / F.ROW_PX;
  out.visible = {
    halfRows: r3(half), rowsTotal: r3(half * 2),
    xMin: r3(camX - half), xMax: r3(camX + half),
    syOf(x) { return r3(550 + (x - camX) * F.ROW_PX); },
  };
  out.visible.xMin = r3(camX - half);
  out.visible.xMax = r3(camX + half);
  var ga = out.generals.A, gb = out.generals.B;
  if (ga) out.generals.A.gapRowsFromCam = r3(ga.x - camX);
  if (gb) out.generals.B.gapRowsFromCam = r3(gb.x - camX);
  if (ga && gb) {
    out.generalGap = r3(Math.abs(ga.x - gb.x));
    out.generalSameLane = ga.y === gb.y;
    out.generalBothOnScreen = !!(ga.onScreen && gb.onScreen);
  }
  out.hudLabels = [];
  h.walk(sc, function (n) {
    var l = n.getComponent && n.getComponent('cc.Label');
    if (l && n.activeInHierarchy && String(l.string || '').length) {
      out.hudLabels.push({ name: n.name, text: String(l.string).slice(0, 60) });
    }
  });
  out.hudLabels = out.hudLabels.slice(0, 40);
  return out;
})()
`;

export default async function steps({ s, evaluate, shot, sleep, log }) {
  const ev = async (expr, tag) => {
    const v = await evaluate(expr);
    if (v && v.__throw) throw new Error((tag || 'eval') + ' threw: ' + v.__throw);
    return v;
  };
  const out = {};

  await s('Page.bringToFront');
  await s('Emulation.setFocusEmulationEnabled', { enabled: true });

  const pollScene = "(function () { try { if (typeof cc !== 'object' || !cc.director) return null; var sc = cc.director.getScene(); return sc ? { scene: sc.name, frames: cc.director.getTotalFrames() } : null; } catch (e) { return null; } })()";
  let ready = null;
  for (let i = 0; i < 40; i++) {
    ready = await evaluate(pollScene);
    if (ready && !ready.__throw && ready.frames > 3) break;
    await sleep(1000);
  }
  out.waitCc = ready;
  log('waitCc', JSON.stringify(ready));
  if (!ready || ready.__throw) throw new Error('引擎没起来：' + JSON.stringify(ready));

  await ev(HELPER, 'helper');
  await ev(CONST, 'const');
  out.sceneBefore = await ev('(cc.director.getScene() ? cc.director.getScene().name : null)', 'scene');

  // 进战斗（已经从大地图进来就复用）
  if (out.sceneBefore !== 'Battle') {
    await ev("(function () { try { cc.director.loadScene('Battle'); return 'go'; } catch (e) { return 'err:' + e; } })()", 'load');
  }
  // 等 world 出现 → 再等 ~250ms 让首帧画出来 → 冻结（director.pause），拍"开局暂停态"
  let worldAt = null;
  for (let i = 0; i < 200; i++) {
    await sleep(100);
    worldAt = await ev("(function () { var sc = cc.director.getScene(); if (!sc) return null; var r = window.__fg.find(sc, 'BattleRoot'); return r && r.world ? { tick: r.world.tick, frames: cc.director.getTotalFrames(), camX: r.camX } : null; })()", 'probe');
    if (worldAt) break;
  }
  out.worldAt = worldAt;
  if (!worldAt) throw new Error('进不了战斗：BattleRoot/world 没起来');
  await sleep(250);
  await s('Page.bringToFront');
  const paused = await ev("(function () { cc.director.pause(); return { paused: !!cc.director.isPaused(), frames: cc.director.getTotalFrames() }; })()", 'pause');
  out.paused = paused;
  await sleep(200);
  out.shotPaused = await shot('battle_0_paused.png');
  out.snapPaused = await ev(SNAP, 'snap-paused');

  // 恢复 → 1s 快照
  await ev("(function () { cc.director.resume(); return !!cc.director.isPaused(); })()", 'resume');
  await sleep(1000);
  await s('Page.bringToFront');
  out.shot1s = await shot('battle_1s.png');
  out.snap1s = await ev(SNAP, 'snap-1s');

  // 再跑 2s → 3s 快照
  await sleep(2000);
  await s('Page.bringToFront');
  out.shot3s = await shot('battle_3s.png');
  out.snap3s = await ev(SNAP, 'snap-3s');

  const f = await ev('cc.director.getTotalFrames()', 'frames-end');
  out.framesEnd = f;

  fs.mkdirSync(OUTDIR, { recursive: true });
  const dump = path.join(OUTDIR, 'battle_geom.json');
  fs.writeFileSync(dump, JSON.stringify(out, null, 1), 'utf8');
  log('dump →', dump, fs.statSync(dump).size, 'B');

  return {
    ok: true,
    dump,
    shots: [out.shotPaused && out.shotPaused.path, out.shot1s && out.shot1s.path, out.shot3s && out.shot3s.path],
    paused: { camX: out.snapPaused && out.snapPaused.camX, tick: out.snapPaused && out.snapPaused.ticks },
    generals: {
      paused: out.snapPaused && out.snapPaused.generals,
      at1s: out.snap1s && out.snap1s.generals,
      at3s: out.snap3s && out.snap3s.generals,
    },
    camX: { paused: out.snapPaused && out.snapPaused.camX, at1s: out.snap1s && out.snap1s.camX, at3s: out.snap3s && out.snap3s.camX },
    sidesPaused: out.snapPaused && out.snapPaused.sides,
    visible: out.snapPaused && out.snapPaused.visible,
    generalGap: out.snapPaused && out.snapPaused.generalGap,
    bothOnScreen: out.snapPaused && out.snapPaused.generalBothOnScreen,
    frames: [worldAt.frames, f],
  };
}
