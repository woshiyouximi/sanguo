export default async function ({ evaluate, shot, sleep, log }) {
  const t0 = Date.now();
  const a = await Promise.race([
    evaluate('1+1'),
    new Promise((r) => setTimeout(() => r('TIMEOUT'), 8000)),
  ]);
  log(JSON.stringify({ evalA: a, ms: Date.now() - t0 }));
  await sleep(500);
  const b = await Promise.race([
    evaluate('JSON.stringify({cc: typeof cc, scene: (typeof cc!=="undefined" && cc.director && cc.director.getScene()) ? cc.director.getScene().name : null})'),
    new Promise((r) => setTimeout(() => r('TIMEOUT2'), 8000)),
  ]);
  log(JSON.stringify({ evalB: b }));
  await shot('probe_blocked.png');
  return { a, b };
}
