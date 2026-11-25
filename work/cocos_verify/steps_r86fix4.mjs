export default async function ({ evaluate, sleep, log, shot }) {
  const ev = async (x) => { const v = await evaluate(x); if (v && v.__throw) throw new Error(v.__throw); return typeof v === 'string' ? JSON.parse(v) : v; };
  const waitScene = async (name, tries) => { for (let i = 0; i < tries; i++) { await sleep(1500); const s = await ev(`(() => { const sc = cc.director.getScene(); return JSON.stringify({ n: sc ? sc.name : null }); })()`); if (s.n === name) return true; } return false; };
  await evaluate(`location.href='http://127.0.0.1:5173/cocos-build/web-mobile/index.html?cb=' + Date.now(); 'go'`);
  log('boot ' + await waitScene('Boot', 20));
  await sleep(4000);
  await shot('g01_title');
  await evaluate(`cc.director.loadScene('Campaign'); 'go'`);
  log('campaign ' + await waitScene('Campaign', 30));
  await sleep(6000);
  await shot('g02_campaign');
  const open = await ev(`(() => { const sc = cc.director.getScene(); const a = []; const w = (n) => { a.push(n); n.children.forEach(w); }; w(sc);
    const root = a.find((n) => n.getComponent('CampaignRoot'));
    const c = root && root.getComponent('CampaignRoot');
    if (!c) return JSON.stringify({ ok: false });
    const sur = a.find((n) => /Surrender/i.test(n.name));
    const surVis = sur ? sur.activeInHierarchy : null;
    try { c['openSaveSlots'](); } catch (e) { return JSON.stringify({ ok: false, err: String(e) }); }
    return JSON.stringify({ ok: true, surVis });
  })()`);
  log('openSave ' + JSON.stringify(open));
  await sleep(2500);
  await shot('g03_saves');
  const dump = await ev(`(() => { const sc = cc.director.getScene(); const a = []; const w = (n) => { a.push(n); n.children.forEach(w); }; w(sc);
    const labs = a.map((n) => n.getComponent('cc.Label')).filter(Boolean).map((l) => l.string || '').filter(Boolean);
    return JSON.stringify({ nodes: a.length, labels: labs.slice(0, 24) });
  })()`);
  log(JSON.stringify(dump));
}
