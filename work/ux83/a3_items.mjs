// 改后取证（3/3）：items.html 提示条 —— 6s 自动消失 + 点击可关
import { bootSeeded, sleep } from './drive.mjs';
const c = await bootSeeded(750, 1334);
const out = { steps: {}, errs: [] };
const dump = () => c.eval(`(()=>{const t=document.querySelector('#toast');
  return {url:location.href, on:t?t.classList.contains('on'):null, text:t?t.textContent:null,
    hidden:t?t.hidden:null, top:(t?t.getBoundingClientRect().top:null)};})()`);

await c.goto('http://127.0.0.1:5173/web/items.html');
await sleep(1800);
out.steps.load = await dump();
out.shotLoad = await c.shot('after5_items_load.png');

await c.clickSel('#unlock');
await sleep(400);
out.steps.toast0 = await dump();
out.shotToast0 = await c.shot('after5_items_toast_0s.png');

await sleep(6500);
out.steps.toast7 = await dump();
out.shotToast7 = await c.shot('after5_items_toast_7s.png');

await c.clickSel('#unlock');
await sleep(300);
out.steps.toastClick0 = await dump();
await c.clickSel('#toast');
await sleep(300);
out.steps.toastClick1 = await dump();
out.shotToastClick = await c.shot('after5_items_toast_clicked.png');

out.errs = await c.errs(c.startErr);
await c.save('a3_items', out);
console.log(JSON.stringify(out, null, 1));
c.close();
