// 第 5 轮验收 E：①战斗玩家点技能（r.input.tapSkill）②CampaignRoot 的推进一月方法名 + 推进后战报
export default async function ({ evaluate, sleep, shot, log }) {
  const ev = async (expr) => {
    const v = await evaluate(expr);
    if (v && v.__throw) throw new Error('eval threw: ' + v.__throw);
    return typeof v === 'string' ? JSON.parse(v) : v;
  };
  const H = `
    const __cn = (c) => (c && (c.__classname__ || (c.constructor && c.constructor.name))) || '?';
    const __all = () => { const sc = cc.director.getScene(); const a = []; const w = (n) => { a.push(n); n.children.forEach(w); }; if (sc) w(sc); return a; };
    const __comp = (name) => { const n = __all().find((x) => (x.components || []).some((c) => __cn(c) === name)); if (!n) return null; return (n.components || []).find((c) => __cn(c) === name) || null; };
  `;
  const out = {};
  await sleep(6000);

  // ① 战斗技能
  out.battleEnter = await ev(`(() => { ${H}
    if (cc.director.getScene().name !== 'Battle') cc.director.loadScene('Battle');
    return JSON.stringify({ scene: cc.director.getScene().name });
  })()`);
  await sleep(9000);
  out.cast = await ev(`(() => { ${H}
    const r = __comp('BattleRoot');
    if (!r || !r.input) return JSON.stringify({ ok: false, why: 'no root/input' });
    const w = r.world;
    const before = { qi: w.sides.A.qi, tick: w.tick, marks: (w.skillMarks || []).length, kills: w.sides.B.killed };
    r.input.tapSkill(0);
    return JSON.stringify({ ok: true, before, sel: r.input.selected ?? null, block: r.input.lastBlock ?? null });
  })()`);
  await sleep(1800);
  await shot('r90e_00_cast');
  out.afterCast = await ev(`(() => { ${H}
    const r = __comp('BattleRoot');
    const w = r.world;
    return JSON.stringify({ qi: w.sides.A.qi, tick: w.tick, marks: (w.skillMarks || []).length, msg: r.lastMessage, aim: r.labelAim ? r.labelAim.string : null });
  })()`);

  // ② 大地图推进一月
  out.toCampaign = await ev(`(() => { ${H}
    cc.director.loadScene('Campaign');
    return JSON.stringify({ ok: true });
  })()`);
  await sleep(5000);
  out.campaignKeys = await ev(`(() => { ${H}
    const c = __comp('CampaignRoot');
    if (!c) return JSON.stringify({ ok: false });
    const fns = Object.keys(c).filter((k) => typeof c[k] === 'function');
    return JSON.stringify({ fns, monthish: fns.filter((k) => /month|advance|next|turn/i.test(k)) });
  })()`);
  out.advance = await ev(`(() => { ${H}
    const c = __comp('CampaignRoot');
    const fns = Object.keys(c).filter((k) => typeof c[k] === 'function');
    const pick = fns.find((k) => /^advanceMonth$|^onNextMonth$|^nextMonth$|^doAdvanceMonth$/.test(k)) || fns.find((k) => /month/i.test(k) && /adv|next|push/i.test(k));
    if (!pick) return JSON.stringify({ ok: false, fns });
    const s0 = c.save ? { month: c.save.month, year: c.save.year, gold: c.save.gold, logs: (c.save.log || []).length } : null;
    c[pick]();
    return JSON.stringify({ ok: true, pick, s0 });
  })()`);
  await sleep(2500);
  await shot('r90e_01_month');
  out.afterAdvance = await ev(`(() => { ${H}
    const c = __comp('CampaignRoot');
    const s = c.save || {};
    return JSON.stringify({ month: s.month, year: s.year, gold: s.gold, logs: (s.log || []).length, tail: (s.log || []).slice(-2) });
  })()`);

  log(JSON.stringify(out, null, 2));
  return out;
}
