export default async function ({ evaluate, sleep, log, events }) {
  const before = events.length;
  await evaluate(`location.reload(); 'reload'`);
  await sleep(4000);
  const exc = events.slice(before).filter((e) => e.method === 'Runtime.exceptionThrown')
    .map((e) => (e.params.exceptionDetails.exception || {}).description || e.params.exceptionDetails.text);
  const cons = events.slice(before).filter((e) => e.method === 'Runtime.consoleAPICalled')
    .map((e) => (e.params.args || []).map((a) => a.value ?? a.description).join(' ')).slice(0, 10);
  log('EXC ' + JSON.stringify(exc.slice(0, 3)));
  log('CONS ' + JSON.stringify(cons));
  log('GLOBALS ' + await evaluate(`JSON.stringify({ v1: typeof window.__v1, army: typeof window.__armyUi, saves: typeof window.Saves, release: window.__RELEASE__, href: location.search })`));
  return { exc: exc.slice(0, 3), cons };
}
