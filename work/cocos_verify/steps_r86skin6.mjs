export default async function ({ evaluate, sleep, log, shot }) {
  const ev = async (x) => { const v = await evaluate(x); if (v && v.__throw) throw new Error(v.__throw); return typeof v === 'string' ? JSON.parse(v) : v; };
  await evaluate(`location.href='http://127.0.0.1:5173/cocos-build/web-mobile/index.html?cb=' + Date.now(); 'go'`);
  const wait = async (n) => { for (let i = 0; i < 30; i++) { await sleep(1500); const s = await ev(`(() => { const sc = cc.director.getScene(); return JSON.stringify({ n: sc ? sc.name : null }); })()`); if (s.n === n) return true; } return false; };
  log('boot? ' + await wait('Boot'));
  await sleep(4000);
  await evaluate(`cc.director.loadScene('Campaign'); 'go'`);
  log('campaign? ' + await wait('Campaign'));
  await sleep(8000);
  const r = await ev(`(() => {
    const sc = cc.director.getScene(); if (!sc) return JSON.stringify({ err: 'no scene' });
    const a = []; const w = (n) => { a.push(n); n.children.forEach(w); }; w(sc);
    const frames = a.filter((n) => /^Frame_/.test(n.name));
    const btns = a.filter((n) => /^Btn_/.test(n.name));
    const okF = frames.filter((n) => { const s = n.getComponent(cc.Sprite); return !!(s && s.spriteFrame); });
    const okB = btns.filter((n) => { const s = n.getComponent(cc.Sprite); return !!(s && s.spriteFrame); });
    return JSON.stringify({ nodes: a.length, frames: frames.length, framesOk: okF.length, btns: btns.length, btnsOk: okB.length, sample: frames.slice(0,6).map((n)=>n.name) });
  })()`);
  log(JSON.stringify(r));
  await shot('r86_campaign_skin2');
}
