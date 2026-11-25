// 从 Boot 场景进 Campaign：用 cc.js.getClassName（@ccclass 注册名，压缩后仍准确）找 BootRoot 再调 enterCampaign()。
export default async function ({ evaluate, sleep, log }) {
  const ev = async (x) => {
    const v = await evaluate(x);
    if (v && v.__throw) throw new Error(v.__throw);
    return v;
  };
  const cn = 'cc.js.getClassName(c)';
  const find = async (name) => ev(`(() => { const s = cc.director.getScene(); let out = null; const walk = (n) => { for (const c of n.components || []) { if (c && ${cn} === ${JSON.stringify(name)}) out = c; } for (const ch of n.children) walk(ch); }; walk(s); return out; })()`);
  log('classes ' + (await ev(`(() => { const s = cc.director.getScene(); const out = new Set(); const walk = (n) => { for (const c of n.components || []) { try { out.add(cc.js.getClassName(c)); } catch (e) {} } for (const ch of n.children) walk(ch); }; walk(s); return JSON.stringify([...out].slice(0, 40)); })()`)));

  let has = await ev(`(() => { const s = cc.director.getScene(); let out = null; const walk = (n) => { for (const c of n.components || []) { if (c && cc.js.getClassName(c) === 'CampaignRoot') out = c; } for (const ch of n.children) walk(ch); }; walk(s); window.__camp = out; return !!out; })()`);
  if (!has) {
    const r = await ev(`(() => { const s = cc.director.getScene(); let b = null; const walk = (n) => { for (const c of n.components || []) { if (c && cc.js.getClassName(c) === 'BootRoot') b = c; } for (const ch of n.children) walk(ch); }; walk(s);
      if (!b) return JSON.stringify({ err: 'no BootRoot' });
      try { localStorage.setItem('sanguo_run_fresh', '1'); } catch (e) {}
      b.enterCampaign(); return JSON.stringify({ ok: true, next: b.nextScene }); })()`);
    log('enter ' + r);
    for (let i = 0; i < 40; i += 1) {
      await sleep(500);
      has = await ev(`(() => { const s = cc.director.getScene(); let out = null; const walk = (n) => { for (const c of n.components || []) { if (c && cc.js.getClassName(c) === 'CampaignRoot') out = c; } for (const ch of n.children) walk(ch); }; walk(s); window.__camp = out; return !!out; })()`);
      if (has) break;
    }
  }
  await sleep(1500);
  const info = await ev(`(() => { const c = window.__camp; const s = cc.director.getScene();
    if (!c) return JSON.stringify({ scene: s && s.name, err: 'no CampaignRoot' });
    return JSON.stringify({ scene: s && s.name, owned: c.save.owned, selected: c.selected, month: c.save.month,
      labelMonth: c.labelMonth ? c.labelMonth.string : null, gold: c.save.gold, cities: c.cities.length,
      paths: c.paths.length, armies: (c.save.armies || []).length, hint: c.hintText }); })()`);
  log('info ' + info);
  return info;
}
