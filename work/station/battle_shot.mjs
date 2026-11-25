// 附加證據：軍師真的進戰場 —— 用 campaign 算出的 encounter URL（帶 ?wise=<seq>）開戰，
// 點「開戰」後看戰鬥頁開場訊息是不是「軍師技：…」。
// 用法（頁面先停在戰鬥頁）：MATCH=web/index.html OUTDIR=... node cdpweb.mjs run battle_shot.mjs
export default async ({ evaluate, send, shot, sleep, log, click }) => {
  const before = await evaluate(`(() => ({
    href: location.href,
    buttons: [...document.querySelectorAll('button')].map((b) => b.id + ':' + b.textContent.trim().slice(0, 12)),
  }))()`);
  // 開戰：頁面是 canvas + 內層按鈕，用座標點（按鈕中心 440,700，見 900x1500 視窗）
  await send('Page.bringToFront');
  await click(440, 700);
  await sleep(1500);
  const mid = await evaluate(`(() => ({ start: (document.querySelector('#start') || {}).textContent || '', mode: (document.querySelector('#start') || {}).disabled }))()`);
  await sleep(3500);
  const s1 = await shot('07_battle_wise.png');
  return { before, mid, shot: s1 };
};
