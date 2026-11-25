// Dump the web campaign page DOM skeleton (after dismissing the scenario modal)
// so the Cocos layout can mirror the real structure (页头 / 地图 / 圖例 / 戰報 / 按钮 / 提示).
export default async function ({ page, send, shot, evaluate, click, sleep, log }) {
  const { targetInfos } = await send('Target.getTargets');
  let target = targetInfos.find((t) => t.url.includes('/web/campaign.html'));
  if (!target) {
    const created = await send('Target.createTarget', { url: 'http://127.0.0.1:5173/web/campaign.html' });
    target = { targetId: created.targetId, url: 'http://127.0.0.1:5173/web/campaign.html' };
    await new Promise((r) => setTimeout(r, 1500));
  }
  const { sessionId } = await send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
  const S = (method, params) => send(method, params, sessionId);

  await S('Emulation.setDeviceMetricsOverride', { width: 750, height: 1334, deviceScaleFactor: 1, mobile: false });
  await sleep(400);

  // 1. what is on screen before dismissing
  const before = await S('Runtime.evaluate', {
    expression: `(() => {
      const out = [];
      const walk = (node, depth) => {
        if (!node || depth > 3) return;
        const tag = node.tagName ? node.tagName.toLowerCase() : '#';
        const cls = node.className && typeof node.className === 'string' ? '.' + node.className.trim().split(/\\s+/).join('.') : '';
        const id = node.id ? '#' + node.id : '';
        const r = node.getBoundingClientRect ? node.getBoundingClientRect() : null;
        const vis = r && r.width > 0 && r.height > 0;
        if (vis || depth <= 1) out.push('  '.repeat(depth) + tag + id + cls + (vis ? ' [' + Math.round(r.x) + ',' + Math.round(r.y) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height) + ']' : ' [0]'));
        for (const c of node.children || []) walk(c, depth + 1);
      };
      walk(document.body, 0);
      return out.join('\\n');
    })()`,
    returnByValue: true,
  });
  log('### DOM_before_modal');
  log(before.result.value);

  // 2. dismiss modal: click first scenario card then 選君主
  const dismissed = await S('Runtime.evaluate', {
    expression: `(() => {
      const all = Array.from(document.querySelectorAll('*'));
      const card = all.find((e) => /黃巾之亂/.test(e.textContent || '') && e.children.length <= 3 && e.getBoundingClientRect().height > 40);
      if (card) card.click();
      const btn = all.find((e) => /選\\s*君\\s*主/.test((e.textContent || '').trim()) && e.getBoundingClientRect().width > 40);
      if (btn) btn.click();
      return JSON.stringify({ card: !!card, btn: !!btn, btnText: btn ? btn.textContent.trim().slice(0, 20) : null });
    })()`,
    returnByValue: true,
  });
  log('### dismiss ' + dismissed.result.value);
  await sleep(1200);
  await shot('web_campaign_open.png');

  // 3. DOM skeleton after dismiss
  const after = await S('Runtime.evaluate', {
    expression: `(() => {
      const out = [];
      const walk = (node, depth) => {
        if (!node || depth > 3) return;
        const tag = node.tagName ? node.tagName.toLowerCase() : '#';
        const cls = node.className && typeof node.className === 'string' ? '.' + node.className.trim().split(/\\s+/).join('.') : '';
        const id = node.id ? '#' + node.id : '';
        const r = node.getBoundingClientRect ? node.getBoundingClientRect() : null;
        const vis = r && r.width > 0 && r.height > 0;
        if (vis || depth <= 1) out.push('  '.repeat(depth) + tag + id + cls + (vis ? ' [' + Math.round(r.x) + ',' + Math.round(r.y) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height) + ']' : ' [0]'));
        for (const c of node.children || []) walk(c, depth + 1);
      };
      walk(document.body, 0);
      return out.join('\\n');
    })()`,
    returnByValue: true,
  });
  log('### DOM_after_modal');
  log(after.result.value);
}
