// 開場叫陣 CDP 驗收：從 campaign 參數進戰鬥頁 → 不顯示預覽卡 → 敵將叫陣 → 我將接話 →
// 鏡頭回我方主將並恢復 step。數值全部從 window.__sanguo.state 讀（不靠猜畫面）。
export default async function ({ evaluate, sleep, log, shot, s }) {
  // 有頭窗口在終端後面時，Edge 會把 rAF 節流到 ~1fps，叫陣計時就永遠走不完。
  // 取證期間強制前台 + 焦點模擬，跑完再還原（不影響頁面邏輯）。
  try { await s('Page.bringToFront'); } catch { /* 舊版 CDP 沒有也不擋 */ }
  try { await s('Emulation.setFocusEmulationEnabled', { enabled: true }); } catch { /* 同上 */ }

  const guard = (p, ms, tag) =>
    Promise.race([p, sleep(ms).then(() => ({ __timeout: tag }))]);
  const evOnce = async (expr) => {
    const v = await guard(evaluate(expr), 5000, 'evaluate');
    if (v && v.__timeout) return { __timeout: true };
    if (v && v.__throw) return { __throw: true };
    return typeof v === 'string' ? JSON.parse(v) : v;
  };
  const ev = async (expr) => {
    for (let i = 0; i < 6; i += 1) {
      const v = await evOnce(expr);
      if (v && (v.__throw || v.__timeout)) { await sleep(150); continue; }
      return v;
    }
    return null;
  };
  const takeShot = async (name) => {
    const r = await guard(shot(name), 8000, 'shot');
    log('shot ' + name + ' ' + JSON.stringify(r && r.__timeout ? r : { bytes: r && r.bytes }));
    return r;
  };
  const snap = `(() => {
    const s = window.__sanguo && window.__sanguo.state;
    if (!s) return JSON.stringify({ boot: false });
    const w = s.world;
    const gx = (side) => {
      const u = w && w.units.find((it) => it.isGeneral && it.side === side);
      return u ? +u.x.toFixed(2) : null;
    };
    const t = s.taunt;
    const line = t && t.seq[t.i];
    const hdr = document.querySelector('header');
    return JSON.stringify({
      boot: true, mode: s.mode, tick: w ? w.tick : null, camX: +s.camX.toFixed(2),
      ax: gx('A'), bx: gx('B'), alive: w ? w.units.filter((u) => u.alive).length : null,
      taunt: !!t, i: t ? t.i : null, side: line ? line.side : null, msgId: line ? line.msgId : null,
      text: line ? line.text : null, hold: line ? +(line.holdTicks / 60).toFixed(2) : null,
      ticks: t ? +t.ticks.toFixed(2) : null,
      headerHidden: !hdr || hdr.offsetParent === null, solo: document.body.classList.contains('solo'),
    });
  })()`;
  const nav = (qs) =>
    evaluate(`location.href='http://127.0.0.1:5299/web/index.html?${qs}&cb='+Date.now(); 'nav'`);

  // ---------- 1) 從大地圖出征進來：直接叫陣，沒有預覽卡 ----------
  await nav('from=campaign&seed=7');
  let s0 = null;
  for (let i = 0; i < 150; i += 1) {
    s0 = await ev(snap);
    if (s0 && s0.boot && s0.taunt) break;
    await sleep(100);
  }
  log('taunt1.begin ' + JSON.stringify(s0));
  await sleep(300);                      // 讓停留計時走一點，鏡頭已硬切到 B
  const s1 = await ev(snap);
  log('taunt1.read  ' + JSON.stringify(s1));
  await takeShot('t01_taunt_enemy');

  // ---------- 2) 第二段：我將接話，鏡頭切到 A ----------
  let s2 = s1;
  for (let i = 0; i < 100; i += 1) {
    s2 = await ev(snap);
    if (s2 && s2.taunt && s2.i === 1) break;
    await sleep(80);
  }
  await sleep(300);
  const s3 = await ev(snap);
  log('taunt2.read  ' + JSON.stringify(s3));
  await takeShot('t02_taunt_own');

  // ---------- 3) 播完：鏡頭回 A 主將，step 恢復 ----------
  let s4 = s3;
  for (let i = 0; i < 120; i += 1) {
    s4 = await ev(snap);
    if (s4 && !s4.taunt && s4.mode === 'fighting') break;
    await sleep(100);
  }
  const tick0 = s4 && s4.tick;
  await sleep(700);
  const s5 = await ev(snap);
  log('after.resume ' + JSON.stringify({ s4, s5, tickDelta: s5 && s5.tick !== null && tick0 !== null ? s5.tick - tick0 : null }));
  await takeShot('t03_after_resume');

  // ---------- 4) ?taunt=0：回歸對拍，直接開打 ----------
  await nav('from=campaign&seed=7&taunt=0');
  let off = null;
  for (let i = 0; i < 150; i += 1) {
    off = await ev(snap);
    if (off && off.boot && off.mode === 'fighting') break;
    await sleep(100);
  }
  const offTaunt = await ev(`(() => JSON.stringify({ taunt: !!window.__sanguo.state.taunt, mode: window.__sanguo.state.mode }))()`);
  log('off.read ' + JSON.stringify({ off, offTaunt }));
  await sleep(500);
  const off2 = await ev(snap);
  log('off.tick ' + JSON.stringify({ tick: off2 && off2.tick, camX: off2 && off2.camX, ax: off2 && off2.ax }));
  await takeShot('t04_taunt_off');

  return { begin: s0, enemy: s1, own: s3, after: s4, after700: s5, off, offTaunt };
}
