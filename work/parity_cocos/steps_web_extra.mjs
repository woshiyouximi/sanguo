// web campaign 附加面：列表视图 / 存檔位浮层 / 劇本選擇浮层
export default async function ({ s, send, sleep, log }) {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const OUT = process.env.OUTDIR || 'F:\\sanguo\\work\\parity_cocos';
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, sessionId);
    if (r.exceptionDetails) return { __throw: r.exceptionDetails.exception ? r.exceptionDetails.exception.description : 'x' };
    return r.result.value;
  };
  const sh = async (name) => {
    const r = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
    fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(r.data, 'base64'));
  };
  const click = async (x, y) => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0, pointerType: 'mouse' }, sessionId);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, buttons: 1, pointerType: 'mouse' }, sessionId);
    await sleep(80);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, buttons: 0, pointerType: 'mouse' }, sessionId);
  };
  await send('Page.enable', {}, sessionId);
  await send('Runtime.enable', {}, sessionId);
  await send('Emulation.setDeviceMetricsOverride', { width: 750, height: 1334, deviceScaleFactor: 1, mobile: false }, sessionId);
  await send('Page.navigate', { url: 'http://127.0.0.1:5173/web/campaign.html' }, sessionId);
  await sleep(4000);
  // 1) 列表视图
  const tabRect = await ev(`(() => { const e=document.getElementById('tabList'); if(!e) return null; const r=e.getBoundingClientRect(); return [Math.round(r.x+r.width/2), Math.round(r.y+r.height/2)]; })()`);
  log('tabList ' + JSON.stringify(tabRect));
  if (tabRect) { await click(tabRect[0], tabRect[1]); await sleep(1200); await sh('web_list'); }
  const listInfo = await ev(`(() => { const l=document.getElementById('list'); if(!l) return null; return JSON.stringify({ display: getComputedStyle(l).display, scrollH: l.scrollHeight, clientH: l.clientHeight, rows: document.querySelectorAll('#list *').length, text: l.innerText.replace(/\\s+/g,' ').slice(0,240) }); })()`);
  log('listInfo ' + listInfo);
  // 2) 存檔位浮层
  const saveRect = await ev(`(() => { const e=document.getElementById('btnSave'); if(!e) return null; const r=e.getBoundingClientRect(); return [Math.round(r.x+r.width/2), Math.round(r.y+r.height/2)]; })()`);
  log('btnSave ' + JSON.stringify(saveRect));
  if (saveRect) { await click(saveRect[0], saveRect[1]); await sleep(1000); await sh('web_saves'); }
  const saveInfo = await ev(`(() => { const t=document.body.innerText.replace(/\\s+/g,' '); const m=t.match(/存 檔 位[^]*?(?=關閉|取消)/); return JSON.stringify({ hasSheet: !!document.querySelector('[id*=saveSheet],[class*=sheet]'), slice: (m?m[0]:'').slice(0,300) }); })()`);
  log('saveInfo ' + saveInfo);
  // 关掉浮层（点遮罩）
  await click(375, 40); await sleep(500);
  // 3) 劇本選擇（点第 2 个剧本卡）
  const scRect = await ev(`(() => { const e=document.querySelectorAll('[data-scn],.scn,.scard'); if(!e.length) return null; const r=e[1].getBoundingClientRect(); return [Math.round(r.x+r.width/2), Math.round(r.y+r.height/2)]; })()`);
  log('scn2 ' + JSON.stringify(scRect));
  if (scRect) { await click(scRect[0], scRect[1]); await sleep(1200); await sh('web_scenario'); }
  const scInfo = await ev(`(() => document.body.innerText.replace(/\\s+/g,' ').slice(0,320))()`);
  log('scInfo ' + scInfo);
  await send('Target.closeTarget', { targetId });
  return { listInfo, saveInfo, scInfo };
}
