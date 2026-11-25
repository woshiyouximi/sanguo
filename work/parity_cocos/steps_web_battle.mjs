// web 战斗：进 index → 点「開戰」→ 截对局中 → 等结算
export default async function ({ s, send, evaluate, sleep, log }) {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const OUT = process.env.OUTDIR || 'F:\\sanguo\\work\\parity_cocos';
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, sessionId);
    if (r.exceptionDetails) return { __throw: r.exceptionDetails.exception ? r.exceptionDetails.exception.description : JSON.stringify(r.exceptionDetails) };
    return r.result.value;
  };
  const sh = async (name) => {
    const r = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
    const p = path.join(OUT, name + '.png');
    fs.writeFileSync(p, Buffer.from(r.data, 'base64'));
    return p;
  };
  const click = async (x, y) => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0, pointerType: 'mouse' }, sessionId);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, buttons: 1, pointerType: 'mouse' }, sessionId);
    await sleep(60);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, buttons: 0, pointerType: 'mouse' }, sessionId);
  };
  await send('Page.enable', {}, sessionId);
  await send('Runtime.enable', {}, sessionId);
  await send('Emulation.setDeviceMetricsOverride', { width: 750, height: 1334, deviceScaleFactor: 1, mobile: false }, sessionId);
  await send('Page.navigate', { url: 'http://127.0.0.1:5173/web/index.html' }, sessionId);
  await sleep(3500);
  const before = await ev(`JSON.stringify({ hasBtn: !!Array.from(document.querySelectorAll('button')).find(b=>/開戰/.test(b.textContent)) })`);
  log('before ' + before);
  await click(375, 755); // 中央「開戰」
  await sleep(1500);
  const st1 = await ev(`(() => { const c = document.querySelector('canvas'); return JSON.stringify({ canvas: c ? [c.width,c.height] : null, hud: document.body.innerText.replace(/\\s+/g,' ').slice(0,160) }); })()`);
  log('afterClick ' + st1);
  await sleep(9000);
  const shotBattle = await sh('web_battle');
  const mid = await ev(`document.body.innerText.replace(/\\s+/g,' ').slice(0,300)`);
  log('mid ' + mid);
  // 等结算（最多 150s）
  let result = null;
  for (let i = 0; i < 30; i++) {
    const txt = await ev(`document.body.innerText.replace(/\\s+/g,' ')`);
    if (txt && /結算|胜|勝|敗|戰果|撤/.test(txt) && /戰果|結算|勝利|敗北|勝負/.test(txt)) {
      result = txt.slice(0, 400);
      break;
    }
    await sleep(5000);
  }
  const shotResult = await sh('web_result');
  log('result ' + JSON.stringify(result));
  const census = await ev(`(() => { const all = Array.from(document.querySelectorAll('*')); const vis = all.filter(e => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width>0&&r.height>0&&cs.display!=='none'&&cs.visibility!=='hidden'&&Number(cs.opacity)>0; }); const fs={}; vis.filter(e=>Array.from(e.childNodes).some(n=>n.nodeType===3&&n.textContent.trim())).forEach(e=>{const s=getComputedStyle(e).fontSize; fs[s]=(fs[s]||0)+1;}); return JSON.stringify({ total: all.length, visible: vis.length, fontSizes: fs, borderImage: vis.filter(e=>{const v=getComputedStyle(e).borderImageSource; return v&&v!=='none';}).length, shadow: vis.filter(e=>{const c=getComputedStyle(e); return (c.boxShadow&&c.boxShadow!=='none')||(c.textShadow&&c.textShadow!=='none');}).length, gradient: vis.filter(e=>/gradient/.test(getComputedStyle(e).backgroundImage||'')).length, pointerNone: vis.filter(e=>getComputedStyle(e).pointerEvents==='none').length, transition: vis.filter(e=>{const c=getComputedStyle(e); return (c.transitionDuration&&c.transitionDuration!=='0s')||(c.animationName&&c.animationName!=='none');}).length }); })()`);
  log('census ' + census);
  await send('Target.closeTarget', { targetId });
  return { before, st1, mid, result, census, shotBattle, shotResult };
}
