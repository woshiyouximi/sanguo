export default async ({ evaluate, send, sleep, log }) => {
  await send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
  await send('Page.setWebLifecycleState', { state: 'active' }).catch(() => {});
  const r = await evaluate(`(() => {
    const canvas = cc.director.getScene().getChildByName('Canvas');
    const out = [];
    const walk = (n, d) => {
      if (d > 6) return;
      for (const c of n.components) {
        const names = [];
        for (const k in c) { /* noop */ }
        out.push({ node: n.name, depth: d, comp: c.constructor.name, hasStat: typeof c.statNameRect, active: n.active });
      }
      for (const ch of n.children) walk(ch, d + 1);
    };
    walk(canvas, 0);
    return { items: out.filter((x) => x.hasStat === 'function' || /Item/i.test(x.node)).slice(0, 20), total: out.length, activeTop: canvas.children.map((n) => n.name + ':' + n.active) };
  })()`);
  log(JSON.stringify(r, null, 1));
  return r;
};
