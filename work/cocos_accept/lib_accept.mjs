// 驗收腳本共用工具（只在 F:\sanguo\work\cocos_accept 內使用）
import fs from 'node:fs';
import path from 'node:path';

/** 注入頁面用的 helper 字串 */
export const H = `
  const __cn = (c) => (c && (c.__classname__ || (c.constructor && c.constructor.name))) || '?';
  const __all = () => { const sc = cc.director.getScene(); const a = []; const w = (n) => { a.push(n); n.children.forEach(w); }; if (sc) w(sc); return a; };
  const __comp = (name) => { const n = __all().find((x) => (x.components || []).some((c) => __cn(c) === name)); if (!n) return null; return (n.components || []).find((c) => __cn(c) === name) || null; };
  const __node = (name) => __all().find((x) => x.name === name) || null;
  const __lbl = (name) => { const n = __node(name); if (!n) return null; const l = n.getComponent(cc.Label); return l ? l.string : null; };
  const __scene = () => (cc.director.getScene() ? cc.director.getScene().name : '?');
  const __comps = () => { const s = new Set(); __all().forEach((n) => (n.components || []).forEach((c) => s.add(__cn(c)))); return [...s]; };
  const __labels = () => __all().map((n) => { const l = n.getComponent && n.getComponent(cc.Label); return l ? l.string : null; }).filter((x) => x && String(x).trim().length > 0);
  const __hits = (c) => (c && c.hits ? c.hits : []);
  const __tapAct = (comp, act) => {
    const h = __hits(comp).find((x) => x.act === act);
    if (!h) return { ok: false, acts: [...new Set(__hits(comp).map((x) => x.act))] };
    comp.tap(h.x + h.w / 2, h.y + h.h / 2);
    return { ok: true, at: { x: Math.round(h.x + h.w / 2), y: Math.round(h.y + h.h / 2) } };
  };
  const __skin = () => {
    let skinNodes = 0; const skinNames = [];
    let spriteTotal = 0; let uiFrames = 0; const frameNames = [];
    __all().forEach((n) => {
      if (typeof n.name === 'string' && n.name.indexOf('Skin_') === 0) { skinNodes += 1; skinNames.push(n.name); }
      const sp = n.getComponent ? n.getComponent(cc.Sprite) : null;
      if (sp) {
        spriteTotal += 1;
        const f = sp.spriteFrame;
        const nm = f && f.name ? String(f.name) : '';
        if (nm.indexOf('ui/') >= 0) { uiFrames += 1; frameNames.push(n.name + '=' + nm); }
        else frameNames.push(n.name + '[' + (nm || 'null') + ']');
      }
    });
    return { skinNodes, skinNames: skinNames.slice(0, 50), spriteTotal, uiFrames, frameNames: frameNames.slice(0, 50) };
  };
`;

export function makeCtx({ evaluate, sleep, shot, log, OUTDIR }) {
  const ev = async (expr) => {
    const v = await evaluate(expr);
    if (v && v.__throw) return { __err: 'eval threw: ' + v.__throw };
    return typeof v === 'string' ? JSON.parse(v) : v;
  };
  /** 嚴格版：拋錯（需要時用） */
  const evStrict = async (expr) => {
    const v = await ev(expr);
    if (v && v.__err) throw new Error(v.__err);
    return v;
  };
  const wrap = (body) => `(() => { ${H} ${body} })()`;
  const run = async (body) => ev(wrap(body));
  const shots = [];
  const S = async (n) => {
    const a = await shot(n + '_a');
    await sleep(600);
    const b = await shot(n);
    shots.push({ name: n, a: a.bytes, b: b.bytes, same: a.bytes === b.bytes });
    return shots[shots.length - 1];
  };
  const waitScene = async (name, secs) => {
    for (let i = 0; i < secs; i += 1) {
      const st = await run(`return JSON.stringify({ scene: __scene() });`);
      if (st.scene === name) return i;
      await sleep(1000);
    }
    return -1;
  };
  const waitComp = async (name, secs) => {
    for (let i = 0; i < secs; i += 1) {
      const st = await run(`return JSON.stringify({ has: !!__comp('${name}'), scene: __scene() });`);
      if (st.has) return { ok: true, waited: i, scene: st.scene };
      await sleep(1000);
    }
    return { ok: false, waited: secs, scene: (await run(`return JSON.stringify({ scene: __scene() });`)).scene };
  };
  /**
   * 把畫面帶到大地圖（Campaign）。容忍頁面被重建導致 reload：
   * 標題頁 → 開始新局 → 劇本卡 0 → 下一頁 → 君主第 1 行 → 開始新局。
   */
  const ensureCampaign = async (tries = 3) => {
    const trail = [];
    for (let t = 0; t < tries; t += 1) {
      for (let i = 0; i < 90; i += 1) {
        const st = await run(`return JSON.stringify({ scene: __scene(), campaign: !!__comp('CampaignRoot'), title: !!__comp('TitlePanel'), scenario: !!__comp('ScenarioSelect') });`);
        if (st.campaign) return { ok: true, trail, step: i };
        if (st.scene === 'Deploy' || st.scene === 'Battle') {
          await run(`cc.director.loadScene('Campaign'); return JSON.stringify({ ok: true });`);
          trail.push('forceCampaignFrom:' + st.scene);
          await sleep(4000);
        } else if (st.title) {
          await run(`const t = __comp('TitlePanel'); return JSON.stringify(__tapAct(t, 'new'));`);
          trail.push('tapNew');
        } else if (st.scenario) {
          const sub = await run(`const s = __comp('ScenarioSelect'); return JSON.stringify({ page: s.page });`);
          if (sub.page === 'scenario') {
            await run(`const s = __comp('ScenarioSelect'); const c = __hits(s).find((h) => h.act === 'card' && (h.index === 0 || h.index === undefined)); if (c) s.tap(c.x + c.w / 2, c.y + c.h / 2); return JSON.stringify(__tapAct(s, 'next'));`);
            trail.push('card0+next');
          } else {
            const r = await run(`const s = __comp('ScenarioSelect'); const rows = __hits(s).filter((h) => h.act === 'force'); const r0 = rows[0]; if (r0) s.tap(r0.x + r0.w / 2, r0.y + r0.h / 2); return JSON.stringify({ rows: rows.length, name: r0 ? r0.name : null });`);
            await sleep(600);
            await run(`const s = __comp('ScenarioSelect'); return JSON.stringify(__tapAct(s, 'start'));`);
            trail.push('force0+start(' + (r.name || '?') + ')');
          }
        }
        await sleep(1500);
      }
    }
    return { ok: false, trail };
  };
  const save = (name, obj) => {
    fs.writeFileSync(path.join(OUTDIR, name), JSON.stringify(obj, null, 1), 'utf8');
    log('wrote ' + name);
  };
  /** 等 CampaignRoot 真的 `start()` 完（this.save 有 owned） */
  const waitCampaignReady = async (secs = 30) => {
    for (let i = 0; i < secs; i += 1) {
      const st = await run(`const c = __comp('CampaignRoot'); return JSON.stringify({ ready: !!(c && c.save && c.save.owned && c.save.owned.length), month: c && c.save ? c.save.month : null });`);
      if (st && st.ready) return { ok: true, waited: i, month: st.month };
      await sleep(1000);
    }
    return { ok: false };
  };
  return { ev, evStrict, run, S, shots, waitScene, waitComp, waitCampaignReady, ensureCampaign, save };
}
