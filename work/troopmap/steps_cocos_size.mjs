// 兵种精灵屏幕尺寸探针（Cocos build，wechat preview）
// 用法：TAG=before node cdp.mjs run steps_cocos_size.mjs
// 输出：把 BattleRoot.unitPool 里每个活着的 sprite 的 contentSize 汇总成 uniq 列表，
//       并把 A/B 侧兵种临时切成 朴刀/链锤/弩兵 各拍一张，用于量「改前 1:1:1 / 改后 94:70:74」。
export default async function ({ send, evaluate, sleep, shot, log, page }) {
  const TAG = process.env.TAG || 'shot';
  // 重新构建过 web-mobile 之后必须刷新页面，否则拿到的还是旧包
  if (process.env.RELOAD === '1') {
    await send('Page.reload', { ignoreCache: true });
    log('reload ' + (page && page.url));
    await sleep(3000);
  }
  const ev = async (x) => {
    const v = await evaluate(x);
    if (v && v.__throw) throw new Error(v.__throw);
    return typeof v === 'string' ? JSON.parse(v) : v;
  };

  await send('Page.bringToFront', {});

  // 1) 等引擎起来
  for (let i = 0; i < 40; i++) {
    const ok = await ev('JSON.stringify(!!(window.cc && cc.director && cc.director.getScene()))');
    if (ok) break;
    await sleep(500);
  }
  const boot = await ev('JSON.stringify({scene: (cc.director.getScene()||{}).name, frames: cc.director.getTotalFrames(), view: cc.view.getVisibleSize()})');
  log('boot ' + JSON.stringify(boot));

  // 2) 进 Battle
  if (boot.scene !== 'Battle') {
    await evaluate("cc.director.loadScene('Battle'); 'go'");
    for (let i = 0; i < 40; i++) {
      await sleep(700);
      const n = await ev('JSON.stringify((cc.director.getScene()||{}).name)');
      if (n === 'Battle') break;
    }
  }

  // 3) 找 BattleRoot 组件（private 只是编译期，运行时属性还在）
  const root = `(() => {
    const sc = cc.director.getScene();
    if (!sc) return null;
    let hit = null;
    const walk = (n) => {
      if (!n) return;
      for (const c of (n._components || [])) {
        if (c && c.world && c.unitPool) hit = c;
      }
      (n.children || []).forEach(walk);
    };
    walk(sc);
    return hit;
  })()`;

  const measureRaw = `(() => {
    const comp = ${root};
    if (!comp) return JSON.stringify({ err: 'BattleRoot not found' });
    const w = comp.world;
    const rows = [];
    for (const slot of comp.unitPool) {
      if (!slot || !slot.node || !slot.node.active) continue;
      rows.push({ h: Math.round(slot.box.contentSize.height * 10) / 10, w: Math.round(slot.box.contentSize.width * 10) / 10 });
    }
    const uniq = [...new Set(rows.map((r) => r.w + 'x' + r.h))];
    return JSON.stringify({
      tick: w.tick, mode: w.mode, alive: w.units.filter((u) => u.alive).length,
      aTroop: w.sides.A.troop, bTroop: w.sides.B.troop,
      drawn: rows.length, uniq: uniq.slice(0, 8),
      view: cc.view.getVisibleSize(), cvs: [cc.game.canvas.width, cc.game.canvas.height],
    });
  })()`;

  const setTroop = (t) => `(() => { const comp = ${root}; comp.world.sides.A.troop = ${t}; comp.world.sides.B.troop = ${t}; return JSON.stringify(true); })()`;

  const measureOnce = async () => {
    for (let i = 0; i < 6; i++) {
      const m = await ev(measureRaw);
      if (m && !m.err) return m;
      await sleep(600);
    }
    return await ev(measureRaw);
  };

  // 4) 先等战斗跑起来（单位都生成 + 精灵池铺开）
  for (let i = 0; i < 30; i++) {
    await sleep(700);
    const m = await measureOnce();
    if (m && m.drawn > 0) { log('ready ' + JSON.stringify(m)); break; }
  }

  const shots = [];
  const m0 = await measureOnce();
  log('default ' + JSON.stringify(m0));
  let r = await shot(`${TAG}.png`);
  shots.push({ tag: `${TAG}.png`, bytes: r.bytes });

  // 5) 指定兵种（默认 朴刀(0) / 链锤(4) / 弩兵(11)），各自拍一张并量高
  const TROOPS = (process.env.TROOPS || '0,4,11').split(',').map(Number).filter((n) => Number.isFinite(n));
  const rows = [];
  for (const t of TROOPS) {
    await evaluate(setTroop(t));
    await sleep(1400);
    const m = await measureOnce();
    log(`troop${t} ` + JSON.stringify(m));
    rows.push({ troop: t, uniq: m.uniq, drawn: m.drawn });
    r = await shot(`${TAG}_t${t}.png`);
    shots.push({ tag: `${TAG}_t${t}.png`, bytes: r.bytes });
  }

  log('SUMMARY ' + JSON.stringify({ tag: TAG, default: m0, perTroop: rows, shots }));
}
