// 194 验收（采集端）：把 Cocos 战斗 HUD 主将卡的**实测** Label / 条几何 / 内核数值，
// 以及 SurrenderPanel 的十欄字段 dump 成 JSON 落盘。判定全在 hud_assert.mjs（node 侧），
// 这样「同一份 dump 可以反复重跑断言」，不用每次重连浏览器。
//
//   OUTDIR=F:\sanguo\work\cocos_hud2 node work\cocos_verify\cdpweb.mjs run work\cocos_hud2\steps_hud_dump.mjs
//
// 纪律（project/169 / steps_h3_cmd 的坑）：截屏/采样前必须 Page.bringToFront，并确认
// getTotalFrames() 在涨；后台 rAF 停会让场景数值与 HUD 都不再更新，采到的就是死数据。
import fs from 'node:fs';
import path from 'node:path';

const OUTDIR = process.env.OUTDIR || 'F:\\sanguo\\work\\cocos_hud2';
const DUMP = path.join(OUTDIR, 'hud_dump.json');

// 页面内小工具：按类名找组件 / 遍历节点 / 设计坐标换算（Canvas 世界原点在设计区左下角，y 向上）
export const HELPER = String.raw`
window.__h2 = {
  cn: function (c) { return (c && (c.__classname__ || (c.constructor && c.constructor.name))) || '?'; },
  walk: function (root, fn) {
    var st = [root];
    while (st.length) {
      var n = st.pop(); fn(n);
      var ch = n.children || [];
      for (var i = ch.length - 1; i >= 0; i--) st.push(ch[i]);
    }
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
  hex: function (c) {
    var p = function (v) { var s = Math.max(0, Math.min(255, Math.round(v || 0))).toString(16); return s.length < 2 ? '0' + s : s; };
    return '#' + p(c.r) + p(c.g) + p(c.b) + (c.a >= 255 ? '' : '@' + p(c.a));
  },
  label: function (n) {
    var l = n.getComponent('cc.Label');
    if (!l) return null;
    var wp = n.worldPosition;
    var t = n.getComponent('cc.UITransform');
    return {
      name: n.name,
      text: String(l.string),
      size: l.fontSize,
      lineHeight: l.lineHeight,
      bold: !!l.isBold,
      color: this.hex(l.color || {}),
      dx: Math.round(wp.x * 100) / 100,
      dy: Math.round((1334 - wp.y) * 100) / 100,
      w: t ? Math.round(t.width * 100) / 100 : null,
      h: t ? Math.round(t.height * 100) / 100 : null,
      active: !!n.activeInHierarchy,
    };
  },
  num: function (v) { return (typeof v === 'number' && isFinite(v)) ? v : null; },
  general: function (g) {
    if (!g) return null;
    return {
      name: String(g.name), level: this.num(g.level), alive: !!g.alive,
      hp: this.num(g.hp), maxHp: this.num(g.maxHp),
      mp: this.num(g.mp), mpMax: this.num(g.mpMax),
      tire: this.num(g.tire), morale: this.num(g.morale),
      int: this.num(g.int), str: this.num(g.str),
    };
  },
};
'helper-ok'
`;

// BattleHud 主将卡的实测快照（全在页面里算完再回传）
const HUD_DUMP = String.raw`
(function () {
  var h = window.__h2;
  var sc = cc.director.getScene();
  if (!sc) return { ok: false, error: 'no-scene' };
  var root = h.find(sc, 'BattleRoot');
  if (!root) return { ok: false, error: 'no-BattleRoot', scene: sc.name };
  var hud = root.hud;
  if (!hud) return { ok: false, error: 'root.hud-null', scene: sc.name };
  var node = hud.root;
  // 按节点名递归找（h.find 找的是「组件类名」，节点要用这个）
  var byName = function (want) {
    var hit = null;
    h.walk(node, function (n) { if (!hit && n.name === want) hit = n; });
    return hit;
  };
  var labels = [];
  h.walk(node, function (n) { var r = h.label(n); if (r) labels.push(r); });
  var world = root.world;
  var out = {
    ok: true, scene: sc.name, frames: cc.director.getTotalFrames(),
    hud: {
      nodeName: node.name,
      active: !!node.activeInHierarchy,
      cardBars: (hud.cardBars || []).map(function (b) {
        return { side: b.side, kind: b.kind, color: b.color, rect: { x: b.rect.x, y: b.rect.y, w: b.rect.w, h: b.rect.h } };
      }),
      actionBar: hud.cardActionBar
        ? { x: hud.cardActionBar.x, y: hud.cardActionBar.y, w: hud.cardActionBar.w, h: hud.cardActionBar.h }
        : null,
      // 头像真肖像（R207）：脸在 0 号子节点、压在金框下面，所以这里报「尺寸 + 有没有 frame」，
      // 断言端再核对「框 86×108 → cover 后 90×108」这条 web 同口径的几何。
      face: (function () {
        var f = byName('HudFace');
        if (!f) return null;
        // 注意：组件要用字符串名取（cc.UITransform 在构建产物里可能是 undefined）
        var t = f.getComponent('cc.UITransform');
        var sp = f.getComponent('cc.Sprite');
        var wp = f.worldPosition;
        var r2 = function (v) { return typeof v === 'number' ? Math.round(v * 100) / 100 : null; };
        return {
          parentName: f.parent ? f.parent.name : '',
          index: f.parent && f.parent.children ? Array.prototype.indexOf.call(f.parent.children, f) : null,
          active: !!f.activeInHierarchy,
          w: t ? r2(t.width) : null,
          h: t ? r2(t.height) : null,
          dx: r2(wp.x),
          dy: r2(1334 - wp.y),
          hasFrame: !!(sp && sp.spriteFrame),
          frameName: sp && sp.spriteFrame ? String(sp.spriteFrame.name || '') : '',
        };
      })(),
      badge: (function () {
        var plate = byName('PortraitBadge');
        var lv = byName('PortraitBadgeLv');
        return { plateActive: plate ? !!plate.activeInHierarchy : null, lvActive: lv ? !!lv.activeInHierarchy : null };
      })(),
      labels: labels,
    },
  };
  if (world && world.sides) {
    out.world = {
      tick: h.num(world.tick),
      a: { aliveCount: h.num(world.sides.A.aliveCount), start: h.num(world.sides.A.start), morale: h.num(world.sides.A.morale), general: h.general(world.sides.A.general) },
      b: { aliveCount: h.num(world.sides.B.aliveCount), start: h.num(world.sides.B.start), morale: h.num(world.sides.B.morale), general: h.general(world.sides.B.general) },
    };
  }
  return out;
})()
`;

// 招降面板：用一份**假 state** 打开（真 state 要真存档 + GameData，跑不进战斗页）。
// 卡面字段只读 `SurrenderCard`（core/roster.ts:353-375）里真有的东西：str/int/loyal；
// 等級·士氣·疲勞·武器·物品·勝場數·敗場數 在 Cocos 拿不到 → 必须画灰色「—」，不编数。
export const PANEL_OPEN = String.raw`
(function () {
  var h = window.__h2;
  var sc = cc.director.getScene();
  var K = null;
  var tried = [];
  var names = ['SurrenderPanel', 'cc.SurrenderPanel'];
  for (var i = 0; i < names.length; i++) {
    tried.push(names[i]);
    try { var c = cc.js.getClassByName(names[i]); if (c) { K = c; break; } } catch (e) { tried.push('throw:' + e); }
  }
  if (!K) return { ok: false, error: 'no-class', tried: tried };
  var host = sc.getChildByName('Canvas') || sc;
  var existed = host.getChildByName('SurrenderPanel');
  var node = existed || new cc.Node('SurrenderPanel');
  if (!node.parent) { node.layer = cc.Layers.Enum.UI_2D; node.parent = host; }
  var panel = node.getComponent(K) || node.addComponent(K);
  var cards = [
    { name: '夏侯淵', str: 91, int: 78, loyal: 44, constancy: 6, isKing: false, from: 'captured', predicted: true, chance: 1, tier: 'must', tierText: '可 降', recruitable: true, reason: '節操 6 · 必定歸降' },
    { name: '張郃', str: 88, int: 76, loyal: 61, constancy: 4, isKing: false, from: 'captured', predicted: false, chance: 0.5, tier: 'roll', tierText: '需 再 戰', recruitable: true, reason: '成功率 50%' },
    { name: '高覽', str: 80, int: 62, loyal: 12, constancy: 2, isKing: false, from: 'executed', predicted: false, chance: 0, tier: 'refuse', tierText: '拒 降', recruitable: false, reason: '節操 2 · 寧死不降' },
    { name: '袁紹', str: 61, int: 70, loyal: 100, constancy: 9, isKing: true, from: 'king', predicted: false, chance: 0, tier: 'refuse', tierText: '君 主', recruitable: false, reason: '君主 · 只能放走' }
  ];
  var state = { ctx: { save: {}, data: {}, home: '鄴', atCity: [], mine: [], king: '曹操' }, cards: cards, picks: {}, done: false };
  try {
    panel.build();
    panel.open(state);
  } catch (e) {
    return { ok: false, error: 'build/open threw: ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : String(e)) };
  }
  var labels = [];
  h.walk(node, function (n) { var r = h.label(n); if (r) labels.push(r); });
  var dbg = null;
  try { dbg = panel.debug(); } catch (e) { dbg = { error: String(e) }; }
  return {
    ok: true, exists: !!existed, classNames: tried,
    debug: dbg,
    hits: (panel.hitList || []).map(function (x) { return { label: x.label, rect: x.rect }; }),
    labels: labels,
  };
})()
`;

export default async function steps({ s, evaluate, sleep, log }) {
  const ev = async (expr, tag) => {
    const v = await evaluate(expr);
    if (v && v.__throw) throw new Error((tag || 'eval') + ' threw: ' + v.__throw);
    return v;
  };
  const out = {};

  // ---- 0a) 等引擎起来（刚 launch 的新浏览器 profile 首帧要几秒到十几秒）----
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
  if (!ready || ready.__throw) throw new Error('引擎没起来（40s 内 cc.director.getScene() 一直为空）：' + JSON.stringify(ready));
  await s('Page.bringToFront');
  await s('Emulation.setFocusEmulationEnabled', { enabled: true });
  await sleep(500);

  // ---- 0b) 前台 + 帧数在涨（否则后头全是死数据）----
  const f0 = await ev('cc.director.getTotalFrames()', 'frames0');
  await sleep(1200);
  const f1 = await ev('cc.director.getTotalFrames()', 'frames1');
  out.front = { f0, f1, rising: f1 > f0 + 3 };
  if (!out.front.rising) throw new Error('rAF 停了：frames ' + f0 + ' → ' + f1 + '（先 Page.bringToFront）');

  // ---- 1) 采集 helper，进战斗 ----
  const helper = await ev(HELPER, 'helper');
  out.helper = helper;
  const sceneNow = await ev('(cc.director.getScene() ? cc.director.getScene().name : null)', 'scene');
  out.sceneBefore = sceneNow;
  if (sceneNow !== 'Battle') {
    await ev("(function () { try { cc.director.loadScene('Battle'); return 'go'; } catch (e) { return 'err:' + e; } })()", 'load');
  }
  // 等 BattleRoot（最多 ~15s）
  let found = null;
  for (let i = 0; i < 30; i++) {
    await sleep(500);
    found = await ev("(function () { var sc = cc.director.getScene(); if (!sc) return null; var r = window.__h2.find(sc, 'BattleRoot'); return r ? { scene: sc.name, hud: !!r.hud, world: !!r.world } : null; })()", 'probe');
    if (found && found.world && found.hud) break;
  }
  out.afterLoad = found;
  if (!found || !found.world) throw new Error('进不了战斗：BattleRoot/world 没起来');

  // ---- 2) 让兵走开几秒，条/数字都不再是初值 ----
  await sleep(4000);
  await s('Page.bringToFront');
  const f2 = await ev('cc.director.getTotalFrames()', 'frames2');
  out.framesAfterWait = f2;

  // ---- 3) 采集 HUD 卡 ----
  out.hud = await ev(HUD_DUMP, 'hud');
  if (!out.hud || !out.hud.ok) throw new Error('HUD dump failed: ' + JSON.stringify(out.hud));
  log('HUD labels', out.hud.hud.labels.length, 'bars', JSON.stringify(out.hud.hud.cardBars.map((b) => b.side + '/' + b.kind)));

  // ---- 4) 采集招降面板（打开 → dump → 关掉，别挡住后续截图）----
  out.panel = await ev(PANEL_OPEN, 'panel');
  if (out.panel && out.panel.ok) {
    log('panel fields', JSON.stringify(out.panel.debug && out.panel.debug.fields));
    const closed = await ev("(function () { var sc = cc.director.getScene(); var n = (sc.getChildByName('Canvas') || sc).getChildByName('SurrenderPanel'); if (n) n.active = false; return n ? 'hid' : 'gone'; })()", 'panel-close');
    out.panelClosed = closed;
  } else {
    log('panel dump failed', JSON.stringify(out.panel));
  }

  out.dump = DUMP;
  fs.mkdirSync(OUTDIR, { recursive: true });
  fs.writeFileSync(DUMP, JSON.stringify(out, null, 1), 'utf8');
  log('dump →', DUMP, fs.statSync(DUMP).size, 'B');
  return {
    ok: true,
    dump: DUMP,
    scene: out.hud.scene,
    frames: [f0, f1, f2],
    hudLabels: out.hud.hud.labels.length,
    cardBars: out.hud.hud.cardBars,
    actionBar: out.hud.hud.actionBar,
    panelOk: !!(out.panel && out.panel.ok),
    panelFields: out.panel && out.panel.debug ? out.panel.debug.fields : null,
  };
}
