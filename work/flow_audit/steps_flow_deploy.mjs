// work/flow_audit/steps_flow_deploy.mjs —— 出征編成頁取證（四件事：出陣順序/陣形/站位/軍師技）
export default async function ({ evaluate, sleep, log, shot, s }) {
  const ev = async (x) => {
    try { const v = await evaluate(x); if (v && v.__throw) return { __throw: v.__throw }; return v; } catch (e) { return { __throw: String((e && e.message) || e) }; }
  };
  const J = async (x) => { const v = await ev(x); if (v && v.__throw) return { __throw: v.__throw }; try { return JSON.parse(v); } catch { return v; } };
  const go = async (url) => {
    await s('Page.navigate', { url });
    await sleep(700);
    for (let i = 0; i < 150; i += 1) { if (await ev('document.readyState') === 'complete') break; await sleep(200); }
    await sleep(1400);
  };
  const BASE = 'http://127.0.0.1:5299/web/';
  try { await s('Network.enable'); await s('Network.setCacheDisabled', { cacheDisabled: true }); } catch (e) { /* ignore */ }

  await go(BASE + 'deploy.html?city=%E7%80%A2%E9%99%BD&from=%E9%99%B3%E7%95%99&a=%E6%9B%B9%E6%93%8D&lv=2&bsoldiers=150&blevel=3');
  const info = await J(`(() => {
    const txt = document.body.innerText.replace(/\\n{2,}/g, '\\n');
    const heads = [...document.querySelectorAll('h2,h3,.ttl,.sec')].map((e) => e.textContent.replace(/\\s+/g,' ').trim()).slice(0, 14);
    const grids = [...document.querySelectorAll('[id$="grid"]')].map((g) => ({ id: g.id, n: g.children.length }));
    return JSON.stringify({ heads, grids, body: txt.slice(0, 1400) });
  })()`);
  log('deploy: ' + JSON.stringify(info).slice(0, 1500));
  await shot('e1_deploy_page');
  await ev(`(() => { window.scrollTo(0, 0); return 1; })()`);
  await sleep(300);
  await shot('e2_deploy_top');
  return { info };
}
