// 查 426 条 Error 3804（getComponent: Type must be non-nil）到底谁在打
export default async function (ctx) {
  const { evaluate, sleep, log } = ctx;

  const shape = await evaluate(`JSON.stringify({
    UITransform: typeof cc.UITransform, Sprite: typeof cc.Sprite, Label: typeof cc.Label,
    Graphics: typeof cc.Graphics, Node: typeof cc.Node, UITransformName: cc.UITransform && cc.UITransform.name,
    getComponentArity: cc.Node.prototype.getComponent.length,
    frames: cc.director.getTotalFrames(),
  })`);
  log('SHAPE=' + shape);

  // 装钩子：统计 + 抓第一份 stack
  await evaluate(`(() => {
    if (window.__err84) return 'already';
    window.__err84 = { count: 0, keys: {}, stacks: [] };
    const orig = console.error;
    console.error = function (...a) {
      try {
        const k = String(a[0]).slice(0, 80);
        const s = window.__err84;
        s.count++; s.keys[k] = (s.keys[k] || 0) + 1;
        if (s.stacks.length < 4) s.stacks.push((new Error('marker')).stack);
      } catch (e) {}
      return orig.apply(console, a);
    };
    return 'hooked';
  })()`);

  await sleep(3000);

  const rep = await evaluate(`JSON.stringify(window.__err84)`);
  log('REPORT=' + rep);
  return rep;
}
