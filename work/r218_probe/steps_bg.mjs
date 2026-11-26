/**
 * 探针：BattleBg 节点树（位置/尺寸/精灵帧），查「背景图为什么只剩右边一条」。
 */
const DUMP = String.raw`(() => {
  var scene = (window.cc && cc.director && cc.director.getScene && cc.director.getScene()) || null;
  if (!scene) return null;
  var st = [scene];
  var root = null;
  while (st.length) {
    var n = st.pop();
    var c = n.getComponent && n.getComponent('BattleRoot');
    if (c) { root = c; break; }
    var ch = n.children || [];
    for (var i = 0; i < ch.length; i++) st.push(ch[i]);
  }
  if (!root || !root.bg) return { bg: false };
  function info(n) {
    var ut = n.getComponent && n.getComponent(cc.UITransform);
    var sp = n.getComponent && n.getComponent(cc.Sprite);
    var out = {
      name: n.name,
      active: !!n.active,
      p: [Math.round(n.position.x), Math.round(n.position.y)],
      size: ut ? [Math.round(ut.width), Math.round(ut.height)] : null,
      sprite: sp ? { enabled: !!sp.enabled, frame: sp.spriteFrame ? [sp.spriteFrame.width, sp.spriteFrame.height] : null, color: sp.color ? [sp.color.r, sp.color.g, sp.color.b, sp.color.a] : null } : null,
      children: (n.children || []).map(info),
    };
    return out;
  }
  return { bg: true, ready: !!root.bg.ready, tree: info(root.bg.node) };
})()`;

export default async function steps({ evaluate, log }) {
  const d = await evaluate(DUMP);
  log('bg ' + JSON.stringify(d));
  return { result: 'OK', d };
}
