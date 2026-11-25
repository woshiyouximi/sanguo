// R196 招降面板「士氣/疲勞/勝敗場」真值截图步骤（web 页，非 cocos）。
// 用法（ENV）：
//   PAGE_URL=http://127.0.0.1:5173/web/campaign.html?dev=1&surscen=1&surstart=...  （launch 用）
//   MATCH=campaign.html PORT=9333 PROFILE=F:\sanguo\work\.edgeprof_sur196 OUTDIR=F:\sanguo\work\sur_fields
//   node F:\sanguo\work\cocos_verify\cdpweb.mjs launch
//   $env:NAV='<同一个 URL>'; $env:SHOT='before.png'
//   node F:\sanguo\work\cocos_verify\cdpweb.mjs run F:\sanguo\work\sur_fields\steps_shot_sur.mjs
//
// 验收要求「截前 Page.bringToFront + 确认 getTotalFrames() 在涨」：web 页没有 cc.director.getTotalFrames()，
// 等价物是 requestAnimationFrame 计数——本步骤先测两次 rAF 计数（必须是涨的）再截图。
export default async ({ s, sleep, shot, evaluate, log }) => {
  await s('Page.bringToFront');
  await s('Page.enable');
  await s('Emulation.setDeviceMetricsOverride', {
    width: 876, height: 1368, deviceScaleFactor: 1, mobile: false,
  });
  if (process.env.NAV) {
    await s('Page.navigate', { url: process.env.NAV });
    await sleep(1800);
  }
  // 等 ?sur= 探针把 save.captured 种进去、openSurrenderSheet 铺完卡片
  for (let i = 0; i < 40; i++) {
    const n = await evaluate('document.querySelectorAll("#surCards .sgen").length');
    if (n > 0) break;
    await sleep(250);
  }
  await sleep(600);

  // 帧在涨（web 版 getTotalFrames）：两段 rAF 计数必须递增
  const frames = await evaluate(`new Promise((resolve) => {
    let n = 0;
    const tick = () => { n += 1; if (n < 6) requestAnimationFrame(tick); else resolve(n); };
    requestAnimationFrame(tick);
  })`);
  const frames2 = await evaluate(`new Promise((resolve) => {
    let n = 0;
    const tick = () => { n += 1; if (n < 6) requestAnimationFrame(tick); else resolve(n); };
    requestAnimationFrame(tick);
  })`);
  const t1 = await evaluate('performance.now()');
  await sleep(250);
  const t2 = await evaluate('performance.now()');

  const info = await evaluate(`(() => {
    const sheet = document.getElementById('surrenderSheet');
    const cards = [...document.querySelectorAll('#surCards .sgen')];
    const fields = (c) => [...c.querySelectorAll('.fld .fv')].map((fv) => ({
      k: (fv.querySelector('.k') || {}).textContent || '',
      v: (fv.querySelector('b') || {}).textContent || '',
      none: !!(fv.querySelector('b.none')),
    }));
    return {
      url: location.href,
      hidden: sheet ? sheet.hidden : 'no-sheet',
      sub: (document.getElementById('surSub') || {}).textContent || '',
      viewport: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio },
      cards: cards.map((c) => ({ name: c.dataset.name, fld: fields(c) })),
      saveKeys: (() => {
        try { return Object.keys(window.__r7 ? (window.__r7.state() || {}) : {}); } catch (e) { return ['err:' + e.message]; }
      })(),
    };
  })()`);

  log('frames', frames, frames2, 'dt', Math.round(t2 - t1), 'ms');
  log('panel ' + JSON.stringify(info, null, 1));
  const r = await shot(process.env.SHOT || 'before.png');
  log('shot ' + r.path + ' ' + r.bytes + 'B');
  return { frames, frames2, info, shot: r.path, bytes: r.bytes };
};
