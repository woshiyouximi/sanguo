// 招降面板截图步骤：先 Page.bringToFront（否则 Edge 后台标签页的合成器不刷新，
// captureScreenshot 可能拿到空白/旧帧），再等面板把卡片铺好，然后整页截一张。
// 用法（ENV）：
//   PAGE_URL=http://127.0.0.1:5199/web/campaign.html?surscen=1&surstart=...&sur=...
//   MATCH=campaign.html PORT=9333 OUTDIR=F:\sanguo\work\hud_vital
//   node F:\sanguo\work\cocos_verify\cdpweb.mjs run F:\sanguo\work\hud_vital\steps_shot_surrender.mjs
export default async ({ s, sleep, shot, evaluate, log }) => {
  await s('Page.bringToFront');
  if (process.env.NAV) {
    await s('Page.navigate', { url: process.env.NAV });
    await sleep(1800);
  }
  await sleep(1500);
  // 等 `?sur=` 探针把 save.captured 种进去、openSurrenderSheet 铺完卡片
  for (let i = 0; i < 40; i++) {
    const n = await evaluate('document.querySelectorAll("#surCards .sgen").length');
    if (n > 0) break;
    await sleep(250);
  }
  await sleep(600);
  const info = await evaluate(`(() => {
    const sheet = document.getElementById('surrenderSheet');
    const cards = [...document.querySelectorAll('#surCards .sgen')];
    return {
      hidden: sheet ? sheet.hidden : 'no-sheet',
      title: (document.querySelector('#surrenderSheet .ttl') || {}).textContent || '',
      sub: (document.getElementById('surSub') || {}).textContent || '',
      cards: cards.map((c) => ({
        name: c.dataset.name,
        text: (c.innerText || '').replace(/\\n+/g, ' | '),
        btns: [...c.querySelectorAll('[data-sur]')].map((b) => b.textContent + (b.disabled ? '(灰)' : '')),
      })),
      foot: [...document.querySelectorAll('#surrenderSheet .sheet-ft button')].map((b) => b.textContent),
    };
  })()`);
  log('panel ' + JSON.stringify(info, null, 1));
  const r = await shot(process.env.SHOT || 'before_surrender.png');
  log('shot ' + r.path + ' ' + r.bytes + 'B');
  return { info, shot: r.path };
};
