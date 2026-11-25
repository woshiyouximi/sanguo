// 184 验收：Cocos 战斗 HUD 对齐原作（顶栏中文时间牌 / 底部两块主将卡 / 四裸数字 / 行细条）
//
//   OUTDIR=F:\sanguo\work\cocos_hud node cdp.mjs run steps_hud184.mjs
//
// 纪律（project/169 的坑）：截屏前必须 Page.bringToFront，并确认 getTotalFrames() 在涨；
// 页面不在前台时 rAF 停、getScene() 为 null，会误判成「启动失败」。
export default async function ({ s, evaluate, sleep, shot, log }) {
  const ev = async (expr) => {
    const v = await evaluate(expr);
    if (v && v.__throw) throw new Error('eval threw: ' + v.__throw);
    return typeof v === 'string' ? JSON.parse(v) : v;
  };
  const out = {};

  // ---- 0) 前台 + 帧数在涨（否则后头全是假阴性）----
  await s('Page.bringToFront');
  await sleep(600);
  const f0 = await ev('JSON.stringify({ scene: cc.director.getScene() ? cc.director.getScene().name : null, frames: cc.director.getTotalFrames() })');
  await sleep(1200);
  const f1 = await ev('JSON.stringify({ scene: cc.director.getScene() ? cc.director.getScene().name : null, frames: cc.director.getTotalFrames() })');
  out.front = { f0, f1, rising: f1.frames > f0.frames };
  if (!out.front.rising) throw new Error('rAF 停了：frames ' + f0.frames + ' → ' + f1.frames);

  // ---- 1) 进战斗：直开 Battle 场景 ----
  out.load = await ev(`(() => { try { cc.director.loadScene('Battle'); return JSON.stringify({ ok: true }); } catch (e) { return JSON.stringify({ err: String(e) }); } })()`);
  await sleep(2600);
  await s('Page.bringToFront');

  // ---- 2) 画布矩形（设计 750×1334 落到 CSS 像素，供裁剪用）----
  out.canvas = await ev(`(() => {
    const c = document.querySelector('canvas');
    if (!c) return JSON.stringify({ err: 'no canvas' });
    const b = c.getBoundingClientRect();
    return JSON.stringify({ left: b.left, top: b.top, w: b.width, h: b.height, dpr: window.devicePixelRatio || 1 });
  })()`);

  // 设计坐标 → 页面 CSS 坐标
  const d2c = (x, y, w, h) => {
    const c = out.canvas;
    const sx = c.w / 750;
    const sy = c.h / 1334;
    return { x: c.left + x * sx, y: c.top + y * sy, width: w * sx, height: h * sy, scale: 1 };
  };
  const clipShot = async (name, rect) => {
    const r = await s('Page.captureScreenshot', { format: 'png', clip: rect });
    const fs = await import('node:fs');
    const path = await import('node:path');
    const file = path.join(process.env.OUTDIR || 'F:\\sanguo\\work\\cocos_verify', name);
    fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
    return { path: file, bytes: fs.statSync(file).size };
  };

  // ---- 3) 场景快照：时间牌 / 主将卡 / 指令台重复文本 ----
  const snap = async (tag) => ev(`(() => {
    const sc = cc.director.getScene();
    if (!sc) return JSON.stringify({ scene: null });
    const labels = [];
    const walk = (n, depth) => {
      const lab = (n._components || []).find((c) => c && typeof c.string === 'string' && typeof c.fontSize === 'number');
      if (lab && lab.string) {
        const wp = n.getWorldPosition();
        // 本工程的 Canvas 世界原点在**设计区左下角**（y 向上），不是中心：
        // 实测 ClockText 设计中心 (375, 34) → 世界 (375, 1300)，即 sy = 1334 − wp.y。
        labels.push({ name: n.name, s: lab.string, sx: Math.round(wp.x), sy: Math.round(1334 - wp.y), size: lab.fontSize, active: n.activeInHierarchy });
      }
      n.children.forEach((c) => walk(c, depth + 1));
    };
    walk(sc, 0);
    const clock = labels.filter((l) => l.name === 'ClockText');
    const consoleLabels = labels.filter((l) => l.sy >= 1000 && l.sy <= 1135 && l.active);
    return JSON.stringify({
      frames: cc.director.getTotalFrames(),
      clock: clock.map((l) => ({ s: l.s, sx: l.sx, sy: l.sy, size: l.size, active: l.active })),
      console: consoleLabels.map((l) => ({ name: l.name, s: l.s, sx: l.sx, sy: l.sy, size: l.size })),
      all: labels.filter((l) => l.active).length
    });
  })()`);

  out.t0 = await snap('t0');
  // 早期牌子（应为「九十九」）
  out.clockEarly = await clipShot('04_clock_t0.png', d2c(280, 0, 190, 70));

  // 01 全景（进战斗 3 秒，单位已铺开）
  out.shot01 = await shot('01_battle.png');

  // ---- 4) 等它走一段，证明牌子真的在掉字（60 tick = 1 字 = 2 秒）----
  await sleep(24000);
  await s('Page.bringToFront');
  out.t1 = await snap('t1');
  out.shot02 = await clipShot('02_clock.png', d2c(280, 0, 190, 70));
  out.shot03 = await clipShot('03_cards.png', d2c(0, 1000, 750, 140));
  out.shot01b = await shot('01_battle.png');

  log('clock', JSON.stringify(out.t0.clock), '→', JSON.stringify(out.t1.clock));
  log('console@t1', JSON.stringify(out.t1.console));
  return out;
}
