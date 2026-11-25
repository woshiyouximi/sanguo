// 真机点击验收（g6 全軍突擊接线）：新页 → 切 Battle → 真点「突擊」→ 全军前压。
// 坐标换算：设计 750×1334；页面点 = (rect.left + ox + sx*sc, rect.top + oy + sy*sc)，
// ox/oy 为 canvas 居中留边（876×1368 时 sc=1.025487、oy≈0）。
export default async function ({ evaluate, sleep, shot, log, click, s }) {
  const ev = async (expr) => {
    const v = await evaluate(expr);
    if (v && v.__throw) throw new Error('eval threw: ' + v.__throw);
    return typeof v === 'string' ? JSON.parse(v) : v;
  };
  const H = `
    const __cn = (c) => (c && (c.__classname__ || (c.constructor && c.constructor.name))) || '?';
    const __all = () => { const sc = cc.director.getScene(); const a = []; const w = (n) => { a.push(n); n.children.forEach(w); }; if (sc) w(sc); return a; };
    const __comp = (name) => { const n = __all().find((x) => (x.components || []).some((c) => __cn(c) === name)); if (!n) return null; return (n.components || []).find((c) => __cn(c) === name) || null; };
    const __texts = (root) => { const a = []; const w = (n) => { for (const c of n.components || []) { if (c instanceof cc.Label && c.string) a.push(c.string); } n.children.forEach(w); }; w(root.node); return a; };
  `;
  const out = { steps: [] };

  await sleep(9000);
  out.boot = await ev(`(() => { ${H}
    const sc = cc.director.getScene();
    const has = !!__comp('BattleRoot');
    if (!has) cc.director.loadScene('Battle');
    return JSON.stringify({ scene: sc ? sc.name : null, hasRoot: has });
  })()`);
  if (!out.boot.hasRoot) {
    // 冷启动（新 profile / 无缓存）时 Battle 场景要 20s+，轮询等它就绪
    for (let i = 0; i < 45; i += 1) {
      await sleep(1000);
      const has = await ev(`(() => { ${H} return JSON.stringify({ root: !!__comp('BattleRoot') }); })()`);
      if (has.root) break;
    }
  }
  // 场景切进来后还要等 BattleRoot.boot() 建好 world（冷启动可达 20s）
  for (let i = 0; i < 45; i += 1) {
    const st = await ev(`(() => { ${H} const r = __comp('BattleRoot'); return JSON.stringify({ world: !!(r && r.world) }); })()`);
    if (st.world) break;
    await sleep(1000);
  }
  out.loaded = await ev(`(() => { ${H} const r = __comp('BattleRoot');
    return JSON.stringify({ root: !!r, world: !!(r && r.world), over: r && r.world ? r.world.over : null,
      scene: cc.director.getScene() ? cc.director.getScene().name : null });
  })()`);
  if (!out.loaded.over && !out.loaded.world) {
    // 直接 loadScene('Battle') 时 autoStart=false：要显式 boot() 建局
    await ev(`(async () => { ${H} const r = __comp('BattleRoot'); await r.boot(); return JSON.stringify({ boot: true }); })()`);
    await sleep(2500);
    out.loaded = await ev(`(() => { ${H} const r = __comp('BattleRoot'); return JSON.stringify({ root: !!r, world: !!(r && r.world), over: r && r.world ? r.world.over : null }); })()`);
  }
  if (out.loaded.over) {
    await ev(`(async () => { ${H} const r = __comp('BattleRoot'); await r.boot(); return JSON.stringify({ reboot: true }); })()`);
    await sleep(3500);
  }

  const map = await ev(`(() => { ${H}
    const r = __comp('BattleRoot');
    if (!r || !r.world) return JSON.stringify({ ok: false, why: 'no battle root/world' });
    const c = document.querySelector('canvas');
    const rect = c.getBoundingClientRect();
    const sc = cc.view.getScaleX();
    const ox = (rect.width - 750 * sc) / 2;
    const oy = (rect.height - 1334 * sc) / 2;
    const toPage = (sx, sy) => ({ x: rect.left + ox + sx * sc, y: rect.top + oy + sy * sc });
    const a = r.world.units.filter((u) => u.side === 'A' && u.alive);
    let ax = 0, ay = 0;
    for (let i = 0; i < a.length; i++) { ax += a[i].x; ay += a[i].y; }
    const hud = __comp('BattleHud');
    return JSON.stringify({
      ok: true, sc, rect: { w: rect.width, h: rect.height },
      assault: toPage(528 + 102, 1124 + 42),
      field: toPage(375, 550),
      rush: !!(r.world.rush && r.world.rush.A),
      aCount: a.length, aMeanX: a.length ? ax / a.length : null, aMeanY: a.length ? ay / a.length : null,
      hudTexts: hud ? __texts(hud).filter((t) => t.indexOf('突') >= 0 || t.indexOf('軍') >= 0) : [],
      phase: r.input.phase, message: r.input.message,
    });
  })()`);
  out.map = map;
  if (!map.ok) { log(JSON.stringify(out, null, 2)); return out; }
  await shot('battle_rush_before.png');

  // 真点「突擊」
  await click(map.assault.x, map.assault.y);
  await sleep(450);
  out.afterRush = await ev(`(() => { ${H} const r = __comp('BattleRoot'); const hud = __comp('BattleHud');
    const a = r.world.units.filter((u) => u.side === 'A' && u.alive);
    let ax = 0; for (let i = 0; i < a.length; i++) ax += a[i].x;
    return JSON.stringify({ rush: r.world.rush.A,
      message: r.input.message, phase: r.input.phase, aMeanX: a.length ? ax / a.length : null,
      hudTexts: hud ? __texts(hud).filter((t) => t.indexOf('突') >= 0) : [],
      banner: r.input.banner, toast: r.labelToast && r.labelToast.node.active ? r.labelToast.string : null });
  })()`);
  await shot('battle_rush.png');

  // 等 2.5s：全军应前压（A 侧 x 均值下降，朝 B 推进）
  await sleep(2500);
  out.afterAdvance = await ev(`(() => { ${H} const r = __comp('BattleRoot'); const hud = __comp('BattleHud');
    const a = r.world.units.filter((u) => u.side === 'A' && u.alive);
    let ax = 0; for (let i = 0; i < a.length; i++) ax += a[i].x;
    const b = r.world.units.filter((u) => u.side === 'B' && u.alive);
    return JSON.stringify({ rush: r.world.rush.A, aMeanX: a.length ? ax / a.length : null, aAlive: a.length, bAlive: b.length,
      hudTexts: hud ? __texts(hud).filter((t) => t.indexOf('突') >= 0) : [], message: r.input.message });
  })()`);
  await shot('battle_rush_advance.png');

  // 再点一次：应走「全軍已在突擊中。」幂等分支
  await click(map.assault.x, map.assault.y);
  await sleep(400);
  out.afterSecond = await ev(`(() => { ${H} const r = __comp('BattleRoot');
    const a = r.world.units.filter((u) => u.side === 'A' && u.alive);
    let ax = 0; for (let i = 0; i < a.length; i++) ax += a[i].x;
    return JSON.stringify({ rush: r.world.rush.A, message: r.input.message, aMeanX: a.length ? ax / a.length : null });
  })()`);
  await shot('battle_rush_again.png');

  // 8 技位版式：把当前将临时提到 Lv30（完整习得表），重绑技能条后点第 8 格 → 选中
  out.slots8 = await ev(`(() => { ${H}
    const r = __comp('BattleRoot');
    const g = r.world.sides.A.general;
    g.level = 40; g.qi = 120000; g.mp = 999;
    r.input.bind(r.world);
    if (r.hud) r.hud.refresh(r.world, null, r.launch, '');
    const c = document.querySelector('canvas');
    const rect = c.getBoundingClientRect();
    const sc = cc.view.getScaleX();
    const ox = (rect.width - 750 * sc) / 2;
    const oy = (rect.height - 1334 * sc) / 2;
    const sx = 116 + 3 * 98 + 44;   // 第 8 格（第二行第 4 列）中心
    const sy = 1162 + 28;
    return JSON.stringify({ count: r.input.slots.length, names: r.input.slots.map((s) => s.name),
      slot8: { x: rect.left + ox + sx * sc, y: rect.top + oy + sy * sc }, phase: r.input.phase });
  })()`);
  await sleep(350);
  await shot('battle_slots8.png');
  await click(out.slots8.slot8.x, out.slots8.slot8.y);
  await sleep(450);
  out.afterSlot8 = await ev(`(() => { ${H} const r = __comp('BattleRoot');
    return JSON.stringify({ selected: r.input.selected, phase: r.input.phase, message: r.input.message,
      aimLabel: r.labelAim && r.labelAim.node.active ? r.labelAim.string : null });
  })()`);
  await shot('battle_slots8_aim.png');

  log(JSON.stringify(out, null, 2));
  return out;
}
