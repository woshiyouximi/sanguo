// 战斗结束 → 结算 → 点「返回大地图」→ 招降面板
import { makeCtx } from './lib_accept.mjs';

export default async function (ctx0) {
  const { S, shots, save, run } = makeCtx(ctx0);
  const { log, sleep, click } = ctx0;
  const out = { at: new Date().toISOString() };

  out.settle = await run(`
    const r = __comp('BattleRoot');
    if (!r) return JSON.stringify({ hasBattleRoot: false });
    const st = r.settlement;
    const w = r.world;
    return JSON.stringify({
      over: w ? w.over : null,
      winner: w ? w.winner : null,
      endReason: w ? w.endReason : null,
      settledFlag: w ? !!w.settled : null,
      hasSettlement: !!st,
      post: st ? JSON.parse(JSON.stringify(st.post || null)) : null,
      record: st ? JSON.parse(JSON.stringify(st.record || null)) : null,
      survivorsA: w && w.sides.A ? w.sides.A.aliveCount : null,
      survivorsB: w && w.sides.B ? w.sides.B.aliveCount : null,
      generalA: w && w.sides.A && w.sides.A.general ? { hp: w.sides.A.general.hp, mp: w.sides.A.general.mp, qi: w.sides.A.general.qi, alive: w.sides.A.general.alive } : null,
      generalB: w && w.sides.B && w.sides.B.general ? { hp: w.sides.B.general.hp, mp: w.sides.B.general.mp, qi: w.sides.B.general.qi, alive: w.sides.B.general.alive } : null,
      lastMessage: r.lastMessage,
      from: r.launch ? r.launch.from : null
    });`);
  log('settle: ' + JSON.stringify(out.settle).slice(0, 600));

  await S('a4_01_settlement');

  // 用 hitTest 网格找 restart 命中矩形（设计坐标）
  out.restartRect = await run(`
    const r = __comp('BattleRoot');
    if (!r || !r.input) return JSON.stringify({ ok: false });
    const hit = (x, y) => { try { const h = r.input.hitTest(x, y, r.camX); return h ? h.type : null; } catch (e) { return 'err:' + e.message; } };
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, n = 0, types = {};
    for (let y = 20; y <= 1320; y += 20) {
      for (let x = 20; x <= 740; x += 20) {
        const t = hit(x, y);
        if (t) { types[t] = (types[t] || 0) + 1; }
        if (t === 'restart') { n += 1; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
      }
    }
    return JSON.stringify({ ok: true, types, restartCount: n, rect: n ? { x: (minX + maxX) / 2, y: (minY + maxY) / 2, minX, maxX, minY, maxY } : null, camX: r.camX });`);
  log('restartRect: ' + JSON.stringify(out.restartRect));

  // 设计坐标 → CSS 像素
  out.mapping = await run(`
    const cv = document.querySelector('canvas');
    const r = cv.getBoundingClientRect();
    const v = cc.view;
    const sx = v.getScaleX(), sy = v.getScaleY();
    const vo = v.getVisibleOrigin();
    return JSON.stringify({ rect: { l: r.left, t: r.top, w: r.width, h: r.height }, sx, sy, vo: { x: vo.x, y: vo.y }, vs: v.getVisibleSize(), dr: v.getDesignResolutionSize() });`);
  log('mapping: ' + JSON.stringify(out.mapping));

  const rr = out.restartRect;
  if (rr && rr.rect) {
    const m = out.mapping;
    const dx = rr.rect.x; const dy = rr.rect.y;
    const cssX = m.rect.l + (dx - m.vo.x) * m.sx;
    const cssY = m.rect.t + m.rect.h - (dy - m.vo.y) * m.sy;
    out.tapCss = { x: Math.round(cssX), y: Math.round(cssY) };
    log('tap css: ' + JSON.stringify(out.tapCss));
    await click(out.tapCss.x, out.tapCss.y);
    let scene = '';
    for (let i = 0; i < 20; i += 1) {
      await sleep(1000);
      const st = await run(`return JSON.stringify({ s: __scene() });`);
      scene = st && st.s;
      if (scene === 'Campaign') break;
    }
    out.sceneAfterTap = scene;
    out.tapWorked = scene === 'Campaign';
  }

  if (!out.tapWorked) {
    log('real tap did not switch scene; fallback loadScene');
    await run(`cc.director.loadScene('Campaign'); return JSON.stringify({ ok: true });`);
    for (let i = 0; i < 20; i += 1) {
      await sleep(1000);
      const st = await run(`return JSON.stringify({ s: __scene(), ready: (()=>{const c=__comp('CampaignRoot'); return !!(c&&c.save&&c.save.owned&&c.save.owned.length);})() });`);
      if (st && st.s === 'Campaign' && st.ready) break;
    }
  }

  await sleep(1500);
  out.surrender = await run(`
    const sp = __comp('SurrenderPanel');
    if (!sp) return JSON.stringify({ present: false, nodes: __all().filter((n) => n.name.indexOf('Surrender') >= 0).map((n) => n.name) });
    const d = sp.debug ? sp.debug() : {};
    return JSON.stringify({ present: true, isOpen: !!sp.isOpen, debug: d });`);
  log('surrender: ' + JSON.stringify(out.surrender).slice(0, 900));

  out.map = await run(`const c = __comp('CampaignRoot'); const s = (c && c.save) || {};
    return JSON.stringify({ scene: __scene(), month: s.month, gold: s.gold, wins: s.wins, losses: s.losses, owned: s.owned, hint: c ? c.hintText : null });`);
  await S('a4_02_surrender');

  await save('p2.json', out);
  return out;
}
