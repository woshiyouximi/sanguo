// 编成页「出阵顺序」展开态取证（第五张 after 截图用）
// 用法同 steps_pages3.mjs：
//   cd work\cocos_verify; $env:PORT=9401; $env:PROFILE=...; $env:OUTDIR=F:\sanguo\work\cocos_render3
//   $env:PHASE=b3j; node cdp.mjs run F:\sanguo\work\cocos_render3\steps_deploy_queue.mjs
const PREFIX = process.env.PHASE || 'b3j';

export default async function ({ s, evaluate, sleep, shot, log, click }) {
  const out = {};
  await s('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
  await s('Page.setWebLifecycleState', { state: 'active' }).catch(() => {});
  await s('Page.bringToFront').catch(() => {});
  await s('Emulation.setDeviceMetricsOverride', { width: 750, height: 1334, deviceScaleFactor: 1, mobile: false });
  await sleep(1200);

  const ev = async (expr) => {
    const v = await evaluate(expr);
    if (v && v.__throw) throw new Error('eval threw: ' + v.__throw);
    return typeof v === 'string' ? JSON.parse(v) : v;
  };

  await evaluate(`cc.director.loadScene('Deploy'); 'go'`);
  for (let i = 0; i < 40; i += 1) {
    await sleep(700);
    const n = await evaluate(`(cc.director.getScene() && cc.director.getScene().name) || ''`);
    if (n === 'Deploy') break;
  }
  await sleep(2600);

  const find = `(() => {
    const canvas = cc.director.getScene().getChildByName('Canvas');
    let comp = null;
    const w = (n) => { if (comp) return; const k = (n.components || []).find((x) => (x.__classname__ || '') === 'DeployRoot'); if (k) { comp = k; return; } n.children.forEach(w); };
    w(canvas);
    return comp;
  })()`;

  // 等美术底图就绪（否则走 artReady=false 纯色分支，色数会假低）
  let ready = null;
  for (let i = 0; i < 20; i += 1) {
    ready = await ev(`(() => { const c = ${find}; return JSON.stringify({ art: c && c.artBg ? c.artBg.state : null, queueOpen: c ? !!c.queueOpen : null, q: c && c.queue ? c.queue.length : null }); })()`);
    if (ready && ready.art === 'ready') break;
    await sleep(600);
  }
  log('deploy state: ' + JSON.stringify(ready));

  // 收起态窄条中心（QUEUE_Y=1150, 高 36 → 1168）
  await click(375, 1168);
  await sleep(1400);
  const opened = await ev(`(() => { const c = ${find}; return JSON.stringify({ queueOpen: c ? !!c.queueOpen : null }); })()`);
  log('after click: ' + JSON.stringify(opened));
  out.shot = await shot(PREFIX + '_deploy_queue.png');
  log('shot: ' + JSON.stringify(out.shot));

  // 再点一次收起，恢复默认态（说明：本脚本只取证，不改存盘）
  await click(375, 1168);
  await sleep(800);
  return out;
}
