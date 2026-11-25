export default async function ({ evaluate, sleep, shot, log, s }) {
  const ev = async (x) => { const v = await evaluate(x); if (v && v.__throw) throw new Error(v.__throw); return typeof v === 'string' ? JSON.parse(v) : v; };
  await s('Page.bringToFront', {}); await sleep(4000);
  await evaluate("cc.director.loadScene('Battle'); 'go'");
  for (let i = 0; i < 20; i++) { await sleep(1500); const n = await ev("(() => { const sc = cc.director.getScene(); return JSON.stringify({ n: sc ? sc.name : null }); })()"); if (n.n === 'Battle') { log('battle ready'); break; } }
  await sleep(7000);
  const st = await ev("(() => { const sc = cc.director.getScene(); const a = []; const w = (x) => { a.push(x); x.children.forEach(w); }; w(sc); const labs = a.map((n) => n.getComponent(cc.Label)).filter(Boolean).map((l) => l.string || '').filter(Boolean); return JSON.stringify({ frames: cc.director.getTotalFrames(), nodes: a.length, labels: labs.slice(0, 26) }); })()");
  log(JSON.stringify(st));
  await shot('v193_battle');
}
