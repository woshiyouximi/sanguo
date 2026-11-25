export default async function ({ evaluate, sleep, log, shot }) {
  const ev = async (x) => { const v = await evaluate(x); if (v && v.__throw) throw new Error(v.__throw); return typeof v === 'string' ? JSON.parse(v) : v; };
  await evaluate(`location.href='http://127.0.0.1:5173/cocos-build/web-mobile/index.html?cb=' + Date.now(); 'go'`);
  await sleep(16000);
  await shot('f01_title');
  await evaluate(`cc.director.loadScene('Campaign'); 'go'`);
  await sleep(14000);
  const r = await ev(`(() => {
    const sc = cc.director.getScene(); if (!sc) return JSON.stringify({ err: 'no scene' });
    const a = []; const w = (n) => { a.push(n); n.children.forEach(w); }; w(sc);
    const skins = a.filter((n) => /^Skin/i.test(n.name));
    const lab = a.map((n) => n.getComponent(cc.Label)).filter(Boolean).map((l) => l.string);
    return JSON.stringify({ nodes: a.length, skins: skins.length, hasSaveEntry: lab.some((s) => s && s.indexOf('存 檔') >= 0), surOpen: a.some((n) => /Surrender/i.test(n.name)) });
  })()`);
  log(JSON.stringify(r));
  await shot('f02_campaign');
}
