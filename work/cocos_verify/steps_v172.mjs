export default async function ({ evaluate, sleep, log, s, shot }) {
  const ev = async (x) => { const v = await evaluate(x); if (v && v.__throw) throw new Error(v.__throw); return typeof v === 'string' ? JSON.parse(v) : v; };
  await s('Page.navigate', { url: 'http://127.0.0.1:5173/cocos-build/web-mobile/index.html?cb=' + Date.now() });
  await sleep(12000);
  const r = await ev(`(() => JSON.stringify({ cc: typeof cc, ready: document.readyState, title: document.title, canvas: !!document.querySelector('canvas'), sys: !!(window.cc && cc.sys), bodyLen: (document.body.innerText || '').length }))()`);
  log('probe ' + JSON.stringify(r));
  await shot('v172_boot');
}
