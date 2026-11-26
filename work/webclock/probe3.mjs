export default async function probe({ s, evaluate, shot, sleep, log }) {
  const PAGE = 'http://127.0.0.1:9351/web/campaign.html?dev=1&auto=1';
  const dumpExpr = `(() => {
    const c = window.__clock;
    return JSON.stringify({
      clock: c ? c.state() : null,
      docHidden: document.hidden,
      visState: document.visibilityState,
      path: location.pathname + location.search,
    });
  })()`;
  const dump = async () => { for (let i = 0; i < 6; i += 1) { const v = await evaluate(dumpExpr); try { return JSON.parse(v); } catch { await sleep(300); } } return null; };
  const tryCmd = async (method, params, label) => {
    try { await s(method, params); log('ok', label); } catch (e) { log('fail', label, String(e).slice(0, 120)); }
  };
  log('before', JSON.stringify(await dump()));
  await tryCmd('Page.bringToFront', {}, 'bringToFront');
  await sleep(500);
  log('after bringToFront', JSON.stringify(await dump()));
  await tryCmd('Page.setWebLifecycleState', { state: 'active' }, 'setWebLifecycleState active');
  await sleep(800);
  log('after active', JSON.stringify(await dump()));
  // 直接看 window 焦點/可見性
  await tryCmd('Browser.setWindowBounds', { windowId: 1, bounds: { windowState: 'normal' } }, 'setWindowBounds 1');
  await sleep(500);
  log('after setWindowBounds', JSON.stringify(await dump()));
  await evaluate(`location.href = ${JSON.stringify(PAGE)}; true`);
  await sleep(2500);
  await tryCmd('Page.setWebLifecycleState', { state: 'active' }, 'active after nav');
  await sleep(800);
  log('after nav', JSON.stringify(await dump()));
  await shot('probe_vis');
  return await dump();
}
