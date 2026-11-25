// 截圖：大地圖 / 內政 / 物品 / 編成（w12-render 色數與空帶收口）
// 用法（cd work\cocos_verify）：
//   $env:PORT=9404; $env:PROFILE=F:\sanguo\work\cocos_render4\.edgeprof
//   $env:OUTDIR=F:\sanguo\work\cocos_render4; $env:PREFIX=after876
//   $env:W=876; $env:H=1368; $env:PAGES=campaign,city,items,deploy; $env:ITEMS_EMPTY=1
//   $env:PAGE_URL=http://127.0.0.1:5188/cocos_render4/cocos-build/web-mobile/index.html
//   node cdp.mjs launch ; node cdp.mjs run F:\sanguo\work\cocos_render4\steps_cap.mjs
const PREFIX = process.env.PREFIX || 'cap';
const W = Number(process.env.W || 876);
const H = Number(process.env.H || 1368);
const PAGES = (process.env.PAGES || 'items,deploy').split(',').map((s) => s.trim()).filter(Boolean);
const ITEMS_EMPTY = process.env.ITEMS_EMPTY === '1';
const PAGE_URL = process.env.PAGE_URL || '';

const HELPERS = `
window.__canvas = () => cc.director.getScene().getChildByName('Canvas');
window.__comp = () => window.__canvas().components.find((x) => x && x.save && x.cities);
window.__panel = (name) => { let p = null; const w = (n) => { if (p) return; const k = (n.components || []).find((x) => (x.__classname__ || '') === name); if (k) { p = k; return; } n.children.forEach(w); }; w(window.__canvas()); return p; };
'ok'`;

export default async function ({ s, evaluate, sleep, shot, log }) {
  const out = { pages: PAGES, w: W, h: H, itemsEmpty: ITEMS_EMPTY };
  // 每一轮都硬刷新，回到「刚开机」的状态：物品页默认选中第一件、大地圖没有残留面板。
  // 不刷新会串味（上一轮清掉的 selectedSeq 会留到这一轮，campaign 截图里也会挂着物品页）。
  await s('Page.bringToFront').catch(() => {});
  // cdp.mjs run 是按 URL 里含 'cocos-build' 找 target 的，before/cocos-build 和 cocos-build 都命中，
  // 所以必须先显式导航到 PAGE_URL，否则会一直在旧页面上截图（这一轮踩过：产物字节数几乎没变）。
  if (PAGE_URL) {
    const cur = await evaluate('location.href');
    if (cur !== PAGE_URL) {
      log('navigate: ' + cur + ' -> ' + PAGE_URL);
      await s('Page.navigate', { url: PAGE_URL });
      await sleep(3500);
    }
  }
  await s('Page.reload', { ignoreCache: true }).catch(() => {});
  await sleep(4000);
  await s('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
  await s('Page.setWebLifecycleState', { state: 'active' }).catch(() => {});
  await s('Page.bringToFront').catch(() => {});
  await s('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  let booted = false;
  for (let i = 0; i < 40; i += 1) {
    await sleep(700);
    const raw = await evaluate(`(() => { try { const sc = cc && cc.director && cc.director.getScene(); return JSON.stringify({ name: sc ? sc.name : '', frames: cc.director.getTotalFrames ? cc.director.getTotalFrames() : -1 }); } catch (e) { return JSON.stringify({ name: '', err: String(e) }); } })()`);
    let st = null;
    try { st = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { st = null; }
    if (st && st.name) {
      log('boot: ' + JSON.stringify(st));
      if (st.frames > 30) { booted = true; break; }
    }
  }
  if (!booted) log('boot: NOT confirmed, continue anyway');
  await sleep(1500);
  await evaluate(HELPERS);

  const ev = async (expr) => {
    const v = await evaluate(expr);
    if (v && v.__throw) throw new Error('eval threw: ' + v.__throw);
    return typeof v === 'string' ? JSON.parse(v) : v;
  };
  const frames = async () => ev(`JSON.stringify({ f: cc.director.getTotalFrames() })`);
  const grab = async (tag, note) => {
    const f1 = await frames();
    await sleep(400);
    const f2 = await frames();
    const file = await shot(PREFIX + '_' + tag + '.png');
    log('### ' + tag + ' frames ' + f1.f + ' -> ' + f2.f + (f2.f > f1.f ? ' (rising)' : ' (STATIC!)') + (note ? ' ' + note : ''));
    out[tag] = { file, frames: [f1.f, f2.f] };
    return out[tag];
  };

  // 場景：先回大地圖（面板關掉）
  const sceneName = async () => evaluate(`(cc.director.getScene() && cc.director.getScene().name) || ''`);
  if ((await sceneName()) !== 'Campaign') {
    await evaluate(`cc.director.loadScene('Campaign'); 'go'`);
    for (let i = 0; i < 40; i += 1) {
      await sleep(700);
      if ((await sceneName()) === 'Campaign') break;
    }
    await sleep(2600);
  }
  await evaluate(HELPERS);

  const cityName = async () => {
    const r = await ev(`(() => {
      const c = window.__comp();
      const names = (c.cities || []).map((k) => k.NAME || k.name);
      return JSON.stringify({ n: names.length, first: names[0] || null });
    })()`);
    return r.first;
  };

  for (const page of PAGES) {
    if (page === 'campaign') {
      await ev(`(() => { const c = window.__comp(); if (c.cityPanel && c.cityPanel.hide) c.cityPanel.hide(); if (c.refresh) c.refresh(); return JSON.stringify({ ok: 1 }); })()`);
      await sleep(1400);
      await grab('campaign');
    } else if (page === 'city') {
      const target = (await cityName()) || '襄平';
      await ev(`(() => { const c = window.__comp(); c.openCityPanel(${JSON.stringify(target)}); return JSON.stringify({ ok: 1 }); })()`);
      await sleep(1800);
      const p = await ev(`(() => { const p = window.__panel('CityPanel'); if (!p) return JSON.stringify({ err: 'no CityPanel' }); if (p.save) { p.save.searchLog = []; if (p.save.extras) p.save.extras.log = []; } if (p.refresh) p.refresh(); return JSON.stringify({ ok: 1, city: p.cityName }); })()`);
      log('city: ' + JSON.stringify(p));
      await sleep(1000);
      await grab('city');
    } else if (page === 'items') {
      await ev(`(() => {
        const c = window.__comp();
        if (c.cityPanel && c.cityPanel.hide) c.cityPanel.hide();
        c.openItems();
        return JSON.stringify({ ok: 1 });
      })()`);
      await sleep(2000);
      if (ITEMS_EMPTY) {
        // openItems() 内部要 json 表落盘才算 built，2s 不一定够；先轮询到面板打开再清选中，
        // 清完还要复核 labelDetName 真的换成了「未選擇物品」，否则截图会拍到默认选中态。
        let r = null;
        for (let i = 0; i < 8; i += 1) {
          r = await ev(`(() => {
            const p = window.__panel('ItemsPanel');
            if (!p) return JSON.stringify({ err: 'no ItemsPanel' });
            p.selectedSeq = null;
            p.refresh();
            return JSON.stringify({ ok: 1, opened: !!p.opened, built: !!p.built, selected: p.selectedSeq, name: p.labelDetName ? p.labelDetName.string : null, fields: p.labelFieldKeys ? p.labelFieldKeys.string.split('\\n').length : -1 });
          })()`);
          if (r && r.name === '未選擇物品' && r.selected === null) break;
          await sleep(600);
        }
        log('items empty-state: ' + JSON.stringify(r));
        await sleep(700);
      }
      await grab('items', ITEMS_EMPTY ? '(no selection)' : '');
    } else if (page === 'deploy') {
      await evaluate(`(() => { const c = window.__comp(); const n = c.node.getChildByName('ItemsPanel'); if (n) { const p = n.components.find((x) => typeof x.hide === 'function'); if (p) p.hide(); } cc.director.loadScene('Deploy'); return 'go'; })()`);
      for (let i = 0; i < 40; i += 1) {
        await sleep(700);
        if ((await sceneName()) === 'Deploy') break;
      }
      await sleep(2600);
      await grab('deploy');
    }
  }
  log('done ' + JSON.stringify(out));
  return out;
}
