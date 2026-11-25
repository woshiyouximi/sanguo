// HUD 截图步骤（191 验收）：先 bringToFront，再（可选 NAV 导航）等战斗跑起来，最后整页截图。
// 用法：
//   $env:PAGE_URL='http://127.0.0.1:5199/web/index.html?dev=1&terrain=7&auto=1&sim=270&freeze=1&seed=7'
//   $env:MATCH='index.html'; $env:PORT='9333'; $env:SHOT='after_hud.png'
//   node cdpweb.mjs launch F:\sanguo\work\hud_vital\steps_shot_hud.mjs
export default async ({ s, sleep, shot, evaluate, log }) => {
  await s('Page.bringToFront');
  if (process.env.NAV) {
    await s('Page.navigate', { url: process.env.NAV });
    await sleep(1800);
  }
  // 等 canvas 尺寸落到 750×1334（render 有缩放层，等两帧以上更稳）
  for (let i = 0; i < 20; i += 1) {
    await sleep(300);
    const st = await evaluate(`(() => {
      const c = document.querySelector('canvas');
      const box = c ? c.getBoundingClientRect() : null;
      return { has: !!c, w: box ? Math.round(box.width) : 0, h: box ? Math.round(box.height) : 0 };
    })()`);
    if (st && st.has && st.w > 200) { log('canvas', st); break; }
  }
  const wait = Number(process.env.SIM_MS || 6000);
  await sleep(wait);
  const info = await evaluate(`(() => ({ href: location.href, title: document.title }))()`);
  log('page', info);
  const file = await shot(process.env.SHOT || 'hud.png');
  return { page: info, shot: file };
};
