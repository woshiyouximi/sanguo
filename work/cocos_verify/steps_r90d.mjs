// 第 5 轮验收 D：推进一月（AI/战报）+ 战斗内玩家技能输入（d8 BattleInput 真接线）
export default async function ({ evaluate, sleep, shot, log }) {
  const ev = async (expr) => {
    const v = await evaluate(expr);
    if (v && v.__throw) throw new Error('eval threw: ' + v.__throw);
    return typeof v === 'string' ? JSON.parse(v) : v;
  };

  const HELPER = `
    const __cn = (c) => (c && (c.__classname__ || (c.constructor && c.constructor.name))) || '?';
    const __nodes = () => {
      const sc = cc.director.getScene(); const out = [];
      const walk = (n) => { out.push(n); n.children.forEach(walk); };
      if (sc) walk(sc); return out;
    };
    const __comp = (name) => {
      const n = __nodes().find((x) => (x.components || []).some((c) => __cn(c) === name));
      if (!n) return null;
      return (n.components || []).find((c) => __cn(c) === name) || null;
    };
  `;

  const out = {};
  await sleep(6000);

  // 直接进 Campaign（沿用 RunSetup 里已保存的开局选择）
  out.toCampaign = await ev(`(() => { ${HELPER}
    cc.director.loadScene('Campaign');
    return JSON.stringify({ ok: true });
  })()`);
  await sleep(5000);

  out.before = await ev(`(() => { ${HELPER}
    const c = __comp('CampaignRoot');
    if (!c) return JSON.stringify({ ok: false, why: 'no CampaignRoot' });
    const s = c.save || {};
    return JSON.stringify({ month: s.month, year: s.year, gold: s.gold, owned: (s.owned || []).length, logs: (s.log || []).length });
  })()`);

  out.advance = await ev(`(() => { ${HELPER}
    const c = __comp('CampaignRoot');
    if (!c) return JSON.stringify({ ok: false });
    if (typeof c.advanceMonth === 'function') c.advanceMonth();
    else if (typeof c['onAdvanceMonth'] === 'function') c['onAdvanceMonth']();
    else return JSON.stringify({ ok: false, why: 'no advanceMonth', keys: Object.keys(c).slice(0, 20) });
    return JSON.stringify({ ok: true });
  })()`);
  await sleep(2500);
  await shot('r90d_00_month');
  out.after = await ev(`(() => { ${HELPER}
    const c = __comp('CampaignRoot');
    const s = c.save || {};
    return JSON.stringify({ month: s.month, year: s.year, gold: s.gold, owned: (s.owned || []).length, logs: (s.log || []).length, logTail: (s.log || []).slice(-3) });
  })()`);

  // 战斗：直开 Battle，验玩家点技能
  out.toBattle = await ev(`(() => { ${HELPER}
    cc.director.loadScene('Battle');
    return JSON.stringify({ ok: true });
  })()`);
  await sleep(9000);

  out.battle0 = await ev(`(() => { ${HELPER}
    const r = __comp('BattleRoot');
    if (!r) return JSON.stringify({ ok: false, why: 'no BattleRoot', comps: [...new Set(__nodes().flatMap((n) => (n.components || []).map(__cn)))].slice(0, 20) });
    const w = r.world || (r['battle'] && r['battle'].world) || null;
    const inp = __comp('BattleInput');
    return JSON.stringify({ hasRoot: true, hasWorld: !!w, hasInput: !!inp, qi: w ? w.sides.A.qi : null, tick: w ? w.tick : null, skills: r.skills ? r.skills.length : null });
  })()`);

  out.tapSkill = await ev(`(() => { ${HELPER}
    const inp = __comp('BattleInput');
    if (!inp) return JSON.stringify({ ok: false, why: 'no BattleInput' });
    const before = typeof inp.world === 'object' && inp.world ? inp.world.sides.A.qi : null;
    inp.tapSkill(0);
    return JSON.stringify({ ok: true, before, fn: typeof inp.tapSkill });
  })()`);
  await sleep(2500);
  await shot('r90d_01_battle');
  out.battle1 = await ev(`(() => { ${HELPER}
    const r = __comp('BattleRoot');
    const w = r && (r.world || null);
    const inp = __comp('BattleInput');
    return JSON.stringify({ qi: w ? w.sides.A.qi : null, tick: w ? w.tick : null, marks: w && w.skillMarks ? w.skillMarks.length : null, sel: inp ? inp.selected : null, msg: r ? r.message : null });
  })()`);

  log(JSON.stringify(out, null, 2));
  return out;
}
