// 导航到 PAGE_URL（默认 ready 预览页，rAF 在跑），等启动后执行 EXPR_FILE 并回传。
// 用途：ready 页不是冻结页，drawImage 钩子才录得到真实的 dest 尺寸。
import fs from 'node:fs';

export default async ({ s, evaluate, sleep, log }) => {
  const url = process.env.PAGE_URL || 'http://127.0.0.1:5173/web/index.html?terrain=7&dev=1&troop=2&btroop=10';
  await s('Page.bringToFront');
  await s('Page.navigate', { url });
  for (let i = 0; i < 100; i++) {
    const ok = await evaluate('!!(window.__sanguo && window.__sanguo.booted && window.__sanguo.state.units)');
    if (ok) break;
    await sleep(200);
  }
  await sleep(600);
  const expr = fs.readFileSync(process.env.EXPR_FILE, 'utf8');
  const out = await evaluate(expr);
  log('eval ->', JSON.stringify(out));
  return out;
};
