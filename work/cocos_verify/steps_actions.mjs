export default async function ({ evaluate, sleep, log }) {
  await sleep(1500);
  const raw = await evaluate(`(() => {
    const a = document.querySelector('#actions');
    const cs = getComputedStyle(a);
    const kids = [...a.children].map((el) => { const b = el.getBoundingClientRect(); return { act: el.dataset.act, h: Math.round(b.height), y: Math.round(b.y), cls: el.className }; });
    const f = document.querySelector('footer');
    const fcs = getComputedStyle(f);
    return JSON.stringify({ actionsH: Math.round(a.getBoundingClientRect().height), rows: cs.gridTemplateRows, align: cs.alignContent, kids, footerDisplay: fcs.display, footerH: Math.round(f.getBoundingClientRect().height), footerPad: fcs.padding, gap: fcs.gap });
  })()`, { returnByValue: true });
  const j = typeof raw === 'string' ? JSON.parse(raw) : raw;
  log('actions', JSON.stringify(j, null, 1));
  return j;
}
