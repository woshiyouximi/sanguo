export default async function ({ evaluate, sleep, log, shot }) {
  const ev = async (x) => { const v = await evaluate(x); if (v && v.__throw) throw new Error(v.__throw); return typeof v === 'string' ? JSON.parse(v) : v; };
  await evaluate(`location.href='http://127.0.0.1:5173/cocos-build/web-mobile/index.html?cb=' + Date.now(); 'go'`);
  for (let i = 0; i < 20; i++) { await sleep(1500); const s = await ev(`(() => { const sc = cc.director.getScene(); return JSON.stringify({ n: sc ? sc.name : null }); })()`); if (s.n && s.n !== 'null') break; }
  const probe = await ev(`(() => new Promise((resolve) => {
    const b = cc.assetManager.getBundle('res');
    const out = { hasBundle: !!b };
    if (!b) { resolve(JSON.stringify(out)); return; }
    out.uiPaths = (b.getDirWithPath ? b.getDirWithPath('ui') : []).slice(0, 5).map((x) => x.path);
    out.infoFrame = !!(b.getInfoWithPath && b.getInfoWithPath('ui/frame_panel'));
    let done = 0;
    const fin = () => { if (++done === 3) resolve(JSON.stringify(out)); };
    b.load('ui/frame_panel', cc.ImageAsset, (e, a) => { out.image = e ? ('ERR ' + e.message) : (a ? 'ok' : 'null'); fin(); });
    b.load('ui/frame_panel/texture', cc.Texture2D, (e, a) => { out.tex = e ? ('ERR ' + e.message) : (a ? 'ok' : 'null'); fin(); });
    b.load('ui/frame_panel/spriteFrame', cc.SpriteFrame, (e, a) => { out.sf = e ? ('ERR ' + e.message) : (a ? 'ok' : 'null'); fin(); });
    setTimeout(() => resolve(JSON.stringify(out)), 8000);
  }))()`);
  log(JSON.stringify(probe));
}
