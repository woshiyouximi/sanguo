export default async function ({ evaluate, sleep, log, shot }) {
  const ev = async (x) => { const v = await evaluate(x); if (v && v.__throw) throw new Error(v.__throw); return typeof v === 'string' ? JSON.parse(v) : v; };
  const waitScene = async (name, tries) => { for (let i = 0; i < tries; i++) { await sleep(1500); const s = await ev(`(() => { const sc = cc.director.getScene(); return JSON.stringify({ n: sc ? sc.name : null }); })()`); if (s.n === name) return true; } return false; };
  await evaluate(`location.href='http://127.0.0.1:5173/cocos-build/web-mobile/index.html?cb=' + Date.now(); 'go'`);
  log('boot ' + await waitScene('Boot', 20));
  await sleep(5000);
  await shot('f01_title');
  await evaluate(`cc.director.loadScene('Campaign'); 'go'`);
  log('campaign ' + await waitScene('Campaign', 30));
  await sleep(6000);
  const r = await ev(`(() => {
    const sc = cc.director.getScene(); if (!sc) return JSON.stringify({ err: 'no scene' });
    const a = []; const w = (n) => { a.push(n); n.children.forEach(w); }; w(sc);
    const skins = a.filter((n) => /^Skin/i.test(n.name));
    const lab = a.map((n) => n.getComponent(cc.Label)).filter(Boolean).map((l) => l.string || '');
    return JSON.stringify({ nodes: a.length, skins: skins.length, saveEntry: lab.filter((s) => s.indexOf('存') >= 0).slice(0, 4), sur: a.filter((n) => /Surrender/i.test(n.name)).map((n) => n.name).slice(0, 4) });
  })()`);
  log(JSON.stringify(r));
  await shot('f02_campaign');
}
