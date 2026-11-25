// 收尾：技能 qi 硬数字 / 招降面板 / 四页皮肤 / 君主继承 / 10 存档槽
import { makeCtx } from './lib_accept.mjs';

export default async function (ctx0) {
  const { S, save, run, waitCampaignReady } = makeCtx(ctx0);
  const { log, sleep } = ctx0;
  const out = { at: new Date().toISOString(), phases: {} };

  const phase = async (name, fn) => {
    try {
      const r = await fn();
      out.phases[name] = r;
      log(name + ': ' + JSON.stringify(r).slice(0, 800));
      return r;
    } catch (err) {
      out.phases[name] = { err: String(err && err.message ? err.message : err) };
      log(name + ' ERR: ' + out.phases[name].err);
      return out.phases[name];
    }
  };

  const waitSceneWith = async (scene, field, secs) => {
    for (let i = 0; i < secs; i += 1) {
      await sleep(1000);
      const st = await run(`const c = __comp('CampaignRoot') || __comp('BattleRoot') || __comp('TitlePanel');
        return JSON.stringify({ s: __scene(), hasCampaign: !!__comp('CampaignRoot'), hasBattleWorld: !!(__comp('BattleRoot') && __comp('BattleRoot').world), hasTitle: !!__comp('TitlePanel') });`);
      if (!st || !st.s) continue;
      if (scene === 'Campaign' && st.s === 'Campaign' && st.hasCampaign) return st;
      if (scene === 'Battle' && st.s === 'Battle' && st.hasBattleWorld) return st;
      if (scene === 'Boot' && st.hasTitle) return st;
    }
    return null;
  };

  /* (A) 技能 qi 硬证据 */
  await phase('skill', async () => {
    await run(`cc.director.loadScene('Battle'); return JSON.stringify({ ok: 1 });`);
    await waitSceneWith('Battle', 'world', 45);
    await sleep(2500);
    const cast = await run(`
      const r = __comp('BattleRoot');
      if (!r || !r.world) return JSON.stringify({ ok: false, why: 'no world' });
      const w = r.world;
      const g = w.sides.A.general;
      const slot = r.input.slots[0];
      const before = { qi: g.qi, mp: g.mp, hp: g.hp };
      const ret = r.input.tapSkill(0);
      const after = { qi: g.qi, mp: g.mp, hp: g.hp };
      return JSON.stringify({ ok: true, over: w.over, slot: { seq: slot.seq, name: slot.name, qiCost: slot.qi, mpCost: slot.mp, kind: slot.kind }, before, after, qiDrop: before.qi - after.qi, mpDrop: before.mp - after.mp, ret });`);
    await sleep(1200);
    const msg = await run(`const r = __comp('BattleRoot'); return JSON.stringify({ lastMessage: r.lastMessage, inputMessage: r.input.message, over: r.world.over });`);
    await S('a6_01_skill_qi');
    return { cast, msg };
  });

  /* (B) 招降面板：生产入口（save.captured 预置 + 重进大地图 start()） */
  await phase('surrender', async () => {
    await run(`cc.director.loadScene('Campaign'); return JSON.stringify({ ok: 1 });`);
    await waitCampaignReady(45);
    await sleep(1500);
    const seeded = await run(`
      const c = __comp('CampaignRoot');
      const s = c.save;
      const before = { captured: JSON.parse(JSON.stringify(s.captured || null)), executed: JSON.parse(JSON.stringify(s.executed || null)) };
      s.captured = ['逢紀'];
      s.executed = [];
      return JSON.stringify({ ok: true, before });`);
    await run(`cc.director.loadScene('Campaign'); return JSON.stringify({ ok: 1 });`);
    await waitCampaignReady(45);
    await sleep(2000);
    const panel = await run(`
      const sp = __comp('SurrenderPanel');
      const nodes = __all().filter((n) => n.name === 'SurrenderPanel').map((n) => n.name);
      if (!sp) return JSON.stringify({ present: false, nodes });
      const d = sp.debug ? sp.debug() : {};
      return JSON.stringify({ present: true, isOpen: !!sp.isOpen, debug: d, nodes });`);
    const labels = await run(`return JSON.stringify({ labels: __labels().slice(-18) });`);
    await S('a6_02_surrender');
    return { seeded, panel, labels };
  });

  /* (C) 四页皮肤计数（大地图 / 内政 / 物品） */
  await phase('skin', async () => {
    const cleanup = await run(`
      const c = __comp('CampaignRoot');
      c.save.captured = [];
      const sp = __comp('SurrenderPanel');
      if (sp && sp.node) sp.node.active = false;
      return JSON.stringify({ ok: true });`);
    await sleep(500);
    const map = await run(`return JSON.stringify(__skin());`);
    const openCity = await run(`
      const c = __comp('CampaignRoot');
      const cp = __comp('CityPanel');
      if (cp && cp.close) cp.close();
      c.selected = '北平';
      c.openCityPanel('北平');
      return JSON.stringify({ ok: true });`);
    await sleep(800);
    const inner = await run(`return JSON.stringify(__skin());`);
    const openItems = await run(`
      const cp = __comp('CityPanel');
      if (!cp) return JSON.stringify({ ok: false });
      cp.cmdItems();
      return JSON.stringify({ ok: true });`);
    await sleep(1000);
    const items = await run(`const ip = __comp('ItemsPanel'); return JSON.stringify({ isOpen: ip ? !!ip.isOpen : null, skin: __skin() });`);
    await S('a6_03_items');
    return { cleanup: cleanup.ok, map: { skinNodes: map.skinNodes, spriteTotal: map.spriteTotal, uiFrames: map.uiFrames }, inner: { skinNodes: inner.skinNodes, spriteTotal: inner.spriteTotal, uiFrames: inner.uiFrames, names: inner.skinNames }, items, openCity: openCity.ok, openItems };
  });

  /* (D) 君主阵亡 → 继承人弹窗 */
  await phase('succession', async () => {
    await run(`
      const ip = __comp('ItemsPanel');
      if (ip && ip.close) ip.close();
      const cp = __comp('CityPanel');
      if (cp && cp.close) cp.close();
      return JSON.stringify({ ok: 1 });`);
    await sleep(600);
    const go = await run(`
      const c = __comp('CampaignRoot');
      const s = c.save;
      const before = { monarch: s.monarch, king: s.king, seat: c.monarchSeat, owned: JSON.parse(JSON.stringify(s.owned)) };
      // dev 钩子：把君主改成非太守（嚴綱）并把座位挪到非领城（易京）
      s.monarch = '嚴綱';
      if ('king' in s) s.king = '嚴綱';
      c.monarchSeat = '易京';
      c.successionState = null;
      c.monarchExtinct = false;
      c.checkMonarchDeath();
      const mp = __comp('MonarchPanel');
      return JSON.stringify({
        before,
        after: { monarch: s.monarch, seat: c.monarchSeat },
        hasPanel: !!mp, sheetKind: mp ? mp.sheetKind : null,
        successionState: c.successionState ? Object.keys(c.successionState) : null,
        hint: c.hintText
      });`);
    await sleep(1200);
    const view = await run(`
      const mp = __comp('MonarchPanel');
      if (!mp) return JSON.stringify({ hasPanel: false });
      const v = mp.successionView || null;
      return JSON.stringify({ hasPanel: true, isOpen: !!mp.isOpen, sheetKind: mp.sheetKind, viewTitle: v ? v.title : null, viewHint: v ? v.hint : null, names: v && v.names ? v.names : null, labels: __labels().slice(0, 30) });`);
    await S('a6_04_succession');
    return { go, view };
  });

  /* (E) 标题页「讀取存檔」10 槽 */
  await phase('slots', async () => {
    await run(`cc.director.loadScene('Boot'); return JSON.stringify({ ok: 1 });`);
    await waitSceneWith('Boot', 'title', 40);
    await sleep(1500);
    const t0 = await run(`const t = __comp('TitlePanel'); return JSON.stringify({ page: t ? t.page : null, acts: __hits(t).map((h) => h.act) });`);
    const tap = await run(`const t = __comp('TitlePanel'); return JSON.stringify(__tapAct(t, 'saves'));`);
    await sleep(1200);
    const info = await run(`
      const t = __comp('TitlePanel');
      const rows = [];
      for (let i = 1; i <= 10; i += 1) {
        const n1 = __node('SaveRow_' + i + '_L1');
        const n2 = __node('SaveRow_' + i + '_L2');
        const n3 = __node('SaveRow_' + i + '_L3');
        if (!n1) continue;
        rows.push([i, __lbl(n1), n2 ? __lbl(n2) : '', n3 ? __lbl(n3) : ''].join(' | '));
      }
      const sp = __comp('SaveSlotsPanel');
      return JSON.stringify({ page: t ? t.page : null, debug: t && t.debug ? t.debug() : null, rows, savePanel: sp ? sp.debug() : null, lsSlots: (function () { try { return sys.localStorage.getItem('sanguo_slots_v1'); } catch (e) { return 'err'; } })() });`);
    await S('a6_05_slots');
    return { t0, tap, info };
  });

  await save('p8.json', out);
  return out;
}
