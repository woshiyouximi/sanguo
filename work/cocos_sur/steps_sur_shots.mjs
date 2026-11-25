// R197 截图端：两张 876×1368 的招降面板图
//   surrender_fields.png  有记录：十欄全是真值（等級 12 / 士氣 88 / 疲勞 41 / 武器 古錠刀 / 物品 孫子兵法 / 勝場 7 / 敗場 4）
//   surrender_grey.png    无记录：七欄画灰「—」（等級/士氣/疲勞/武器/物品/勝場/敗場）
//
//   OUTDIR=F:\sanguo\work\cocos_sur PAGE_URL=http://127.0.0.1:5271/cocos-build/web-mobile/index.html \
//     node work\cocos_verify\cdpweb.mjs run work\cocos_sur\steps_sur_shots.mjs
//
// 纪律（project/194 踩过的坑，别删）：
//   1) 截图前必须 Page.bringToFront + 确认 cc.director.getTotalFrames() 在涨；
//      后台窗口 rAF 会停，截出来是死的/白的。
//   2) 876×1368 由 Emulation.setDeviceMetricsOverride 钉死，shot() 是全页截图，正好这个尺寸。
//   3) 面板用**假 state** 打开（真 state 要真存档 + GameData，跑不进战斗页）：
//      卡片上的 level/morale/tire/wins/losses/weapon/item 就是 `SurrenderCard` 的可选字段，
//      `SurrenderPanel` 只读 view —— 所以这两张图量的正是面板取值链路。
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.env.OUTDIR || 'F:\\sanguo\\work\\cocos_sur';
const W = 876;
const H = 1368;

// 页面内小工具：按类名找组件、遍历节点、取 Label（和 steps_hud_dump 的 __h2 同款，但自带一份，不跨目录 import）
const HELPER = String.raw`
window.__s197 = {
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
    var p = function (v) { var s = Math.max(0, Math.min(255, Math.round(v || 0))).toString(16).toUpperCase(); return s.length < 2 ? '0' + s : s; };
    return '#' + p(c.r) + p(c.g) + p(c.b) + (c.a >= 255 ? '' : '@' + p(c.a));
  },
  label: function (n) {
    var l = n.getComponent('cc.Label');
    if (!l) return null;
    return { name: n.name, text: String(l.string), color: this.hex(l.color || {}), active: !!n.activeInHierarchy };
  },
  fields: function (node) {
    /* 十欄：SurFieldV{i}_{k} + SurFieldK{i}_{k}，i = 卡序（0..4） */
    var out = [];
    for (var i = 0; i < 5; i++) {
      var row = [];
      for (var k = 0; k < 10; k++) {
        var vn = node.getChildByName('SurFieldV' + i + '_' + k);
        var kn = node.getChildByName('SurFieldK' + i + '_' + k);
        if (!vn || !kn) { row.push(null); continue; }
        var vl = vn.getComponent('cc.Label');
        var kl = kn.getComponent('cc.Label');
        row.push({ key: kl ? String(kl.string) : null, text: vl ? String(vl.string) : null, color: vl ? this.hex(vl.color || {}) : null });
      }
      out.push(row);
    }
    return out;
  },
};
'helper-ok'
`;

/* 四张卡的数据（有记录版）：数值故意都不同，方便在图上看出「每个欄位各有其值」。 */
const FULL_CARDS = `
  var cards = [
    { name: '夏侯淵', str: 91, int: 78, loyal: 44, constancy: 6, isKing: false, from: 'captured',
      predicted: true, chance: 1, tier: 'must', tierText: '可 降', recruitable: true, reason: '節操 6 · 必定歸降',
      level: 12, morale: 88, tire: 41, wins: 7, losses: 3, weapon: '古錠刀', item: '孫子兵法' },
    { name: '張郃', str: 88, int: 76, loyal: 61, constancy: 4, isKing: false, from: 'captured',
      predicted: false, chance: 0.5, tier: 'roll', tierText: '需 再 戰', recruitable: true, reason: '成功率 50%',
      weapon: '短弓' },
    { name: '高覽', str: 80, int: 62, loyal: 12, constancy: 2, isKing: false, from: 'executed',
      predicted: false, chance: 0, tier: 'refuse', tierText: '拒 降', recruitable: false, reason: '節操 2 · 寧死不降' },
    { name: '袁紹', str: 61, int: 70, loyal: 100, constancy: 9, isKing: true, from: 'king',
      predicted: false, chance: 0, tier: 'refuse', tierText: '君 主', recruitable: false, reason: '君主 · 只能放走' }
  ];
`;

/* 同一批卡、但没有任何记录（灰「—」版）。ctx.battle=false = 非真实战后（web surBattleReal=false），
   所以連「敗場 +1」都不该出现。 */
const BARE_CARDS = `
  var cards = [
    { name: '夏侯淵', str: 91, int: 78, loyal: 44, constancy: 6, isKing: false, from: 'captured',
      predicted: true, chance: 1, tier: 'must', tierText: '可 降', recruitable: true, reason: '節操 6 · 必定歸降' },
    { name: '張郃', str: 88, int: 76, loyal: 61, constancy: 4, isKing: false, from: 'captured',
      predicted: false, chance: 0.5, tier: 'roll', tierText: '需 再 戰', recruitable: true, reason: '成功率 50%' },
    { name: '高覽', str: 80, int: 62, loyal: 12, constancy: 2, isKing: false, from: 'executed',
      predicted: false, chance: 0, tier: 'refuse', tierText: '拒 降', recruitable: false, reason: '節操 2 · 寧死不降' },
    { name: '袁紹', str: 61, int: 70, loyal: 100, constancy: 9, isKing: true, from: 'king',
      predicted: false, chance: 0, tier: 'refuse', tierText: '君 主', recruitable: false, reason: '君主 · 只能放走' }
  ];
`;

/** 在页面里开/重开面板：state 由上面的 cards + battle 旗标拼出来。 */
const panelExpr = (cardsJs, battle) => String.raw`
(function () {
  var h = window.__s197;
  var sc = cc.director.getScene();
  var K = null;
  try { K = cc.js.getClassByName('SurrenderPanel'); } catch (e) { K = null; }
  if (!K) return { ok: false, error: 'no-class' };
  var host = sc.getChildByName('Canvas') || sc;
  var node = host.getChildByName('SurrenderPanel') || new cc.Node('SurrenderPanel');
  if (!node.parent) { node.layer = cc.Layers.Enum.UI_2D; node.parent = host; }
  var panel = node.getComponent(K) || node.addComponent(K);
  ${cardsJs}
  var state = {
    ctx: { save: {}, data: {}, home: '鄴', atCity: [], mine: [], king: '曹操', battle: ${battle ? 'true' : 'false'} },
    cards: cards,
    picks: {},
    done: false,
  };
  try {
    panel.build();
    panel.open(state);
  } catch (e) {
    return { ok: false, error: 'build/open threw: ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : String(e)) };
  }
  return { ok: true, fields: h.fields(node), debug: panel.debug() };
})()
`;

export default async function steps({ s, evaluate, sleep, log, shot }) {
  const ev = async (expr, tag) => {
    const v = await evaluate(expr);
    if (v && v.__throw) throw new Error((tag || 'eval') + ' threw: ' + v.__throw);
    return v;
  };
  const frames = () => ev('cc.director.getTotalFrames()', 'frames');
  const front = async (tag) => {
    await s('Page.bringToFront');
    await s('Emulation.setFocusEmulationEnabled', { enabled: true });
    await sleep(400);
    const f0 = await frames();
    await sleep(1000);
    const f1 = await frames();
    const rising = typeof f0 === 'number' && typeof f1 === 'number' && f1 > f0 + 3;
    log('frames@' + tag, f0, '→', f1, rising ? 'OK（在涨）' : 'STOPPED');
    if (!rising) throw new Error('rAF 停了（' + tag + '）：' + f0 + ' → ' + f1 + '，截图会是死的（先 Page.bringToFront）');
    return { f0, f1 };
  };
  const pngSize = (file) => {
    const b = fs.readFileSync(file);
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  };
  const out = {};

  /* ---------- 0) 876×1368 视口（不 reload：Page.reload 会把 Runtime 上下文打断，attach 后拿不到 cc） ---------- */
  await s('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await sleep(800);

  /* ---------- 1) 等引擎起来 + 进战斗场景（有 Canvas，面板挂得上） ---------- */
  const probe = "(function () { try { if (typeof cc !== 'object' || !cc.director) return null; var sc = cc.director.getScene(); return sc ? { scene: sc.name, frames: cc.director.getTotalFrames() } : null; } catch (e) { return null; } })()";
  let up = null;
  for (let i = 0; i < 30; i += 1) {
    up = await evaluate(probe);
    if (up && up.frames > 3) break;
    await sleep(500);
  }
  if (!up) {
    // 还没起来就重新导航一次（等同首次打开），再等 60s
    await s('Page.navigate', { url: process.env.PAGE_URL || 'http://127.0.0.1:5271/cocos-build/web-mobile/index.html' });
    for (let i = 0; i < 60; i += 1) {
      await sleep(1000);
      up = await evaluate(probe);
      if (up && up.frames > 3) break;
    }
  }
  out.ccUp = up;
  log('cc up', JSON.stringify(up));
  if (!up) throw new Error('引擎没起来（60s 内 cc.director.getScene() 一直为空）');

  out.helper = await ev(HELPER, 'helper');
  await ev("(function () { var sc = cc.director.getScene(); if (!sc || sc.name !== 'Battle') { try { cc.director.loadScene('Battle'); } catch (e) {} } return 'go'; })()", 'load');
  let ready = null;
  for (let i = 0; i < 40; i += 1) {
    await sleep(500);
    ready = await ev("(function () { var sc = cc.director.getScene(); if (!sc || sc.name !== 'Battle') return null; var r = window.__s197.find(sc, 'BattleRoot'); return r ? { scene: sc.name } : null; })()", 'battle');
    if (ready) break;
  }
  out.battle = ready;
  log('battle scene', JSON.stringify(ready));
  await sleep(2500); // 让兵走开，背景不是初值

  /* ---------- 2) 有记录：十欄真值 ---------- */
  out.frontA = await front('fields');
  const a = await ev(panelExpr(FULL_CARDS, true), 'panel-full');
  if (!a || !a.ok) throw new Error('面板（有记录）打不开：' + JSON.stringify(a));
  log('fields/full', JSON.stringify(a.fields[0]));
  await sleep(700);
  out.frontB = await front('fields-shot');
  out.fields = await shot('surrender_fields');
  out.fieldsSize = pngSize(out.fields.path);
  log('surrender_fields', JSON.stringify(out.fields), JSON.stringify(out.fieldsSize));

  /* ---------- 3) 无记录：七欄灰「—」 ---------- */
  const b = await ev(panelExpr(BARE_CARDS, false), 'panel-grey');
  if (!b || !b.ok) throw new Error('面板（无记录）打不开：' + JSON.stringify(b));
  log('fields/grey', JSON.stringify(b.fields[0]));
  await sleep(700);
  out.frontC = await front('grey-shot');
  out.grey = await shot('surrender_grey');
  out.greySize = pngSize(out.grey.path);
  log('surrender_grey', JSON.stringify(out.grey), JSON.stringify(out.greySize));

  /* ---------- 4) 收尾：关面板、清视口 ---------- */
  await ev("(function () { var sc = cc.director.getScene(); var n = (sc.getChildByName('Canvas') || sc).getChildByName('SurrenderPanel'); if (n) n.active = false; return 'hidden'; })()", 'close');
  await s('Emulation.clearDeviceMetricsOverride');

  return {
    ok: true,
    files: { fields: out.fields.path, grey: out.grey.path },
    sizes: { fields: out.fieldsSize, grey: out.greySize },
    labels: { fields: a.fields[0], grey: b.fields[0] },
    frames: { fields: out.frontA, fieldsShot: out.frontB, greyShot: out.frontC },
  };
}
