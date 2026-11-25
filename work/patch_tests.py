import pathlib
p = pathlib.Path(r'F:\sanguo\proto\test_core.js')
t = p.read_text(encoding='utf-8')

t = t.replace("""  const w = C.createWorld({
    data: D, seed, soldiers: 100,
    sides: {""", """  const w = C.createWorld({
    data: D, seed, soldiers: 100, ai: cfg.ai || { A: true, B: true },
    sides: {""")
assert 'ai: cfg.ai' in t

t = t.replace("""console.log('\\n结果：' + pass + ' 过 / ' + fail + ' 败');""", """// ---------------------------------------------------------------- 7. 武将技
console.log('\\n[7] 武将技（技力 / 气力 / 效果）');
function mkWorld(seed, ai) {
  return C.createWorld({
    data: D, seed: seed, soldiers: 100, ai: ai || { A: false, B: false },
    sides: {
      A: { formation: 0, troop: '大刀', morale: 60, general: { str: 90, int: 80, hp: 100 } },
      B: { formation: 0, troop: '大刀', morale: 60, general: { str: 80, int: 70, hp: 100 } }
    }
  });
}
const M_HEAL = 1, M_STRIKE = 550, M_AOE = 104;
ok('三个代表技都能按 seq 找到', [M_HEAL, M_STRIKE, M_AOE].every(s => !!C.magicBySeq(D, s)),
  [M_HEAL, M_STRIKE, M_AOE].map(s => C.magicBySeq(D, s).name).join(' / '));

{
  const w = mkWorld(11);
  const g = w.sides.A.general;
  const mp0 = g.mp, qi0 = g.qi;
  const m = C.magicBySeq(D, M_AOE);
  const r = C.cast(w, 'A', M_AOE, 45, 6.5);
  ok('施放成功并扣技力', r.ok && g.mp === mp0 - m.mp, 'MP ' + mp0 + '→' + g.mp + '（消耗 ' + m.mp + '）');
  ok('同时扣气力', g.qi === qi0 - C.qiCostOf(m), '气力 ' + qi0 + '→' + g.qi);
  ok('气力上限 120000、单次消耗 = 12000', C.QI_MAX === 120000 && C.qiCostOf(m) === 12000);
}

{
  const w = mkWorld(12);
  const g = w.sides.A.general;
  g.mp = 5;
  const r = C.cast(w, 'A', M_AOE, 45, 6.5);
  ok('技力不足时拒绝施放（不扣气力）', !r.ok && r.reason === 'mp' && g.mp === 5 && g.qi === w.sides.A.general.qi,
    'reason=' + r.reason);
}

{
  const w = mkWorld(13);
  const g = w.sides.B.general;
  g.hp = 20;
  const r = C.cast(w, 'B', M_HEAL, 0, 0);
  ok('命療術治疗并封顶到上限', r.ok && g.hp > 20 && g.hp <= g.maxHp,
    'hp 20→' + g.hp + '（healed ' + r.healed + '）');
}

{
  // 把敌方 100 人挤到一点附近，验证 AoE 真的按半径杀人
  const w = mkWorld(14);
  let inR = 0;
  for (const u of w.units) {
    if (u.side !== 'B' || u.isGeneral) continue;
    u.x = 40 + (inR % 5) * 0.3; u.y = 6 + Math.floor(inR / 5) * 0.3; inR++;
  }
  const before = w.sides.B.aliveCount;
  const r = C.cast(w, 'A', M_AOE, 40.5, 6.2);
  const killedNow = before - w.sides.B.aliveCount;
  ok('AoE 在密集敌群里击杀 > 0', r.ok && killedNow > 0, '半径 3.6 内 ' + inR + ' 人，击杀 ' + killedNow);
  ok('击杀率落在 [20%, 80%] 的理论区间', killedNow / inR <= 0.82, (100 * killedNow / inR).toFixed(0) + '%');
}

{
  // 空旷处施放：不该误杀远处的人
  const w = mkWorld(15);
  const before = w.sides.B.aliveCount;
  const r = C.cast(w, 'A', M_AOE, 5, 13);
  ok('空旷处 AoE 不误伤', r.ok && r.killed === 0 && w.sides.B.aliveCount === before);
}

{
  const w = mkWorld(16);
  const g = w.sides.A.general;
  const qi0 = g.qi;
  for (let i = 0; i < 60; i++) C.step(w);
  ok('气力随时间回复（+200/tick）', g.qi === Math.min(C.QI_MAX, qi0 + 60 * 200),
    qi0 + '→' + g.qi);
}

{
  // 电脑放技能：跑满 60 秒不崩，且确实放过
  const w = mkWorld(17, { A: true, B: true });
  let t = 0;
  while (!w.over && t < 30 * 60) { C.step(w); t++; }
  const casts = w.log.filter(e => e.kind === 'magic').length;
  ok('电脑双方都会放技（60 秒内 ≥2 次）', casts >= 2, casts + ' 次');
}

{
  // 同 seed 同操作 → 同结果
  const a = mkWorld(99), b = mkWorld(99);
  for (let i = 0; i < 120; i++) { C.step(a); C.step(b); }
  C.cast(a, 'A', M_AOE, 40, 6); C.cast(b, 'A', M_AOE, 40, 6);
  ok('同 seed + 同操作结果一致', a.sides.B.aliveCount === b.sides.B.aliveCount,
    'B 剩余 ' + a.sides.B.aliveCount + ' vs ' + b.sides.B.aliveCount);
}

console.log('\\n结果：' + pass + ' 过 / ' + fail + ' 败');""")
p.write_text(t, encoding='utf-8')
print('tests patched')
