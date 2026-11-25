// 诊断 2：挂上 Runtime 后 reload，抓 boot 期间的 console/异常（第一次 attach 时 boot 已经跑完，抓不到）
export default async ({ s, sleep, evaluate, log, events }) => {
  await s('Page.bringToFront');
  await s('Page.reload', { ignoreCache: true });
  await sleep(4500);
  const cons = events.filter((e) => e.method === 'Runtime.consoleAPICalled').map((e) => (e.params.type + ': ' + (e.params.args || []).map((a) => (a.value !== undefined ? String(a.value) : (a.description || a.type))).join(' ')).slice(0, 800));
  const exc = events.filter((e) => e.method === 'Runtime.exceptionThrown').map((e) => ((e.params.exceptionDetails.exception || {}).description || e.params.exceptionDetails.text).slice(0, 1200));
  const st = await evaluate(`(() => ({ sheets: [...document.querySelectorAll('.sheet')].filter((x) => !x.hidden).map((x) => x.id), cards: document.querySelectorAll('#surCards .sgen').length }))()`);
  log('console ' + JSON.stringify(cons, null, 1));
  log('exceptions ' + JSON.stringify(exc, null, 1));
  log('state ' + JSON.stringify(st));
  return { cons, exc, st };
};
