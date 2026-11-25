// Battle 单点：直接 loadScene('Battle')，等 5s，统计 + 截图（用于 p0/p1 A/B）
export default async function (ctx) {
  const { evaluate, shot, sleep, log } = ctx;
  const J = (s) => (typeof s === 'string' ? JSON.parse(s) : s);
  const ev = async (expr) => {
    const v = await evaluate(expr);
    if (v && v.__throw) throw new Error('eval threw: ' + v.__throw);
    return v;
  };
  const out = {};
  out.before = J(await ev(`JSON.stringify({ scene: cc.director.getScene().name })`));
  await ev(`cc.director.loadScene('Battle')`);
  await sleep(5000);
  out.after = J(await ev(`(async () => {
    const C = await System.import('cc');
    const T = (n) => (typeof C[n] === 'function' ? C[n] : null);
    const UIT = T('UITransform'), L = T('Label'), S = T('Sprite'), G = T('Graphics'), M = T('Mask') || T('MaskComponent');
    const cnt = (list, K) => (K ? list.filter(c => c instanceof K).length : -1);
    const sc = cc.director.getScene();
    let nodes = 0, labels = 0, sprites = 0, graphics = 0, masks = 0;
    const names = [];
    const rec = (n, d) => { nodes++; if (d <= 2) names.push(n.name);
      labels += cnt(n.components, L); sprites += cnt(n.components, S); graphics += cnt(n.components, G); masks += cnt(n.components, M);
      n.children.forEach(c => rec(c, d + 1)); };
    rec(sc, 0);
    return JSON.stringify({ scene: sc.name, frames: cc.director.getTotalFrames(), nodes, labels, sprites, graphics, masks, names: names.slice(0, 40) });
  })()`));
  log('BATTLE =', JSON.stringify(out.after));
  await sleep(500);
  out.shot = await shot('battle_only');
  log('shot =', JSON.stringify(out.shot));
  return out;
}
