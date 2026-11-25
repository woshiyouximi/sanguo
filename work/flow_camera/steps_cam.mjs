// camera 子智能体探针：抓开局真实几何 / 镜头（暂停态 + 点 start 后 0.5/1/2 s）
//   PORT=9344 PROFILE=F:\sanguo\work\.edgeprof_cam PAGE_URL=http://127.0.0.1:5299/web/index.html \
//     MATCH=5299 OUTDIR=F:\sanguo\work\flow_camera \
//     node work/cocos_verify/cdpweb.mjs launch
//   （同上）node work/cocos_verify/cdpweb.mjs run work/flow_camera/steps_cam.mjs
//   （同上）node work/cocos_verify/cdpweb.mjs close
//
// 说明：单位字段是 {side, x, y, prevX, prevY, cd, kind, alive}，主将多 isGeneral。
//       x = 纵深格 0..70（我方在高位），y = 车道 0..13。world 在 window.__sanguo.state.world。
import * as F from '../../game/src/core/field.ts';

const OUT = process.env.OUTDIR || 'F:\\sanguo\\work\\flow_camera';

/** 该世界行落在屏幕哪（用生产同一份 field.ts 公式，不在探针里重写一遍） */
function screenOf(gx, camX) {
  const r = gx - camX;
  // 与 view/projection.ts 同式：sy = 550 + ROW_PX·S0·(e^{k r} − 1)/k
  const sy = 550 + (F.ROW_PX * F.SCALE_CENTER * Math.expm1(F.ROW_K * r)) / F.ROW_K;
  const scale = F.SCALE_CENTER * Math.exp(F.ROW_K * r);
  const x0 = 100;
  const x1 = 1000; // FIELD_TOP / FIELD_BOTTOM
  return {
    r: +r.toFixed(2),
    sy: +sy.toFixed(1),
    scale: +scale.toFixed(3),
    // 整只单位（贴图底边 = sy + 26·scale，高 ~106·scale）是否在带内
    inBand: sy >= x0 && sy <= x1,
    clippedBy: sy < x0 ? 'far(上)' : sy > x1 ? 'near(下)' : null,
    px: +((sy - x0) / (x1 - x0) * 100).toFixed(1), // 带内百分位
  };
}

export default async function steps({ s, evaluate, sleep, shot, log }) {
  // 只对返回 JSON 字符串的表达式用 ev()；返回裸字符串（如 'ok'）的用 evaluate 原样取
  const ev = async (expr) => {
    const v = await evaluate(expr);
    if (v && v.__throw) throw new Error(v.__throw);
    return typeof v === 'string' ? JSON.parse(v) : v;
  };

  const SNAP = `(() => {
    const sg = window.__sanguo;
    const st = sg && sg.state;
    const w = st && st.world;
    const cv = document.querySelector('canvas');
    const rc = cv ? cv.getBoundingClientRect() : null;
    const out = {
      mode: st ? st.mode : null,
      camX: st ? +st.camX.toFixed(3) : null,
      tick: w ? w.tick : null,
      canvasAttr: cv ? { w: cv.width, h: cv.height } : null,
      canvasCss: rc ? { x: +rc.x.toFixed(1), y: +rc.y.toFixed(1), w: +rc.width.toFixed(1), h: +rc.height.toFixed(1) } : null,
      dpr: window.devicePixelRatio,
      win: { w: window.innerWidth, h: window.innerHeight },
      startBtn: (() => { const b = document.querySelector('#start'); if (!b) return null; const r = b.getBoundingClientRect(); return { disabled: b.disabled, x: +r.x.toFixed(0), y: +r.y.toFixed(0), w: +r.width.toFixed(0), h: +r.height.toFixed(0) }; })(),
    };
    if (!w) { out.hasWorld = false; return JSON.stringify(out); }
    out.hasWorld = true;
    const side = (k) => {
      const us = w.units.filter((u) => u.side === k && u.alive);
      const xs = us.map((u) => u.x), ys = us.map((u) => u.y);
      const g = us.find((u) => u.isGeneral) || null;
      return {
        n: us.length,
        xMin: Math.min(...xs), xMax: Math.max(...xs),
        yMin: Math.min(...ys), yMax: Math.max(...ys),
        aliveStart: w.sides[k].start,
        general: g ? { x: g.x, y: g.y, hp: w.sides[k].general.hp, maxHp: w.sides[k].general.maxHp } : null,
      };
    };
    out.A = side('A');
    out.B = side('B');
    return JSON.stringify(out);
  })()`;

  const report = async (tag, shotName) => {
    const snap = await ev(SNAP);
    const cam = snap.camX;
    const row = {
      tag,
      mode: snap.mode,
      tick: snap.tick,
      camX: cam,
      windowRows: [+(cam - F.ROWS_FAR).toFixed(2), +(cam + F.ROWS_NEAR).toFixed(2)],
      A: { n: snap.A.n, x: [snap.A.xMin, snap.A.xMax], general: snap.A.general && screenOf(snap.A.general.x, cam) },
      B: { n: snap.B.n, x: [snap.B.xMin, snap.B.xMax], general: snap.B.general && screenOf(snap.B.general.x, cam) },
      raw: snap,
    };
    if (shotName) row.shot = (await shot(shotName)).path;
    log(tag + ' ' + JSON.stringify({
      mode: snap.mode, tick: snap.tick, camX: cam,
      win: snap.windowRows,
      A: `${snap.A.n}u x${snap.A.xMin}..${snap.A.xMax} gen x${snap.A.general && snap.A.general.x} sy${row.A.general && row.A.general.sy} ${row.A.general && (row.A.general.inBand ? 'IN' : 'OUT')}`,
      B: `${snap.B.n}u x${snap.B.xMin}..${snap.B.xMax} gen x${snap.B.general && snap.B.general.x} sy${row.B.general && row.B.general.sy} ${row.B.general && (row.B.general.inBand ? 'IN' : 'OUT')}`,
    }));
    return row;
  };

  await s('Page.bringToFront', {});
  // 上一轮可能已点过 start：重载回暂停态，保证 t0 是「开局」
  const URL0 = process.env.PAGE_URL || 'http://127.0.0.1:5299/web/index.html';
  await s('Page.navigate', { url: URL0 });
  await sleep(1200);
  // 等 booted（页面自己置位；最多 12 s）
  for (let i = 0; i < 24; i++) {
    const ok = await ev('!!(window.__sanguo && window.__sanguo.booted)');
    if (ok === true) break;
    await sleep(500);
  }
  await sleep(600);

  const rows = [];
  rows.push(await report('t0_paused', 'cam_t0_paused.png'));   // 暂停态（mode=ready，镜头未跟随）

  // 点 #start 进战斗
  const clicked = await evaluate(`(() => { const b = document.querySelector('#start'); if (!b) return 'no-btn'; b.click(); return 'ok'; })()`);
  log('click #start -> ' + JSON.stringify(clicked));
  const t0 = Date.now();
  const waits = [[500, 'cam_t0500.png'], [500, 'cam_t1000.png'], [1000, 'cam_t2000.png']];
  for (const [ms, name] of waits) {
    await sleep(ms);
    rows.push(await report('t+' + (Date.now() - t0) + 'ms', name));
  }

  // 附加：把「可见窗口内到底有谁」列出来（暂停态）
  const census = await ev(`(() => {
    const st = window.__sanguo.state, w = st.world;
    const cam = st.camX;
    const lo = cam - 7.434, hi = cam + 5.894;
    const inWin = w.units.filter((u) => u.x >= lo && u.x <= hi);
    const by = {};
    for (const u of inWin) by[u.x] = (by[u.x] || 0) + 1;
    return JSON.stringify({ cam, lo: +lo.toFixed(2), hi: +hi.toFixed(2), n: inWin.length, rows: by });
  })()`);
  log('census ' + JSON.stringify(census));

  const result = { out: OUT, canvas: rows[0].raw.canvasCss, canvasAttr: rows[0].raw.canvasAttr, dpr: rows[0].raw.dpr, win: rows[0].raw.win, census, rows: rows.map((r) => ({ tag: r.tag, mode: r.mode, tick: r.tick, camX: r.camX, win: r.windowRows, A: r.A, B: r.B, A_gen: r.A.general, B_gen: r.B.general })) };
  try {
    const fs = await import('node:fs');
    fs.writeFileSync(OUT + '\\probe_cam.json', JSON.stringify(result, null, 2), 'utf8');
    log('wrote ' + OUT + '\\probe_cam.json');
  } catch (e) { log('write json failed: ' + e.message); }
  return result;
}
