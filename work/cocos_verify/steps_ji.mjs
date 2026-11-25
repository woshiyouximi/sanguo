export default async function ({ evaluate, sleep, shot, log }) {
  const ev = async (x) => { const v = await evaluate(x); if (v && v.__throw) throw new Error(v.__throw); return typeof v === 'string' ? JSON.parse(v) : v; };
  const H = `const __cn=(c)=>(c&&(c.__classname__||(c.constructor&&c.constructor.name)))||'?';const __all=()=>{const s=cc.director.getScene();const a=[];const w=(n)=>{a.push(n);n.children.forEach(w);};if(s)w(s);return a;};const __comp=(k)=>{const n=__all().find(x=>(x.components||[]).some(c=>__cn(c)===k));return n?((n.components||[]).find(c=>__cn(c)===k)||null):null;};`;
  await evaluate(`location.href='http://127.0.0.1:5173/cocos-build/web-mobile/index.html?cb='+Date.now();'go'`);
  for (let i = 0; i < 25; i++) { await sleep(1500); const s = await ev(`(() => { const sc = cc.director.getScene(); return JSON.stringify({ n: sc ? sc.name : null }); })()`); if (s.n === 'Boot') break; }
  await sleep(4000);
  await evaluate(`cc.director.loadScene('Campaign');'go'`);
  for (let i = 0; i < 30; i++) { await sleep(1500); const s = await ev(`(() => { const sc = cc.director.getScene(); return JSON.stringify({ n: sc ? sc.name : null }); })()`); if (s.n === 'Campaign') break; }
  await sleep(6000);
  const c = await ev(`(() => { ${H}
    const r = __comp('CampaignRoot');
    if (!r) return JSON.stringify({ err: 'no root' });
    const city = (r.cities || []).find((x) => (r.save.owned || []).indexOf(x.NAME) >= 0) || (r.cities || [])[0];
    const out = { city: city && city.NAME, hasOpen: typeof r.openCityPanel === 'function' };
    if (out.hasOpen) r.openCityPanel(city.NAME);
    return JSON.stringify(out);
  })()`);
  log('city ' + JSON.stringify(c));
  await sleep(3500);
  await shot('j01_city');
  const back = await ev(`(() => { ${H} const r = __comp('CampaignRoot'); if (r && r.closeCityPanel) r.closeCityPanel(); return JSON.stringify({ ok: !!r }); })()`);
  await sleep(1500);
  await shot('j02_campaign');
  const it = await ev(`(() => { ${H} const r = __comp('CampaignRoot'); if (r && r.openItems) { r.openItems(); return JSON.stringify({ ok: true }); } return JSON.stringify({ ok: false }); })()`);
  log('items ' + JSON.stringify(it));
  await sleep(3500);
  await shot('j03_items');
}
