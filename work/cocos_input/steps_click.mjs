// 真机点击：点技能格 2（半月斬）→ 瞄准 → 点战场 → 施放；附撤退一枪。
// 坐标换算：设计 750×1334，canvas 等比缩放居中（getScaleX，见 probe_page.mjs 的 env）。
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

  // 0. 进入/重置一局（Boot 直接打开 Battle 场景时没有 root）
  let has = await ev(`(() => { ${H} const r = __comp('BattleRoot');
    if (!r) { cc.director.loadScene('Battle'); return JSON.stringify({ loaded: true }); }
    return JSON.stringify({ loaded: false, world: !!r.world, over: r.world ? r.world.over : null });
  })()`);
  if (has.loaded) await sleep(10000);
  else if (has.over) {
    // 已结束：重开一局，别让结算相吃掉点击
    await ev(`(async () => { ${H} const r = __comp('BattleRoot'); await r.boot(); return JSON.stringify({ reboot: true }); })()`);
    await sleep(2500);
  }
  await sleep(800);

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
    return JSON.stringify({
      ok: true, sc, ox, oy, rect: { left: rect.left, top: rect.top, w: rect.width, h: rect.height },
      slot1: toPage(116 + 98 + 44, 1124 + 44),
      field: toPage(375, 550),
      retreat: toPage(528 + 102, 1220 + 42),
      qi0: g.qi, mp0: g.mp, mode: r.input.modeNow, phase: r.input.phase, over: r.world.over,
      slots: r.input.slots.map((x) => ({ name: x.name, qi: x.qi, mp: x.mp, kind: x.kind })),
    });
  })()`);
  out.map = map;
  if (!map.ok) return out;

  // 2. 真点技能格 1（半月斬）→ aiming
  await click(map.slot1.x, map.slot1.y);
  await sleep(500);
  out.afterSlotClick = await ev(`(() => { ${H} const r = __comp('BattleRoot');
    return JSON.stringify({ selected: r.input.selected, phase: r.input.phase, message: r.input.message,
      aimLabel: r.labelAim && r.labelAim.node.active ? r.labelAim.string : null });
  })()`);
  await shot('battle_aim.png');

  // 3. 鼠标移到战场中心（瞄准圈跟手），再点一次 → cast
  await s('Input.dispatchMouseEvent', { type: 'mouseMoved', x: map.field.x, y: map.field.y, button: 'none', buttons: 0, pointerType: 'mouse' });
  await sleep(400);
  out.afterMove = await ev(`(() => { ${H} const r = __comp('BattleRoot');
    return JSON.stringify({ aim: r.input.aim, label: r.labelAim && r.labelAim.node.active ? r.labelAim.string : null });
  })()`);
  await shot('battle_aim2.png');
  await click(map.field.x, map.field.y);
  await sleep(700);
  out.afterCast = await ev(`(() => { ${H} const r = __comp('BattleRoot');
    const g = r.world.sides.A.general;
    return JSON.stringify({ qi: g.qi, mp: g.mp, dQi: g.qi - ${map.qi0}, dMp: g.mp - ${map.mp0},
      selected: r.input.selected, message: r.input.message, over: r.world.over,
      fx: r.world.fx.length, floaters: r.floaters.length, toast: r.labelToast && r.labelToast.node.active ? r.labelToast.string : null });
  })()`);
  await sleep(300);
  await shot('battle_cast.png');

  // 4. 真点撤退 → requestRetreat + 标记
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
