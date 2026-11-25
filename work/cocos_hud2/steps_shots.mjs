// 194 验收（截图端）：三张 876×1368 的图
//   battle_hud.png       整页战斗 HUD（两块主将卡：兵/體 两条 8px 条 + 四裸数字 + 技小字 + 行细条）
//   cards_closeup.png    两块主将卡区域放大（视口放大到 1.6× 后 clip 876×1368，不是拉伸，像素是引擎真渲染的）
//   surrender_panel.png  招降面板（十欄两欄版式）
//
//   OUTDIR=F:\sanguo\work\cocos_hud2 node work\cocos_verify\cdpweb.mjs run work\cocos_hud2\steps_shots.mjs
//
// 纪律（踩过的坑，别删）：
//   1) 截图前必须 Page.bringToFront + 确认 cc.director.getTotalFrames() 在涨；后台窗口 rAF 会停，截出来是死的/白的。
//   2) 876×1368 由 Emulation.setDeviceMetricsOverride 钉死；clip 坐标一律从 canvas 的 getBoundingClientRect()
//      换算，不假设画布铺满视口。
//   3) 「放大」不靠 captureScreenshot 的 clip.scale（那是把位图拉伸，字会糊）；靠把视口放大到 1200×2134
//      （750×1334 设计区 × 1.6），引擎按 1.6 倍真渲染，再 clip 一块 876×1368 出来。
import fs from 'node:fs';
import path from 'node:path';
import { HELPER, PANEL_OPEN } from './steps_hud_dump.mjs';

const OUT = process.env.OUTDIR || 'F:\\sanguo\\work\\cocos_hud2';
const W = 876;
const H = 1368;
// 卡片特写用的大视口：750×1334 × 1.6 = 1200×2134（宽高等比，无黑边）
const BIG = { w: 1200, h: 2134, zoom: 1.6 };

export default async function steps({ s, evaluate, sleep, log, shot }) {
  const ev = async (expr, tag) => {
    try {
      const v = await evaluate(expr);
      if (v && v.__throw) {
        log('eval threw (' + (tag || '?') + ')', String(v.__throw).slice(0, 300));
        return null;
      }
      return v;
    } catch (e) {
      return null;
    }
  };
  const frames = () => ev('cc.director.getTotalFrames()', 'frames');
  const checkFront = async (tag) => {
    await s('Page.bringToFront');
    await s('Emulation.setFocusEmulationEnabled', { enabled: true });
    await sleep(500);
    const f0 = await frames();
    await sleep(1000);
    const f1 = await frames();
    const rising = typeof f0 === 'number' && typeof f1 === 'number' && f1 > f0 + 3;
    log('frames@' + tag, f0, '→', f1, rising ? 'OK（在涨）' : 'STOPPED');
    if (!rising) throw new Error('rAF 停了（' + tag + '）：' + f0 + ' → ' + f1 + '，截图会是死的（先 Page.bringToFront）');
    return { f0, f1 };
  };
  const waitCc = async (ms) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const ok = await ev('!!(typeof cc === "object" && cc.director && cc.director.getScene())', 'cc');
      if (ok === true) return true;
      await sleep(500);
    }
    return false;
  };
  const canvasBox = () =>
    ev("(function () { var c = document.querySelector('canvas'); if (!c) return null; var b = c.getBoundingClientRect(); return { left: b.left, top: b.top, w: Math.round(b.width), h: Math.round(b.height), dpr: window.devicePixelRatio || 1, pageW: innerWidth, pageH: innerHeight }; })()", 'canvas');
  const waitCanvas = async (w, h, ms) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const b = await canvasBox();
      if (b && Math.abs(b.w - w) <= 2 && Math.abs(b.h - h) <= 2) return b;
      await sleep(400);
    }
    return await canvasBox();
  };
  const clipShot = async (name, rect) => {
    const r = await s('Page.captureScreenshot', { format: 'png', clip: rect, captureBeyondViewport: false });
    const file = path.join(OUT, name.endsWith('.png') ? name : name + '.png');
    fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
    return { path: file, bytes: fs.statSync(file).size };
  };
  const pngSize = (file) => {
    const b = fs.readFileSync(file);
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  };
  const enterBattle = async () => {
    await ev(HELPER, 'helper');
    const scene = await ev('(cc.director.getScene() ? cc.director.getScene().name : null)', 'scene');
    if (scene !== 'Battle') {
      await ev("(function () { try { cc.director.loadScene('Battle'); return 'go'; } catch (e) { return 'err:' + e; } })()", 'load');
    }
    let ready = null;
    for (let i = 0; i < 40; i++) {
      await sleep(500);
      ready = await ev("(function () { var sc = cc.director.getScene(); if (!sc) return null; var r = window.__h2 ? window.__h2.find(sc, 'BattleRoot') : null; return r ? { scene: sc.name, hud: !!r.hud, world: !!r.world } : null; })()", 'probe');
      if (ready && ready.hud && ready.world) break;
    }
    if (!ready || !ready.hud) throw new Error('进不了战斗 / HUD 没起来：' + JSON.stringify(ready));
    await sleep(5000); // 让兵走开、条不再满格
    return ready;
  };

  const out = {};

  /* ---------- 1) 大视口（1200×2134 = 设计区 ×1.6）→ 卡片特写 ---------- */
  await s('Page.bringToFront');
  await s('Emulation.setDeviceMetricsOverride', { width: BIG.w, height: BIG.h, deviceScaleFactor: 1, mobile: false });
  await sleep(300);
  await s('Page.reload', { ignoreCache: false });
  await sleep(1500);
  out.ccUp = await waitCc(40000);
  log('cc up', out.ccUp);
  await sleep(1200);
  out.battle = await enterBattle();
  out.bigCanvas = await waitCanvas(BIG.w, BIG.h, 8000);
  log('big canvas', JSON.stringify(out.bigCanvas));
  out.front1 = await checkFront('closeup');
  // 卡片在设计区 x 96..644 / y 1005..1110；这里 clip 一块 876×1368 的窗口，横向正好罩住两块卡
  const cb = out.bigCanvas;
  const zx = cb.w / 750;
  const zy = cb.h / 1334;
  const cardsLeft = cb.left + 96 * zx;
  const cardsW = 548 * zx;
  out.cardsClip = {
    x: Math.round(cardsLeft + (cardsW - W) / 2),
    y: Math.round(cb.top + Math.max(0, 1334 * zy - H - 40)),
    width: W,
    height: H,
    scale: 1,
  };
  out.cardsCloseup = await clipShot('cards_closeup.png', out.cardsClip);
  out.cardsCloseupSize = pngSize(out.cardsCloseup.path);
  log('cards_closeup', JSON.stringify(out.cardsCloseup), JSON.stringify(out.cardsCloseupSize));

  /* ---------- 2) 回到 876×1368 → 整页 HUD ---------- */
  await s('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await sleep(400);
  out.canvas = await waitCanvas(W, H, 8000);
  log('canvas', JSON.stringify(out.canvas));
  out.front2 = await checkFront('battle_hud');
  out.battleHud = await shot('battle_hud');
  out.battleHudSize = pngSize(out.battleHud.path);
  log('battle_hud', JSON.stringify(out.battleHud), JSON.stringify(out.battleHudSize));

  /* ---------- 3) 招降面板（假 state 4 张卡：可降 / 需再战 / 拒降 / 君主）---------- */
  await ev(HELPER, 'helper2');
  out.panel = await ev(PANEL_OPEN, 'panel-open');
  log('panel open', JSON.stringify({ ok: out.panel && out.panel.ok, err: out.panel && out.panel.error, fields: out.panel && out.panel.debug && (out.panel.debug.fields || []).slice(0, 1) }));
  if (!out.panel || !out.panel.ok) throw new Error('招降面板打不开：' + JSON.stringify(out.panel));
  await sleep(600);
  out.front3 = await checkFront('surrender_panel');
  out.surrenderPanel = await shot('surrender_panel');
  out.surrenderPanelSize = pngSize(out.surrenderPanel.path);
  log('surrender_panel', JSON.stringify(out.surrenderPanel), JSON.stringify(out.surrenderPanelSize));

  /* ---------- 4) 收尾 ---------- */
  await ev("(function () { var sc = cc.director.getScene(); var n = (sc.getChildByName('Canvas') || sc).getChildByName('SurrenderPanel'); if (n) n.active = false; return n ? 'hid' : 'gone'; })()", 'panel-close');
  await s('Emulation.clearDeviceMetricsOverride');

  return {
    ok: true,
    files: {
      battle_hud: out.battleHud.path,
      cards_closeup: out.cardsCloseup.path,
      surrender_panel: out.surrenderPanel.path,
    },
    sizes: {
      battle_hud: out.battleHudSize,
      cards_closeup: out.cardsCloseupSize,
      surrender_panel: out.surrenderPanelSize,
    },
    bigCanvas: out.bigCanvas,
    canvas: out.canvas,
    cardsClip: out.cardsClip,
    frames: { closeup: out.front1, hud: out.front2, panel: out.front3 },
  };
}
