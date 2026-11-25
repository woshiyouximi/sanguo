// camera 子智能体：贴完 camera() 后的复核探针（贴后实测）
//   $env:PORT=9346; $env:PROFILE='F:\sanguo\work\.edgeprof_camfix'; $env:MATCH='5299'
//   $env:PAGE_URL='http://127.0.0.1:5299/web/index.html'; $env:OUTDIR='F:\sanguo\work\flow_camera'
//   node work/cocos_verify/cdpweb.mjs launch
//   node work/cocos_verify/cdpweb.mjs run work/flow_camera/steps_cam2.mjs
//   node work/cocos_verify/cdpweb.mjs close
//
// 每个采样点同时给「新公式实测 camX」与「旧公式在同一帧会给出的 camX」，用来证明
// ① 开局镜头从 48.40 变成 56.00；② bMax 穿过 38.4 时的 3.4 行突跳已消失。
import * as F from '../../game/src/core/field.ts';

const OUT = process.env.OUTDIR || 'F:\\sanguo\\work\\flow_camera';
const TAG = process.env.TAG || 'camfix';   // 输出前缀：camfix=喊话开、notaunt=喊话关
const HALF_OLD = F.CAM_HALF_ROWS; // 6.300，旧公式的换镜判据

/** 透视投影（与 view/projection.ts 同式；field.rowScreenY 已含 +550，勿重复加） */
function sy(gx, camX) {
  const r = gx - camX;
  return 550 + (F.ROW_PX * F.SCALE_CENTER * Math.expm1(F.ROW_K * r)) / F.ROW_K;
}
const inBand = (y) => y >= F.FIELD_TOP && y <= F.FIELD_BOTTOM;

export default async function steps({ s, evaluate, sleep, shot, log }) {
  const ev = async (expr) => {
    const v = await evaluate(expr);
    if (v && v.__throw) throw new Error(v.__throw);
    return typeof v === 'string' ? JSON.parse(v) : v;
  };

  // 只取原始数据（camX / 单位表），屏幕换算在 node 侧用生产 field.ts 做，避免页面里的口径漂移
  const RAW = `(() => {
    const sg = window.__sanguo, st = sg && sg.state, w = st && st.world;
    const out = { mode: st ? st.mode : null, camX: st ? st.camX : null, tick: w ? w.tick : null };
    if (!w) { out.hasWorld = false; return JSON.stringify(out); }
    out.hasWorld = true;
    out.units = w.units.filter((u) => u.alive).map((u) => ({ s: u.side, x: u.x, y: u.y, g: !!u.isGeneral }));
    const cv = document.querySelector('canvas');
    const rc = cv && cv.getBoundingClientRect();
    out.canvas = cv ? { attrW: cv.width, attrH: cv.height, cssW: rc ? +rc.width.toFixed(1) : null, cssH: rc ? +rc.height.toFixed(1) : null } : null;
    return JSON.stringify(out);
  })()`;

  function analyse(raw) {
    const cam = raw.camX;
    const by = (k) => raw.units.filter((u) => u.s === k);
    const A = by('A'), B = by('B');
    const xs = (arr) => arr.map((u) => u.x);
    const aMin = Math.min(...xs(A)), aMax = Math.max(...xs(A));
    const bMin = Math.min(...xs(B)), bMax = Math.max(...xs(B));
    const genA = A.find((u) => u.g), genB = B.find((u) => u.g);
    // 旧公式在同一帧会给出什么（原样复刻改前代码）
    const mid = (aMin + bMax) / 2;
    const camOld = F.clampCameraX(aMin - bMax > 2 * HALF_OLD ? aMin - 2.6 : mid);
    // 屏内普查（用生产透视公式逐单位算）
    const visA = A.filter((u) => inBand(sy(u.x, cam))).length;
    const visB = B.filter((u) => inBand(sy(u.x, cam))).length;
    const visAPad = A.filter((u) => sy(u.x, cam) >= F.FIELD_TOP - 40 && sy(u.x, cam) <= F.FIELD_BOTTOM + 40).length;
    const visBPad = B.filter((u) => sy(u.x, cam) >= F.FIELD_TOP - 40 && sy(u.x, cam) <= F.FIELD_BOTTOM + 40).length;
    const rowHist = {};
    for (const u of A) if (inBand(sy(u.x, cam))) rowHist[u.x] = (rowHist[u.x] || 0) + 1;
    for (const u of B) if (inBand(sy(u.x, cam))) rowHist[u.x] = (rowHist[u.x] || 0) + 1;
    return {
      mode: raw.mode, tick: raw.tick, camX: +cam.toFixed(3), camX_old: +camOld.toFixed(3),
      winRows: [+(cam - F.ROWS_FAR).toFixed(2), +(cam + F.ROWS_NEAR).toFixed(2)],
      A: {
        n: A.length, x: [aMin, aMax],
        gen: genA ? { x: genA.x, y: genA.y, sy: +sy(genA.x, cam).toFixed(1), inBand: inBand(sy(genA.x, cam)), r: +(genA.x - cam).toFixed(2) } : null,
        visible: visA, visiblePad: visAPad,
      },
      B: {
        n: B.length, x: [bMin, bMax],
        gen: genB ? { x: genB.x, y: genB.y, sy: +sy(genB.x, cam).toFixed(1), inBand: inBand(sy(genB.x, cam)), r: +(genB.x - cam).toFixed(2) } : null,
        visible: visB, visiblePad: visBPad,
      },
      frontGap: aMin - bMax,
      rowHist,
    };
  }

  const snap = async (tag, name) => {
    const raw = await ev(RAW);
    const a = analyse(raw);
    a.tag = tag;
    if (name) a.shot = (await shot(name)).path;
    log(`${tag} mode=${a.mode} tick=${a.tick} camX=${a.camX}(旧式 ${a.camX_old}) win=${a.winRows[0]}..${a.winRows[1]} | A ${a.A.n}u x${a.A.x[0]}..${a.A.x[1]} 将(${a.A.gen ? `x${a.A.gen.x} sy${a.A.gen.sy} ${a.A.gen.inBand ? 'IN' : 'OUT'}` : '无'}) 见${a.A.visible} | B ${a.B.n}u x${a.B.x[0]}..${a.B.x[1]} 将(${a.B.gen ? `x${a.B.gen.x} sy${a.B.gen.sy} ${a.B.gen.inBand ? 'IN' : 'OUT'}` : '无'}) 见${a.B.visible} | 缝隙${a.frontGap}`);
    return { ...a, canvas: raw.canvas };
  };

  await s('Page.bringToFront', {});
  const URL0 = process.env.PAGE_URL || 'http://127.0.0.1:5299/web/index.html';
  await s('Page.navigate', { url: URL0 });
  await sleep(1500);
  for (let i = 0; i < 24; i++) {
    if ((await ev('!!(window.__sanguo && window.__sanguo.booted)')) === true) break;
    await sleep(500);
  }
  await sleep(700);

  const rows = [];
  rows.push(await snap('t0_paused', TAG + '_t0.png'));

  const clicked = await evaluate(`(() => { const b = document.querySelector('#start'); if (!b) return 'no-btn'; b.click(); return 'ok'; })()`);
  log('click #start -> ' + JSON.stringify(clicked));
  const t0 = Date.now();
  for (const [ms, name] of [[1000, TAG + '_t1000.png'], [1000, TAG + '_t2000.png']]) {
    await sleep(ms);
    rows.push(await snap('t+' + (Date.now() - t0) + 'ms', name));
  }

  // 突跳检查：camX 相邻采样差（旧公式在同一批采样上的差一并算，做对照）
  const dNew = [], dOld = [];
  for (let i = 1; i < rows.length; i++) {
    dNew.push(+(rows[i].camX - rows[i - 1].camX).toFixed(3));
    dOld.push(+(rows[i].camX_old - rows[i - 1].camX_old).toFixed(3));
  }

  const result = {
    page: URL0,
    canvas: rows[0].canvas,
    rows: rows.map(({ rowHist, canvas, ...r }) => r),
    delta: { camX_new: dNew, camX_old: dOld },
  };
  try {
    const fs = await import('node:fs');
    fs.writeFileSync(OUT + '\\probe_' + TAG + '.json', JSON.stringify({ ...result, rowHist: rows.map((r) => r.rowHist) }, null, 2), 'utf8');
    log('wrote ' + OUT + '\\probe_' + TAG + '.json');
  } catch (e) { log('write json failed: ' + e.message); }
  log('delta new=' + JSON.stringify(dNew) + ' old=' + JSON.stringify(dOld));
  return result;
}
