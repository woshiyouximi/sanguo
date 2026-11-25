// 真机点击验收：重载页面 → 点技能格 2（半月斬）→ 瞄准 → 点战场 → 施放 → 点撤退。
// 坐标换算：设计 750×1334；getUILocation 是左下原点，页面点 = (ox + sx*sc, oy + sy*sc)，
// 其中 ox/oy 是 canvas 居中留边（876×1368 上 sc=1.025487, oy≈0）。
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
  `;
  const out = { steps: [] };

  // 0. 新开的页先停在 Boot 标题页；直接切 Battle 场景（构建已由 cdp launch 前重建）
  await sleep(9000);
  out.boot = await ev(`(() => { ${H}
    const sc = cc.director.getScene();
    const name = sc ? sc.name : null;
    const has = !!__comp('BattleRoot');
    if (!has) cc.director.loadScene('Battle');
    return JSON.stringify({ scene: name, hasRoot: has });
  })()`);
  if (!out.boot.hasRoot) await sleep(11000);
  out.loaded = await ev(`(() => { ${H} const r = __comp('BattleRoot');
    return JSON.stringify({ root: !!r, world: !!(r && r.world), phase: r && r.input ? r.input.phase : null,
      over: r && r.world ? r.world.over : null, scene: cc.director.getScene() ? cc.director.getScene().name : null });
  })()`);
  // 直接 loadScene('Battle') 带进来的 world 可能已经 over（没有 launch 参数）；先重开一局再点
  if (out.loaded.over) {
    await ev(`(async () => { ${H} const r = __comp('BattleRoot'); await r.boot(); return JSON.stringify({ reboot: true }); })()`);
    await sleep(3500);
    out.loaded = await ev(`(() => { ${H} const r = __comp('BattleRoot');
      return JSON.stringify({ root: !!r, world: !!(r && r.world), phase: r.input.phase, over: r.world.over });
    })()`);
  }

  // 1. 坐标换算 + 初始状态
  const map = await ev(`(() => { ${H}
    const r = __comp('BattleRoot');
    if (!r || !r.world) return JSON.stringify({ ok: false, why: 'no battle root/world' });
    const c = document.querySelector('canvas');
    const rect = c.getBoundingClientRect();
    const sc = cc.view.getScaleX();
    const ox = (rect.width - 750 * sc) / 2;
    const oy = (rect.height - 1334 * sc) / 2;
    const toPage = (sx, sy) => ({ x: rect.left + ox + sx * sc, y: rect.top + oy + sy * sc });
    const g = r.world.sides.A.general;
    // 敌军质心 → 屏幕（core project: sx = y*LANE_PX + LANE_PX/2, sy = 550 + (x-camX)*ROW_PX）
    const LANE = 750 / 14;
    const ROW = 96 * (750 / 1008);
    const bs = r.world.units.filter((u) => u.side === 'B' && u.alive);
    let bx = 0, by = 0;
    for (const u of bs) { bx += u.x; by += u.y; }
    bx = bs.length ? bx / bs.length : 30;
    by = bs.length ? by / bs.length : 6.5;
    const strikeSx = by * LANE + LANE / 2;
    const strikeSy = 550 + (bx - r.camX) * ROW;
    return JSON.stringify({
      ok: true, sc, ox, oy, rect: { left: rect.left, top: rect.top, w: rect.width, h: rect.height },
      slot1: toPage(116 + 98 + 44, 1124 + 44),
      field: toPage(375, 550),
      strike: toPage(375, 550),
      strikeCell: { bx, by, strikeSx, strikeSy, bAlive: bs.length },
      retreat: toPage(528 + 102, 1220 + 42),
      qi0: g.qi, mp0: g.mp, mode: r.input.modeNow, phase: r.input.phase, over: r.world.over,
      slots: r.input.slots.map((x) => ({ name: x.name, qi: x.qi, mp: x.mp, kind: x.kind, seq: x.seq })),
      buildTag: (document.querySelector('script[src*="index"]') || {}).src || null,
    });
  })()`);
  out.map = map;
  if (!map.ok) { log(JSON.stringify(out, null, 2)); return out; }

  // 2. 真点技能格 2（半月斬，需要瞄准）
  await click(map.slot1.x, map.slot1.y);
  await sleep(500);
  out.afterSlotClick = await ev(`(() => { ${H} const r = __comp('BattleRoot');
    return JSON.stringify({ selected: r.input.selected, phase: r.input.phase, message: r.input.message,
      aimLabel: r.labelAim && r.labelAim.node.active ? r.labelAim.string : null });
  })()`);
  await shot('battle_aim.png');

  // 3. 鼠标移到战场（瞄准圈跟手），点敌军前沿 → cast
  await s('Input.dispatchMouseEvent', { type: 'mouseMoved', x: map.strike.x, y: map.strike.y, button: 'none', buttons: 0, pointerType: 'mouse' });
  await sleep(400);
  out.afterMove = await ev(`(() => { ${H} const r = __comp('BattleRoot');
    return JSON.stringify({ aim: r.input.aim, label: r.labelAim && r.labelAim.node.active ? r.labelAim.string : null });
  })()`);
  await shot('battle_aim2.png');

  await click(map.strike.x, map.strike.y);
  await sleep(150);
  await shot('battle_cast.png');
  await sleep(700);
  out.afterCast = await ev(`(() => { ${H} const r = __comp('BattleRoot');
    const g = r.world.sides.A.general;
    return JSON.stringify({ qi: g.qi, mp: g.mp, dQi: g.qi - ${map.qi0}, dMp: g.mp - ${map.mp0},
      selected: r.input.selected, phase: r.input.phase, message: r.input.message, over: r.world.over,
      fx: r.world.fx.length, floaters: r.floaters.length, toast: r.labelToast && r.labelToast.node.active ? r.labelToast.string : null });
  })()`);
  await sleep(200);
  await shot('battle_cast_after.png');

  // 4. 真点撤退 → requestRetreat + 战场标记
  await click(map.retreat.x, map.retreat.y);
  await sleep(700);
  out.afterRetreat = await ev(`(() => { ${H} const r = __comp('BattleRoot');
    return JSON.stringify({ fled: r.world.fled.A, status: r.world.status.A, message: r.input.message,
      banner: r.input.banner, bannerLabel: r.labelBanner && r.labelBanner.node.active ? r.labelBanner.string : null });
  })()`);
  await shot('battle_retreat.png');

  log(JSON.stringify(out, null, 2));
  return out;
}
