// 第 5 轮验收 B2：标题页 → 剧本 → 君主 → 大地图（名冊/列表/勢力）
// 组件查找用 ccclass 名（构建后 constructor.name 被压成 n，只有 __classname__ 保留）
export default async function ({ evaluate, sleep, shot, log }) {
  const ev = async (expr) => {
    const v = await evaluate(expr);
    if (v && v.__throw) throw new Error('eval threw: ' + v.__throw);
    return typeof v === 'string' ? JSON.parse(v) : v;
  };

  const HELPER = `
    const __cn = (c) => (c && (c.__classname__ || (c.constructor && c.constructor.name))) || '?';
    const __find = (name) => {
      const sc = cc.director.getScene();
      if (!sc) return null;
      let hit = null;
      const walk = (n) => {
        if (!hit && (n.components || []).some((c) => __cn(c) === name)) hit = n;
        n.children.forEach(walk);
      };
      walk(sc);
      return hit;
    };
    const __comp = (name) => {
      const n = __find(name);
      if (!n) return null;
      return (n.components || []).find((c) => __cn(c) === name) || null;
    };
    const __hits = (comp) => (comp && comp.hits ? comp.hits : []);
    const __act = (comp, act) => __hits(comp).find((h) => h.act === act) || null;
    const __tapAct = (comp, act) => {
      const h = __act(comp, act);
      if (!h) return { ok: false, acts: __hits(comp).map((x) => x.act) };
      comp.tap(h.x + h.w / 2, h.y + h.h / 2);
      return { ok: true, at: { x: h.x + h.w / 2, y: h.y + h.h / 2 } };
    };
    const __labels = () => {
      const sc = cc.director.getScene(); const out = [];
      const walk = (n) => { (n.components || []).forEach((c) => { if (c && __cn(c) === 'Label' && String(c.string).trim() !== '') out.push(c.string); }); n.children.forEach(walk); };
      if (sc) walk(sc); return out;
    };
  `;

  const out = {};
  await sleep(6000);

  out.boot = await ev(`(() => { ${HELPER}
    const t = __comp('TitlePanel');
    return JSON.stringify({ scene: cc.director.getScene().name, has: !!t, acts: t ? __hits(t).map((h) => h.act) : [], labelCount: __labels().length });
  })()`);

  out.tapNew = await ev(`(() => { ${HELPER}
    const t = __comp('TitlePanel');
    return JSON.stringify(t ? __tapAct(t, 'start') : { ok: false, why: 'no TitlePanel' });
  })()`);
  await sleep(1800);
  await shot('r90b_01_scenario');
  out.scenario = await ev(`(() => { ${HELPER}
    const s = __comp('ScenarioSelect');
    return JSON.stringify({ has: !!s, acts: s ? __hits(s).map((h) => h.act).slice(0, 10) : [], labels: __labels().filter((x) => x.includes('城')).slice(0, 8) });
  })()`);

  out.tapNext = await ev(`(() => { ${HELPER}
    const s = __comp('ScenarioSelect');
    return JSON.stringify(s ? __tapAct(s, 'next') : { ok: false });
  })()`);
  await sleep(1800);
  await shot('r90b_02_forces');
  out.forces = await ev(`(() => { ${HELPER}
    const s = __comp('ScenarioSelect');
    const h = s ? __hits(s) : [];
    return JSON.stringify({ forceRows: h.filter((x) => x.act === 'force').length, acts: [...new Set(h.map((x) => x.act))], labels: __labels().slice(0, 10) });
  })()`);

  log(JSON.stringify(out, null, 2));
  return out;
}

