// 探针：战斗 World 结构 + 当前战局/战后状态
import { makeCtx } from './lib_accept.mjs';

export default async function (ctx0) {
  const { S, shots, save, run } = makeCtx(ctx0);
  const { log, sleep } = ctx0;
  const out = { at: new Date().toISOString() };

  out.scene = await run(`return JSON.stringify({ s: __scene() });`);
  out.surrender = await run(`const sp = __comp('SurrenderPanel');
    if (!sp) return JSON.stringify({ present: false });
    const d = sp.debug ? sp.debug() : {};
    return JSON.stringify({ present: true, isOpen: !!sp.isOpen, cards: d.cards, left: d.left, visible: d.visible, title: d.title, msg: d.msg, hits: d.hits });`);

  // Battle 场景还在？
  const br = await run(`const r = __comp('BattleRoot');
    if (!r) return JSON.stringify({ hasBattleRoot: false });
    return JSON.stringify({ hasBattleRoot: true, over: r.world ? r.world.over : null, hasSettlement: !!r.settlement, lastMessage: r.lastMessage });`);
  out.battleNow = br;

  // 只要能拿到 world 就 dump 结构
  out.worldShape = await run(`
    const r = __comp('BattleRoot');
    const w = r && r.world;
    if (!w) return JSON.stringify({ hasWorld: false });
    const own = Object.getOwnPropertyNames(w);
    const proto = Object.getOwnPropertyNames(Object.getPrototypeOf(w) || {});
    const sides = w.sides || null;
    const dump = (o) => {
      if (!o) return null;
      const o1 = Object.getOwnPropertyNames(o);
      let p1 = [];
      let p = Object.getPrototypeOf(o);
      let guard = 0;
      while (p && guard < 3) { p1 = p1.concat(Object.getOwnPropertyNames(p)); p = Object.getPrototypeOf(p); guard += 1; }
      const reads = {};
      o1.forEach((k) => { try { const v = o[k]; reads[k] = (v && typeof v === 'object') ? '[obj]' : v; } catch (e) { reads[k] = 'throw'; } });
      return { own: o1, protos: Array.from(new Set(p1)), reads };
    };
    return JSON.stringify({
      hasWorld: true, over: w.over, own, proto,
      sidesKeys: sides ? Object.getOwnPropertyNames(sides) : null,
      A: dump(sides && sides.A), B: dump(sides && sides.B),
      hasCast: typeof w.cast, hasTick: typeof w.tick
    });`);
  log('worldShape: ' + JSON.stringify(out.worldShape).slice(0, 1200));

  await save('p1.json', out);
  return out;
}
