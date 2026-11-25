// 文案同步的视觉证据：存檔槽（記錄01..10）+ 月推进「內政時間到了....」。
import fs from 'node:fs';
import path from 'node:path';

const URL = 'http://127.0.0.1:5173/cocos-build/web-mobile/index.html';

export default async function ({ send, shot, evaluate, sleep, log, OUTDIR }) {
  const ev = async (expr) => {
    const v = await evaluate(expr);
    if (v && v.__throw) throw new Error(v.__throw);
    return v;
  };
  const json = async (expr) => {
    const v = await ev(expr);
    try {
      return JSON.parse(v);
    } catch {
      return v;
    }
  };
  const report = { checks: [], shots: [], frames: [] };
  const check = (name, ok, detail) => {
    report.checks.push({ name, ok: !!ok, detail: detail ?? null });
    log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail === undefined ? '' : '  ' + JSON.stringify(detail)}`);
  };
  const findCamp = `(() => { const s = cc.director.getScene(); let out = null; const walk = (n) => { for (const c of n.components || []) { if (c && cc.js.getClassName(c) === 'CampaignRoot') out = c; } for (const ch of n.children) walk(ch); }; walk(s); window.__camp = out; return !!out; })()`;

  await send('Emulation.setDeviceMetricsOverride', {
    width: 876,
    height: 1368,
    deviceScaleFactor: 1,
    mobile: true,
    screenWidth: 876,
    screenHeight: 1368,
  });
  await send('Page.bringToFront');
  await send('Page.navigate', { url: URL + '?t=' + Date.now() });
  await sleep(1500);
  for (let i = 0; i < 60; i += 1) {
    const v = await ev(`(() => { try { return typeof cc === 'object' && !!cc.director && !!cc.director.getScene() && cc.director.getScene().name; } catch (e) { return ''; } })()`);
    if (v) break;
    await sleep(500);
  }
  if (!(await ev(findCamp))) {
    await ev(`(() => { const s = cc.director.getScene(); let b = null; const walk = (n) => { for (const c of n.components || []) { if (c && cc.js.getClassName(c) === 'BootRoot') b = c; } for (const ch of n.children) walk(ch); }; walk(s);
      if (!b) return 0; try { localStorage.setItem('sanguo_run_fresh', '1'); } catch (e) {} b.enterCampaign(); return 1; })()`);
    for (let i = 0; i < 60; i += 1) {
      await sleep(500);
      if (await ev(findCamp)) break;
    }
  }
  for (let i = 0; i < 60; i += 1) {
    const ok = await ev(`(() => !!(window.__camp && window.__camp.save && window.__camp.cities && window.__camp.cities.length))()`);
    if (ok) break;
    await sleep(500);
  }
  await sleep(1200);

  const f1 = await ev('cc.director.getTotalFrames()');
  await sleep(900);
  const f2 = await ev('cc.director.getTotalFrames()');
  report.frames.push({ f1, f2 });
  check('getTotalFrames 在涨（截圖前畫面在跑）', f2 > f1, { f1, f2 });

  // 1) 推進一月 → 「內政時間到了....」
  const adv = await json(`(() => { const c = window.__camp; c.hintText = ''; c.doAction('advance');
    return JSON.stringify({ hint: c.hintText, month: c.save.month, labelMonth: c.labelMonth ? c.labelMonth.string : null, log: (c.battleLog || []).slice(-3).map((x) => x.text) }); })()`);
  log('advance ' + JSON.stringify(adv));
  check('月推进提示以「內政時間到了....」開頭（web saves.js:1420）', String(adv.hint || '').indexOf('內政時間到了....') === 0, adv.hint);
  check('推進一月後紀元仍為「西元 N年 M月」', /^西元 \d+年 \d+月$/.test(String(adv.labelMonth)), adv.labelMonth);
  await sleep(600);
  report.shots.push(await shot('06_advance_notice.png'));

  // 2) 存檔槽面板 → 記錄01..10 四段行
  const slots = await json(`(() => { const c = window.__camp; c.openSaveSlots();
    const s = cc.director.getScene(); let p = null; const walk = (n) => { for (const comp of n.components || []) { if (comp && cc.js.getClassName(comp) === 'SaveSlotsPanel') p = comp; } for (const ch of n.children) walk(ch); }; walk(s);
    if (!p) return JSON.stringify({ err: 'no panel' });
    const d = p.debug ? p.debug() : null;
    return JSON.stringify({ debug: d }); })()`);
  log('slots ' + JSON.stringify(slots).slice(0, 900));
  const rows = (slots && slots.debug && slots.debug.rows) || [];
  const line1 = String(rows[0] || '');
  check('存檔槽面板開著（SaveSlotsPanel.debug().open）', !!(slots.debug && slots.debug.open), slots.debug && slots.debug.open);
  check('存檔槽第一行以「記錄01」開頭（web saves.js:1382 slotTitle）', /記錄01/.test(line1), line1.split('\n')[0]);

  // 空槽沒有 4 段行 → 先存一檔再驗（第 2 行＝君主 ｜ 城數NN ｜ 武將NNN ｜ 時間NNN年）
  const filled = await json(`(() => { const s = cc.director.getScene(); let p = null; const walk = (n) => { for (const comp of n.components || []) { if (comp && cc.js.getClassName(comp) === 'SaveSlotsPanel') p = comp; } for (const ch of n.children) walk(ch); }; walk(s);
    if (!p) return JSON.stringify({ err: 'no panel' });
    p.act({ act: 'save', slot: 1 });
    const lines = (p.rowLabels && p.rowLabels[0] ? p.rowLabels[0] : []).map((l) => l.string);
    return JSON.stringify({ lines, flash: p.flashText, sub: p.debug().sub }); })()`);
  log('filled ' + JSON.stringify(filled));
  const parts = String(filled.lines && filled.lines[1] ? filled.lines[1] : '');
  check('存檔槽行是 4 段（君主 ｜ 城數NN ｜ 武將NNN ｜ 時間NNN年）', /城數\d{2}/.test(parts) && /武將\d{3}/.test(parts) && /時間\d+年/.test(parts), parts);
  await sleep(600);
  report.shots.push(await shot('07_save_slots.png'));

  fs.writeFileSync(path.join(OUTDIR, 'cdp_report_text.json'), JSON.stringify(report, null, 1), 'utf8');
  const pass = report.checks.filter((c) => c.ok).length;
  log(`checks ${pass}/${report.checks.length}`);
  return { pass, total: report.checks.length, rows: slots.rows, failed: report.checks.filter((c) => !c.ok).map((c) => c.name) };
}
