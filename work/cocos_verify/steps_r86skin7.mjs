export default async function ({ evaluate, sleep, log, shot }) {
  const ev = async (x) => { const v = await evaluate(x); if (v && v.__throw) throw new Error(v.__throw); return typeof v === 'string' ? JSON.parse(v) : v; };
  await evaluate(`location.href='http://127.0.0.1:5173/cocos-build/web-mobile/index.html?cb=' + Date.now(); 'go'`);
  await sleep(15000);
  await evaluate(`cc.director.loadScene('Campaign'); 'go'`);
  await sleep(14000);
  const r = await ev(`(() => {
    const sc = cc.director.getScene(); if (!sc) return JSON.stringify({ err: 'no scene' });
    const a = []; const w = (n) => { a.push(n); n.children.forEach(w); }; w(sc);
    const skins = a.filter((n) => /^Skin_/.test(n.name));
    const withFrame = skins.filter((n) => { const s = n.getComponent(cc.Sprite); return !!(s && s.spriteFrame); });
    const gra = skins.filter((n) => !!n.getComponent(cc.Graphics));
    const byKey = {};
    for (const n of skins) byKey[n.name] = (byKey[n.name] || 0) + 1;
    return JSON.stringify({ nodes: a.length, skins: skins.length, withFrame: withFrame.length, fallbackGraphics: gra.length, keys: Object.keys(byKey).length, sample: Object.keys(byKey).slice(0,8) });
  })()`);
  log(JSON.stringify(r));
  await shot('r86_campaign_skin3');
}
