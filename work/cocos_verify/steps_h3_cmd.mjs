/**
 * h3 指令台 CDP 真点验收（Cocos 构建产物）。
 *
 * 拍四张：
 *   h01_cmd6.png      第一层六颗（含左列突擊/撤退、主将 HUD、主将行动条）
 *   h02_menu.png      第二层部队指令菜单展开
 *   h03_hold.png      下令「全軍待機」后位移停住（真点 + 真内核 arm yOrderAdjust 钩子）
 *   h04_skills8.png   8 格技能（把主将临时提到 太史慈 Lv40；Lv6 只有 1~2 格）
 *
 * 坐标换算（本机实测）：窗口 876×1368、dpr=1、canvas 876×1368；
 * `cc.view.getScaleX()=1.025487`、viewport=(53,0,769.1,1368)、可視 750×1334。
 * 设计坐标是**左上原点**的 BattleRoot 屏幕坐标，引擎那边是左下原点：
 *   cssX = viewport.x + dx * scale
 *   cssY = canvasVisibleHeight - (viewport.y + (1334 - dy) * scale)
 * 先用真点验证「点 S 会开第二层」，点不中会自动重试一次。
 */
export default async function ({ evaluate, sleep, log, shot, click, send, page }) {
  const ev = async (expr) => {
    const v = await evaluate(expr);
    if (v && v.__throw) throw new Error(v.__throw);
    return typeof v === 'string' ? JSON.parse(v) : v;
  };

  // ---- 0. 前台 + 帧数 ------------------------------------------------------
  // 被遮挡时 Chrome 会掐 rAF（帧数冻住 → loadScene 的下一帧永远不到），
  // `Page.bringToFront` 不一定管用，`Emulation.setFocusEmulationEnabled` 是硬保险。
  for (const [m, p] of [
    ['Page.bringToFront', {}],
    ['Emulation.setFocusEmulationEnabled', { enabled: true }],
  ]) {
    try {
      await send(m, p);
    } catch (err) {
      log(`${m} 失败（继续）：${err.message}`);
    }
  }
  const frameNow = async () =>
    ev(`(() => { const d = cc.director; const f = (d.getTotalFrames && d.getTotalFrames()) || -1;
      return JSON.stringify({ f, sc: d.getScene() ? d.getScene().name : null }); })()`);
  let f0 = await frameNow();
  for (let i = 0; i < 20; i++) {
    await sleep(250);
    const f1 = await frameNow();
    const moved = f1.f > f0.f + 3;
    f0 = f1;
    if (moved) break;
  }
  log('frames ' + JSON.stringify(f0));

  // 抓 console.error（真机验收要求：整轮跑下来引擎不能报错）
  await evaluate(`(() => { if (!window.__h3Hook) { window.__h3Hook = 1; window.__h3Errs = 0; window.__h3First = null;
      const old = console.error.bind(console);
      console.error = function (...a) { try { window.__h3Errs += 1; if (!window.__h3First) window.__h3First = String(a[0]).slice(0, 200); } catch (e) {} return old(...a); };
    } return 'hooked'; })()`);

  const H = `
    const cn = (c) => (c && (c.__classname__ || (c.constructor && c.constructor.name) || '')).replace(/^cc\\./, '');
    const walk = (n, out) => { out.push(n); for (const c of n.children) walk(c, out); return out; };
    const all = () => { const sc = cc.director.getScene(); return sc ? walk(sc, []) : []; };
    const comp = (name) => { for (const n of all()) { const c = (n.components || []).find((x) => cn(x) === name); if (c) return c; } return null; };
    const DESIGN_W = 750, DESIGN_H = 1334;
    const designToPage = (dx, dy) => {
      const cv = document.querySelector('canvas');
      const rect = cv.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const vp = cc.view.getViewportRect();
      const sx = cc.view.getScaleX(), sy = cc.view.getScaleY();
      const px = vp.x + dx * sx;
      const py = vp.y + (DESIGN_H - dy) * sy;
      return { x: rect.left + px / dpr, y: rect.top + rect.height - py / dpr };
    };
  `;

  const rootInfo = async () =>
    ev(`(() => { ${H} const r = comp('BattleRoot'); if (!r) return JSON.stringify({ err: 'no root' });
      const w = r.world; if (!w) return JSON.stringify({ err: 'no world' });
      const cmd = r.node.getChildByName('BattleCmdUi');
      const names = cmd ? cmd.children.filter((n) => n.active).map((n) => n.name) : [];
      const gauges = r.node.getChildByName('GeneralGauge');
      const a = w.units.filter((u) => u.side === 'A' && u.alive);
      const bx = (name) => { if (!cmd) return null; const n = cmd.getChildByName(name); return n ? n.active : false; };
      return JSON.stringify({
        tick: w.tick, menu: !!r.input.armyMenuNow, slots: (r.input.slots || []).length,
        mode: r.input.modeNow, msg: r.lastMessage || null,
        gen: w.sides.A.general.name + ' Lv' + w.sides.A.general.level,
        cmdCount: names.length,
        hasArmyPanel: bx('Cmd_army.panel'),
        hasSel: bx('Cmd_cmd6.1.sel'),
        gaugeActive: !!(gauges && gauges.active),
        hook: typeof w.armyOrderAdjust,
        ax: +(a.reduce((t, u) => t + u.x, 0) / Math.max(1, a.length)).toFixed(3),
        ay: +(a.reduce((t, u) => t + u.y, 0) / Math.max(1, a.length)).toFixed(3),
      }); })()`);

  const clickDesign = async (dx, dy, label) => {
    const p = await ev(`(() => { ${H} const q = designToPage(${dx}, ${dy});
      return JSON.stringify({ x: +q.x.toFixed(1), y: +q.y.toFixed(1) }); })()`);
    log(`click ${label} design(${dx},${dy}) -> page(${p.x},${p.y})`);
    await click(p.x, p.y);
    await sleep(450);
    return p;
  };

  /**
   * 指令台 Label 的对齐探针。
   *
   * 真机踩过的坑：`Label.overflow = NONE` 时 `horizontalAlign` 完全不生效（文字恒居中于节点），
   * 第二层行标签/`體/技` 会整体错位；所以这里直接量「Label 盒子的左/右边界在设计坐标里的落点」，
   * 而不是看 `horizontalAlign` 的值。
   * 注意 `cc.UITransform` / `cc.UIOpacity` 在 `cc` 全局命名空间里是 undefined（按需导出），
   * 探针必须用字符串类名取组件，否则每次 `getComponent(undefined)` 都会刷一条引擎 Error 3804。
   */
  const labelProbe = async () =>
    ev(`(() => { ${H} const r = comp('BattleRoot');
      const cmd = r.node ? r.node.getChildByName('BattleCmdUi') : null;
      if (!cmd) return JSON.stringify({ err: 'no cmdRoot' });
      const one = (id) => {
        const n = cmd.getChildByName('Cmd_' + id);
        if (!n) return { id, missing: true };
        const t = n.getComponent('cc.UITransform');
        const l = n.getComponent(cc.Label);
        const w = t ? t.width : 0;
        const cx = n.position.x + 375;
        return { id, w: +w.toFixed(1), cx: +cx.toFixed(1),
          left: +(cx - w / 2).toFixed(1), right: +(cx + w / 2).toFixed(1),
          ov: l ? l.overflow : null, al: l ? l.horizontalAlign : null,
          text: l ? String(l.string).slice(0, 10) : null };
      };
      return JSON.stringify({ shrink: cc.Label.Overflow.SHRINK,
        rows: ['army.0.label', 'army.0.no', 'army.0.right', 'gen.hp', 'gen.stats', 'cmd6.0.key'].map(one) }); })()`);

  // ---- 0b. 重新载入页面 → 保证是「刚开局」的战斗（上一次 run 可能留在残局）----
  await evaluate(`(() => { location.replace(location.pathname + '?h3=' + Date.now()); return 'go'; })()`);
  await sleep(5000);
  for (let i = 0; i < 20; i++) {
    try {
      const ok = await frameNow();
      if (ok.sc) break;
    } catch (err) {
      /* cc 还没起来 */
    }
    await sleep(500);
  }

  // ---- 1. 进战斗 ----------------------------------------------------------
  const findRoot = async () => {
    for (let i = 0; i < 40; i++) {
      const s = await rootInfo();
      if (!s.err) return s;
      if (i === 0) log('等 BattleRoot：' + JSON.stringify(s));
      await sleep(1000);
    }
    return null;
  };
  let s = await findRoot();
  if (!s) {
    log('场景里没有 BattleRoot，切到 Battle 场景');
    await evaluate(`(() => { cc.director.loadScene('Battle'); return 'go'; })()`);
    await sleep(4000);
    s = await findRoot();
  }
  if (!s) throw new Error('进不去 Battle 场景');
  log('boot ' + JSON.stringify(s));

  // 前进对照：没下令时士兵会动
  const adv0 = await rootInfo();
  await sleep(1200);
  const adv1 = await rootInfo();
  log('advance(control) ' + JSON.stringify({ ax0: adv0.ax, ax1: adv1.ax, dx: +(adv1.ax - adv0.ax).toFixed(3) }));
  await shot('h01_cmd6');

  // ---- 2. 第二层：真点第 2 颗（682,1072） ---------------------------------
  await clickDesign(682, 1072, 'S 部隊指令');
  let m = await rootInfo();
  if (!m.menu) {
    await clickDesign(682, 1072, 'S 部隊指令(retry)');
    m = await rootInfo();
  }
  log('menu ' + JSON.stringify({ menu: m.menu, hasArmyPanel: m.hasArmyPanel, hasSel: m.hasSel, msg: m.msg }));
  const lp = await labelProbe();
  log('labels ' + JSON.stringify(lp));
  await shot('h02_menu');

  // ---- 3. 真点第 5 行「全軍待機」 ----------------------------------------
  await clickDesign(626, 1119 + 4 * 36 + 16, '全軍待機');
  const ordered = await rootInfo();
  log('order ' + JSON.stringify({ msg: ordered.msg, menu: ordered.menu }));
  // 面板**保持展开**量 3 秒：这一张要同时证明「第 5 行显示已下令」和「士兵不再前进」
  const h0 = await rootInfo();
  await sleep(3000);
  const h1 = await rootInfo();
  log('hold ' + JSON.stringify({
    ax0: h0.ax, ax1: h1.ax, ay0: h0.ay, ay1: h1.ay,
    dx: +(h1.ax - h0.ax).toFixed(3), dy: +(h1.ay - h0.ay).toFixed(3),
    tick0: h0.tick, tick1: h1.tick, hook: h0.hook, menu: h1.menu,
  }));
  await shot('h03_hold');
  // 收起第二层再切 8 格
  await clickDesign(300, 420, '战场空白');

  // ---- 4. 8 格技能：把主将换成 太史慈 Lv40（Lv6 只有 1~2 格） --------------
  const before = await rootInfo();
  await ev(`(() => { ${H} const r = comp('BattleRoot'); const w = r.world;
    w.sides.A.general.name = '太史慈';
    w.sides.A.general.level = 40;
    const gu = (w.units || []).find((u) => u.side === 'A' && u.isGeneral);
    if (gu) { gu.name = '太史慈'; gu.level = 40; }
    r.input.bind(w);
    return JSON.stringify({ ok: 1 }); })()`);
  await sleep(900);
  const eight = await rootInfo();
  log('skills ' + JSON.stringify({ before: before.slots, after: eight.slots, gen: eight.gen, msg: eight.msg }));
  await shot('h04_skills8');
  const errs = await ev(`JSON.stringify({ n: window.__h3Errs || 0, first: window.__h3First || null })`);
  log('console.error ' + JSON.stringify(errs));
  return {
    h01: 'h01_cmd6.png', h02: 'h02_menu.png', h03: 'h03_hold.png', h04: 'h04_skills8.png',
    advanceControl: { ax0: adv0.ax, ax1: adv1.ax },
    menuOpen: m.menu, hasArmyPanel: m.hasArmyPanel,
    labels: lp.rows, shrinkFlag: lp.shrink,
    consoleErrors: errs,
    orderMsg: ordered.msg,
    holdDelta: { ax0: h0.ax, ax1: h1.ax, ay0: h0.ay, ay1: h1.ay, ticks: h1.tick - h0.tick },
    hook: h0.hook, slotsBefore: before.slots, slotsAfter: eight.slots,
  };
}
