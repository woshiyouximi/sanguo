// 第二场战斗：技能 qi 前后硬证据 + 战后招降面板
import { makeCtx } from './lib_accept.mjs';

export default async function (ctx0) {
  const { S, save, run, waitCampaignReady } = makeCtx(ctx0);
  const { log, sleep, click } = ctx0;
  const out = { at: new Date().toISOString() };

  await waitCampaignReady(30);

  // 1) 从内政页读「出征」目标行（M.deployTargets），挑一个含可招降守将的城
  const GOOD = ['南皮', '平原', '鄴', '北海', '濮陽', '陳留', '洛陽', '弘農', '長安', '西涼', '易京', '代縣'];
  out.sheet = await run(`
    const c = __comp('CampaignRoot');
    c.selected = '北平';
    c.openCityPanel('北平');
    const cp = __comp('CityPanel');
    if (!cp) return JSON.stringify({ ok: false, why: 'no CityPanel' });
    cp.cmdDeploy();
    const rows = (cp.sheetRows || []).filter((r) => r && r.text && r.text.indexOf('取') !== 0);
    return JSON.stringify({ ok: true, sheetOpen: !!cp.sheetRows, rows: rows.map((r) => r.text) });`);
  log('sheet: ' + JSON.stringify(out.sheet));

  if (!out.sheet || !out.sheet.ok || !out.sheet.rows || !out.sheet.rows.length) {
    out.fail = 'no deploy rows';
    await save('p6.json', out);
    return out;
  }
  const names = out.sheet.rows.map((t) => t.split('｜')[0]);
  let idx = names.findIndex((n) => GOOD.indexOf(n) >= 0);
  if (idx < 0) idx = 0;
  out.target = names[idx];

  out.march = await run(`
    const c = __comp('CampaignRoot');
    const cp = __comp('CityPanel');
    const rows = (cp.sheetRows || []).filter((r) => r && r.text && r.text.indexOf('取') !== 0);
    const row = rows[${idx}];
    if (!row) return JSON.stringify({ ok: false });
    row.act();
    return JSON.stringify({ ok: true, tapped: row.text });`);
  log('march: ' + JSON.stringify(out.march));

  for (let i = 0; i < 25; i += 1) {
    await sleep(1000);
    const st = await run(`return JSON.stringify({ s: __scene() });`);
    if (st && st.s === 'Deploy') break;
  }
  out.deployScene = await run(`return JSON.stringify({ s: __scene() });`);

  out.deploy = await run(`
    const d = __comp('DeployRoot');
    if (!d) return JSON.stringify({ ok: false });
    const go = (d.buttons || []).find((b) => b.kind === 'go');
    if (!go) return JSON.stringify({ ok: false, why: 'no go' });
    d.tap(go.x + go.w / 2, go.y + go.h / 2);
    return JSON.stringify({ ok: true, target: d.targetCity ? d.targetCity.NAME : null, home: d.homeCity ? d.homeCity.NAME : null, go: go });`);
  log('deploy: ' + JSON.stringify(out.deploy));

  for (let i = 0; i < 30; i += 1) {
    await sleep(1000);
    const st = await run(`return JSON.stringify({ s: __scene() });`);
    if (st && st.s === 'Battle') break;
  }
  await sleep(3000);

  // 2) 开战初态 + 技能 qi 前后（同一次 eval，中间不吃 tick）
  out.battleStart = await run(`
    const r = __comp('BattleRoot');
    if (!r || !r.world) return JSON.stringify({ ok: false });
    const w = r.world;
    return JSON.stringify({ ok: true, over: w.over, units: (w.units || []).length, A: { alive: w.sides.A.aliveCount, start: w.sides.A.start, gen: w.sides.A.general }, B: { alive: w.sides.B.aliveCount, start: w.sides.B.start, gen: w.sides.B.general }, enemy: w.data ? (w.data.enemyName || null) : null });`);
  log('battleStart: ' + JSON.stringify(out.battleStart).slice(0, 700));

  out.skillCast = await run(`
    const r = __comp('BattleRoot');
    const w = r.world;
    const g = w.sides.A.general;
    const before = { qi: g.qi, mp: g.mp, hp: g.hp };
    const slot = r.input.slots[0];
    const canCast = r.input.hitTest ? null : null;
    const ret = r.input.tapSkill(0);
    const after = { qi: g.qi, mp: g.mp, hp: g.hp };
    window.__ACCEPT_SKILL = JSON.stringify({ before, after, slot, ret });
    return JSON.stringify({ before, after, slot: { seq: slot.seq, name: slot.name, qi: slot.qi, mp: slot.mp, kind: slot.kind }, qiDrop: before.qi - after.qi, mpDrop: before.mp - after.mp, ret });`);
  log('skillCast: ' + JSON.stringify(out.skillCast).slice(0, 900));

  await sleep(1200);
  out.skillMsg = await run(`
    const r = __comp('BattleRoot');
    return JSON.stringify({ lastMessage: r.lastMessage, inputMessage: r.input.message, over: r.world.over });`);
  await S('a5_01_skill');

  // 3) 等战斗结束
  let over = false;
  for (let i = 0; i < 150; i += 1) {
    await sleep(1000);
    const st = await run(`const r = __comp('BattleRoot'); return JSON.stringify({ s: __scene(), over: r && r.world ? r.world.over : null, settled: r ? !!r.settlement : null });`);
    if (st && st.s === 'Battle' && st.over) { over = true; break; }
    if (st && st.s === 'Campaign') { over = true; break; }
    if (st && st.s === 'Deploy') { break; }
  }
  out.battleOver = over;

  out.settle = await run(`
    const r = __comp('BattleRoot');
    if (!r || !r.settlement) return JSON.stringify({ ok: false });
    const st = r.settlement;
    window.__ACCEPT_SETTLE = JSON.stringify(st);
    return JSON.stringify({ ok: true, winner: r.world.winner, endReason: r.world.endReason, post: st.post, record: st.record, survivorsA: r.world.sides.A.aliveCount, survivorsB: r.world.sides.B.aliveCount, qiEnd: r.world.sides.A.general.qi });`);
  log('settle2: ' + JSON.stringify(out.settle).slice(0, 900));
  await S('a5_02_settlement');

  // 4) 点画面回大地图
  out.tapBack = await run(`
    const r = __comp('BattleRoot');
    const hit = r.input.hitTest(375, 667, r.camX);
    return JSON.stringify({ hit: hit ? hit.type : null });`);
  await click(390, 681);
  let scene = '';
  for (let i = 0; i < 25; i += 1) {
    await sleep(1000);
    const st = await run(`return JSON.stringify({ s: __scene() });`);
    scene = st && st.s;
    if (scene === 'Campaign') break;
  }
  out.sceneBack = scene;

  await sleep(1500);
  out.surrender = await run(`
    const sp = __comp('SurrenderPanel');
    const c = __comp('CampaignRoot');
    const s = (c && c.save) || {};
    if (!sp) return JSON.stringify({ present: false, captured: s.captured, executed: s.executed, owned: s.owned, wins: s.wins });
    const d = sp.debug ? sp.debug() : {};
    return JSON.stringify({ present: true, isOpen: !!sp.isOpen, debug: d, captured: s.captured, executed: s.executed });`);
  log('surrender2: ' + JSON.stringify(out.surrender).slice(0, 1200));
  await S('a5_03_surrender');

  await save('p6.json', out);
  return out;
}
