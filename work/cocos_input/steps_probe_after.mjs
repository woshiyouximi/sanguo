export default async function ({ evaluate, shot, sleep, log }) {
  const ev = async (expr) => {
    const v = await evaluate(expr);
    return typeof v === 'string' ? JSON.parse(v) : v;
  };
  await sleep(6000);
  const a = await ev(`JSON.stringify({ cc: typeof cc, winCC: typeof window.cc, scene: (typeof cc !== 'undefined' && cc.director && cc.director.getScene()) ? cc.director.getScene().name : null, canvas: !!document.querySelector('canvas'), title: document.title, scripts: Array.from(document.scripts).map(s => s.src).slice(0, 8) })`);
  log(JSON.stringify(a));
  await shot('probe_after_data.png');
  return a;
}
