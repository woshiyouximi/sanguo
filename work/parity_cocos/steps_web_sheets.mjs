// web campaign 浮层：劇本選擇 / 武將資料 / 勢力地圖
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
    for (const t of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
      const p = { type: t, x, y, button: t === 'mouseMoved' ? 'none' : 'left', buttons: t === 'mousePressed' ? 1 : 0, pointerType: 'mouse', clickCount: 1 };
      await send('Input.dispatchMouseEvent', p, sessionId);
      if (t === 'mousePressed') await sleep(80);
    }
  };
  const clickSel = async (sel) => {
    const r = await ev(`(() => { const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return null; const b=e.getBoundingClientRect(); return [Math.round(b.x+b.width/2), Math.round(b.y+b.height/2)]; })()`);
    if (r && !r.__throw) { await click(r[0], r[1]); return r; }
    return null;
  };
  await send('Page.enable', {}, sessionId);
  await send('Runtime.enable', {}, sessionId);
  await send('Emulation.setDeviceMetricsOverride', { width: 750, height: 1334, deviceScaleFactor: 1, mobile: false }, sessionId);
  await send('Page.navigate', { url: 'http://127.0.0.1:5173/web/campaign.html' }, sessionId);
  await sleep(4000);
  const out = {};
  // 劇本選擇：点第 2 个剧本卡
  const sc = await ev(`(() => { const cs=[...document.querySelectorAll('.scard')]; const e=cs.find(x=>/討伐董卓/.test(x.innerText)); if(!e) return {n:cs.length, names:cs.map(x=>x.innerText.slice(0,12))}; const b=e.getBoundingClientRect(); return [Math.round(b.x+b.width/2), Math.round(b.y+b.height/2)]; })()`);
  log('sc ' + JSON.stringify(sc));
  if (Array.isArray(sc)) { await click(sc[0], sc[1]); await sleep(1000); await sh('web_picksheet'); }
  out.pick = await ev(`(() => { const t=document.getElementById('pickSheet'); return JSON.stringify({ hidden: t?t.hidden:null, text: t?t.innerText.replace(/\\s+/g,' ').slice(0,300):'' }); })()`);
  log('pick ' + out.pick);
  await clickSel('#pickX'); await sleep(400);
  // 武將資料
  await clickSel('#btnGenerals'); await sleep(1000); await sh('web_generals');
  out.generals = await ev(`(() => { const t=document.body.innerText.replace(/\\s+/g,' '); const i=t.indexOf('武將'); return t.slice(0,40)+' || '+(document.querySelector('[id*=genSheet],[id*=genList]')?document.querySelector('[id*=genSheet],[id*=genList]').innerText.replace(/\\s+/g,' ').slice(0,260):'no sheet'); })()`);
  log('generals ' + out.generals);
  await clickSel('#genX'); await sleep(300);
  // 勢力地圖
  await clickSel('#btnForces'); await sleep(1000); await sh('web_forces');
  out.forces = await ev(`(() => { const e=document.querySelector('[id*=forceSheet],[id*=forces]'); return e?e.innerText.replace(/\\s+/g,' ').slice(0,300):'none'; })()`);
  log('forces ' + out.forces);
  await send('Target.closeTarget', { targetId });
  return out;
}
