/**
 * 探针：读取当前战斗主将的技能槽内容（回答「为什么是 6 个技能」）。
 * 用法：cd F:\sanguo; node work\cocos_verify\cdpweb.mjs run work\r218_probe\steps_slots.mjs
 */
const ROOT = String.raw`(() => {
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
  if (!root) return null;
  var slots = (root.input && root.input.slots) || [];
  return {
    level: root.world && root.world.sides ? root.world.sides.A.general.level : null,
    general: root.world && root.world.sides ? root.world.sides.A.general.name : null,
    maxHp: root.world && root.world.sides ? root.world.sides.A.general.maxHp : null,
    slotCount: slots.length,
    slotNames: slots.map(function (s) { return s.name; }),
    slotSeqs: slots.map(function (s) { return s.seq; }),
    magic: root.world && root.world.sides ? root.world.sides.A.general.magic : null,
  };
})()`;

export default async function steps({ evaluate, shot, log }) {
  const info = await evaluate(ROOT);
  log('slots ' + JSON.stringify(info));
  await shot('r218_slots');
  return { result: 'OK', info };
}
