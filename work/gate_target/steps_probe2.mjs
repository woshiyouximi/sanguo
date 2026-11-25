// 探针 2：找 CityPanel 组件实例与其命令/列表结构
export default async function (ctx) {
  const { evaluate, log } = ctx;
  const J = (s) => JSON.parse(s);

  const out = J(await evaluate(`(() => {
    const scene = cc.director.getScene();
    const found = [];
    const walk = (n) => {
      for (const c of n.components || []) {
        const name = (c && c.constructor && c.constructor.name) || '?';
        const keys = Object.keys(c || {});
        if (/Cmd|Sheet|Rects|Panel/i.test(keys.join(',')) || name === 'CityPanel' || typeof c.cmdDeploy === 'function') {
          found.push({ node: n.name, comp: name, hasDeploy: typeof c.cmdDeploy === 'function', keys: keys.slice(0, 60) });
        }
      }
      for (const ch of n.children || []) walk(ch);
    };
    const canvas = scene.getChildByName('Canvas');
    walk(canvas || scene);
    const comp = (canvas || scene).components.find(c => c && c.save && c.cities && c.actionRects);
    const cpRef = comp && comp.cityPanel;
    return JSON.stringify({
      canvasChildren: (canvas ? canvas.children.map(c => c.name) : []).slice(0, 30),
      found: found.slice(0, 12),
      cpRefType: cpRef ? typeof cpRef : 'none',
      cpRefKeys: cpRef ? Object.keys(cpRef).slice(0, 60) : null,
      compKeys: comp ? Object.keys(comp).filter(k => /panel|city|deploy/i.test(k)) : null,
    });
  })()`));

  log(JSON.stringify(out, null, 1));
  return out;
}
