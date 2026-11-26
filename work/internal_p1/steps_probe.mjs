export default async function ({ evaluate, log }) {
  const v = await evaluate(`JSON.stringify({ href: location.href, search: location.search, v1: typeof window.__v1, r7: typeof window.__r7, gameStarted: typeof window.__armyUi, keys: Object.keys(window).filter(k => k.startsWith('__')) })`);
  log('PAGE ' + v);
  return v;
}
