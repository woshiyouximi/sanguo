export default async function ({ evaluate, sleep, shot, log, s }) {
  const ev = async (x) => { const v = await evaluate(x); if (v && v.__throw) throw new Error(v.__throw); return typeof v === 'string' ? JSON.parse(v) : v; };
  await s('Page.bringToFront', {}); await sleep(4000);
  const f0 = await ev(`(() => cc.director.getTotalFrames())()`);
  await evaluate(`cc.director.loadScene('Battle'); 'go'`);
  for (let i=0;i<20;i++){ await sleep(1500); const n = await ev(`(() => { const sc=cc.director.getScene(); return JSON.stringify({n: sc?sc.name:null}); })()`); if(n.n==='Battle'){ log('battle ready'); break; } }
  await sleep(6000);
  const st = await ev(`(() => { const sc=cc.director.getScene(); const a=[]; const w=(x)=>{a.push(x);x.children.forEach(w);}; w(sc); const labs=a.map(n=>n.getComponent(cc.Label)).filter(Boolean).map(l=>l.string||'').filter(Boolean); return JSON.stringify({frames: cc.director.getTotalFrames(), nodes:a.length, has:[labs.some(s=>/^兵 \d+\/\d+$/.test(s)), labs.some(s=>/^體 \d+\/\d+$/.test(s)), labs.filter(s=>/[疲士智武] \d/.test(s)).length], clock: labs.filter(s=>/^[一二三四五六七八九十百]+$/.test(s)).slice(0,2)}); })()`);
  log('battle ' + JSON.stringify(st));
  await shot('v193_battle');
}
