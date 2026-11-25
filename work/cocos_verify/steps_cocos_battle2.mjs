export default async function ({ evaluate, sleep, shot, log, s }) {
  const ev = async (x) => { const v = await evaluate(x); if (v && v.__throw) throw new Error(v.__throw); return typeof v === 'string' ? JSON.parse(v) : v; };
  await s('Page.bringToFront', {});
  let st = null;
  for (let i = 0; i < 40; i++) {
    await sleep(2000);
    st = await ev(`(() => { const sc = (typeof cc !== 'undefined') ? cc.director.getScene() : null; return JSON.stringify({ hasCC: typeof cc !== 'undefined', scene: sc ? sc.name : null, frames: (typeof cc!=='undefined') ? cc.director.getTotalFrames() : -1 }); })()`);
    if (st.scene) break;
  }
  log('boot ' + JSON.stringify(st));
  if (!st.scene) return;
  await evaluate(`cc.director.loadScene('Battle'); 'go'`);
  for (let i = 0; i < 30; i++) { await sleep(1500); const n = await ev(`(() => { const sc = cc.director.getScene(); return JSON.stringify({ n: sc ? sc.name : null }); })()`); if (n.n === 'Battle') { log('battle ready'); break; } }
  await sleep(8000);
  const st1 = await ev(`(() => { const sc = cc.director.getScene(); const a=[]; const w=(x)=>{a.push(x); x.children.forEach(w);}; if (sc) w(sc); const labs = a.map(n=>n.getComponent(cc.Label)).filter(Boolean).map(l=>l.string||'').filter(Boolean); return JSON.stringify({ frames: cc.director.getTotalFrames(), nodes: a.length, labels: labs.slice(0, 12) }); })()`);
  log('battle ' + JSON.stringify(st1));
  await shot('cb192_battle');
}
