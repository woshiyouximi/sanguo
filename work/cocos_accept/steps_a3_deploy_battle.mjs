// A3：內政 → 物品 → 出征 → 編成（Deploy）→ 戰鬥（Battle）＋九宮皮膚計數
import { makeCtx } from './lib_accept.mjs';

export default async function (ctx0) {
  const { S, shots, waitScene, ensureCampaign, waitCampaignReady, save, run } = makeCtx(ctx0);
  const { log, sleep } = ctx0;
  const out = { at: new Date().toISOString() };

  out.ensure = await ensureCampaign();
  out.ready = await waitCampaignReady(40);
  if (!out.ready.ok) { log('campaign not ready'); save('r3.json', out); return out; }

  // 0) 收掉殘留的招降面板
  out.surrender = await run(`
    const sp = __comp('SurrenderPanel');
    if (!sp) return JSON.stringify({ present: false });
    const labels = (sp.hits || []).map((h) => h.label);
    const hit = (sp.hits || []).find((h) => h.label && h.label.indexOf('剩餘全部釋放') >= 0);
    if (hit) hit.act();
    return JSON.stringify({ present: true, labels, tapped: hit ? hit.label : null, cards: (sp.debug ? sp.debug().cards : null) });
  `);
  await ctx0.sleep(1500);
  out.surrenderAfter = await run(`const sp = __comp('SurrenderPanel'); return JSON.stringify({ stillThere: !!sp, isOpen: sp ? sp.isOpen : null });`);

  // 1) 大地圖
  out.skinCampaign = await run(`return JSON.stringify(__skin());`);
  out.map = await run(`
    const c = __comp('CampaignRoot');
    const s = c.save || {};
    return JSON.stringify({ scene: __scene(), month: s.month, year: s.year, gold: s.gold, owned: s.owned, selected: c.selected, hint: c.hintText, cities: c.cities.length });
  `);

  // 2) 內政
  out.openCity = await run(`const c = __comp('CampaignRoot'); c.openCityPanel((c.save || {}).owned[0]); return JSON.stringify({ ok: true, selected: c.selected });`);
  await ctx0.sleep(2000);
  await S('a3_01_city');
  out.cityPanel = await run(`
    const p = __comp('CityPanel');
    if (!p) return JSON.stringify({ ok: false, scene: __scene(), comps: __comps() });
    return JSON.stringify({ ok: true, skin: __skin(), labels: __labels().slice(0, 45) });
  `);

  // 3) 物品
  out.itemsOpen = await run(`const p = __comp('CityPanel'); if (!p) return JSON.stringify({ ok: false }); p.cmdItems(); return JSON.stringify({ ok: true });`);
  await ctx0.sleep(2000);
  await S('a3_02_items');
  out.itemsPanel = await run(`
    const ip = __comp('ItemsPanel');
    return JSON.stringify({ ok: !!ip, scene: __scene(), skin: __skin(), isOpen: ip ? ip.isOpen : null, labels: __labels().slice(0, 25) });
  `);

  // 4) 出征目標列
  out.deploySheet = await run(`
    const ip = __comp('ItemsPanel');
    if (ip && ip.close) ip.close();
    const p = __comp('CityPanel');
    p.cmdDeploy();
    return JSON.stringify({ sheetOpen: p.sheetOpen, rows: (p.sheetRows || []).map((r) => r.text).slice(0, 8) });
  `);
  await S('a3_03_deploy_sheet');

  out.march = await run(`
    const p = __comp('CityPanel');
    const row = (p.sheetRows || []).find((r) => r.act && r.text.indexOf('取　消') < 0);
    if (!row) return JSON.stringify({ ok: false, rows: (p.sheetRows || []).map((r) => r.text) });
    row.act();
    return JSON.stringify({ ok: true, tapped: row.text });
  `);

  out.deployWaitedSec = await waitScene('Deploy', 40);
  await ctx0.sleep(2000);
  await S('a3_04_deploy');
  out.deploy = await run(`
    const d = __comp('DeployRoot');
    if (!d) return JSON.stringify({ ok: false, scene: __scene(), comps: __comps() });
    return JSON.stringify({
      ok: true, scene: __scene(), skin: __skin(), home: d.home, garrison: d.garrison,
      target: d.targetCity ? d.targetCity.NAME : null, selectedGen: d.selectedGen,
      generals: (d.generals || []).map((g) => g.NAME), soldiers: d.soldiers, cap: d.soldierCap,
      hint: d.hintText, buttons: (d.buttons || []).map((b) => b.kind + ':' + b.index), labels: __labels().slice(0, 30),
    });
  `);

  // 5) 進戰鬥
  out.goBattle = await run(`const d = __comp('DeployRoot'); d.march(); return JSON.stringify({ ok: true, hint: d.hintText });`);
  out.battleWaitSec = await waitScene('Battle', 40);
  await ctx0.sleep(2500);
  await S('a3_05_battle');
  out.battle = await run(`
    const r = __comp('BattleRoot');
    if (!r) return JSON.stringify({ ok: false, scene: __scene(), comps: __comps() });
    const w = r.world;
    return JSON.stringify({
      ok: true, scene: __scene(), skin: __skin(), hasWorld: !!w, over: w ? w.over : null, hasInput: !!r.input,
      lastMessage: r.lastMessage,
      A: w ? { qi: w.sides.A.qi, mp: w.sides.A.mp, hp: w.sides.A.hp, dead: w.sides.A.dead, x: w.sides.A.x, y: w.sides.A.y } : null,
      B: w ? { qi: w.sides.B.qi, hp: w.sides.B.hp, dead: w.sides.B.dead } : null,
      skillBar: r.input && r.input.slots ? r.input.slots.map((s2) => ({ seq: s2.seq, name: s2.name, mp: s2.mp, qi: s2.qi, kind: s2.kind })) : null,
      labels: __labels().slice(0, 30),
    });
  `);

  // 6) 放技能 slot 0
  out.skill = await run(`
    const r = __comp('BattleRoot');
    const w = r.world;
    const qi0 = w.sides.A.qi; const hp0 = w.sides.A.hp; const msg0 = r.lastMessage;
    let ret = null;
    try { ret = r.input.tapSkill(0); } catch (e) { ret = 'throw:' + e.message; }
    return JSON.stringify({ qi0, hp0, msg0, ret, inputMessage: r.input.message, lastMessage: r.lastMessage, qi1: w.sides.A.qi });
  `);
  await ctx0.sleep(700);
  out.skillAfter = await run(`
    const r = __comp('BattleRoot');
    const w = r.world;
    const slot = r.input.slots[0];
    return JSON.stringify({
      lastMessage: r.lastMessage, inputMessage: r.input.message, qi: w.sides.A.qi, mp: w.sides.A.mp, hp: w.sides.A.hp,
      over: w.over, slot: slot ? { seq: slot.seq, name: slot.name, kind: slot.kind, qi: slot.qi, mp: slot.mp } : null,
      aim: r.labelAim ? r.labelAim.string : null,
    });
  `);
  await S('a3_06_skill');

  out.shots = shots;
  save('r3.json', out);
  return out;
}
