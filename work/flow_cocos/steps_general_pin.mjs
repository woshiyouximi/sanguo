// 追主将「貼邊」：GeneralArt.clampShift 把画布外的主将夹回战场带 → 双方主将同屏的真相。
// 附带确认：设计分辨率 / 画布 / 战场层有无额外缩放，以及各侧有多少小兵真的通过剔除。
import fs from 'node:fs';
import path from 'node:path';

const OUTDIR = process.env.OUTDIR || 'F:\\sanguo\\work\\flow_cocos';

// 页面内小工具 + 常量（每次新页面都要重装）
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
const CONST = String.raw`
window.__F = {
  GRID_W: 71, GRID_H: 14,
  ROW_PX: 96 * 750 / 1008,
  LANE_PX: 750 / 14,
  FIELD_TOP: 100, FIELD_H: 900, FIELD_BOTTOM: 1000, FIELD_CENTER_Y: 550,
  DESIGN_W: 750, DESIGN_H: 1334,
};
'ok'
`;

const EXPR = String.raw`
(function () {
  var h = window.__fg, F = window.__F;
  var sc = cc.director.getScene();
  var root = h.find(sc, 'BattleRoot');
  if (!root || !root.world) return { ok: false, error: 'no-world' };
  var w = root.world, camX = root.camX, out = { ok: true, camX: camX, tick: w.tick };
  var r3 = function (v) { return Math.round(v * 1000) / 1000; };
  var vis = cc.view;
  out.view = {
    design: vis.getDesignResolutionSize ? [vis.getDesignResolutionSize().width, vis.getDesignResolutionSize().height] : null,
    visible: [vis.getVisibleSize().width, vis.getVisibleSize().height],
    scale: [vis.getScaleX(), vis.getScaleY()],
    canvas: (function () { var c = document.querySelector('canvas'); return c ? [c.width, c.height, c.clientWidth, c.clientHeight] : null; })(),
    dpr: window.devicePixelRatio,
  };
  // 战场各层节点：确认没有整体缩放/平移（project 已是设计坐标）
  var layers = [];
  h.walk(sc, function (n) {
    var nm = String(n.name || '');
    if (/^(BattleBg|FieldLayer|UnitLayer|unitLayer|GeneralArt|FxLayer|HudLayer|ConsoleLayer)/.test(nm) || /General|Unit_/.test(nm)) {
      var t = n.getComponent && n.getComponent('cc.UITransform');
      layers.push({ name: nm, x: r3(n.position.x), y: r3(n.position.y),
        sx: r3(n.scale.x), sy: r3(n.scale.y), parent: n.parent ? n.parent.name : null,
        active: n.activeInHierarchy, w: t ? t.width : null, h: t ? t.height : null });
    }
  });
  out.layers = layers.slice(0, 30);
  // GeneralArt：raw 投影 vs 贴边后的脚底
  var ga = root.generalArt;
  out.hasArt = !!(ga && ga.hasArt && ga.hasArt());
  var gen = {};
  for (var i = 0; i < w.units.length; i++) {
    var u = w.units[i];
    if (!u.isGeneral) continue;
    var rawX = r3(u.y * F.LANE_PX + F.LANE_PX / 2);
    var rawY = r3(550 + (u.x - camX) * F.ROW_PX + 8); // +8 = 脚底
    var foot = ga && ga.footAt ? ga.footAt(u.side) : null;
    gen[u.side] = {
      gx: r3(u.x), gy: r3(u.y),
      rawScreen: { x: rawX, y: rawY },
      pinnedFoot: foot ? { x: r3(foot.x), y: r3(foot.y) } : null,
      shift: foot ? { dx: r3(foot.x - rawX), dy: r3(foot.y - rawY) } : null,
      insideBand: rawY >= F.FIELD_TOP && rawY <= F.FIELD_BOTTOM,
      offByRows: r3(rawY > 550 ? (rawY - 550) / F.ROW_PX : (rawY - 550) / F.ROW_PX),
    };
  }
  out.generals = gen;
  // 每侧有多少小兵真的落在战场带（剔除后）
  var cnt = { A: { total: 0, drawn: 0 }, B: { total: 0, drawn: 0 } };
  for (var k = 0; k < w.units.length; k++) {
    var v = w.units[k];
    if (!v.alive) continue;
    var sy = 550 + (v.x - camX) * F.ROW_PX;
    cnt[v.side].total++;
    if (sy >= F.FIELD_TOP - 40 && sy <= F.FIELD_BOTTOM + 40) cnt[v.side].drawn++;
  }
  out.soldierCull = cnt;
  // 贴边后的主将三层的实际节点坐标（设计坐标）
  var nodes = [];
  h.walk(sc, function (n) {
    if (/^(body|horse|weapon)[AB]$/.test(String(n.name || '')) && n.activeInHierarchy) {
      nodes.push({ name: n.name, x: r3(n.position.x), y: r3(n.position.y), sy: r3(F.DESIGN_H / 2 - n.position.y) });
    }
  });
  out.generalLayerNodes = nodes;
  return out;
})()
`;

export default async function steps({ evaluate, sleep, log, shot, s }) {
  await s('Page.bringToFront');
  const waitCc = "(function(){ try { return typeof cc==='object' && cc.director && cc.director.getScene() ? cc.director.getTotalFrames() : null; } catch(e){ return null; } })()";
  let fr = null;
  for (let i = 0; i < 30; i++) { fr = await evaluate(waitCc); if (fr && fr > 3) break; await sleep(500); }
  await evaluate(HELPER);
  await evaluate(CONST);
  const hasRoot = "(function(){ try { var sc=cc.director.getScene(); if(!sc) return null; var r=window.__fg.find(sc,'BattleRoot'); return { scene: sc.name, world: !!(r && r.world) }; } catch(e){ return 'err:'+e; } })()";
  let st = await evaluate(hasRoot);
  if (!st || st.__throw || !st.world) {
    await evaluate("(function(){ try { cc.director.loadScene('Battle'); return 1; } catch(e){ return 'err:'+e; } })()");
    for (let i = 0; i < 120; i++) {
      await sleep(200);
      st = await evaluate(hasRoot);
      if (st && st.world) break;
    }
  }
  await sleep(300);
  const v = await evaluate(EXPR);
  if (v && v.__throw) throw new Error('probe threw: ' + v.__throw);
  fs.mkdirSync(OUTDIR, { recursive: true });
  const dump = path.join(OUTDIR, 'general_pin.json');
  fs.writeFileSync(dump, JSON.stringify(v, null, 1), 'utf8');
  log('dump →', dump);
  // 再来一张：暂停后截，标注前（用于报告对照）
  await evaluate("(function(){ cc.director.pause(); return 1; })()");
  await shot('battle_pinned_generals.png');
  await evaluate("(function(){ cc.director.resume(); return 1; })()");
  return v;
}
