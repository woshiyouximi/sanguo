/**
 * `src/core/skill_kind.ts` 的自检。跑法：
 *   cd F:\sanguo\game
 *   node --test tests\skill_kind.test.ts
 *
 * 断言分四类：
 *  1. **7 条 補兵 逐条**：每条各自的 kind（不是一刀切地"7 条都一样"，而是逐条带证据断言）；
 *  2. **110 条全量分布**：strike/aoe/heal/heal-troop 各多少，防止改动把别的技带走；
 *  3. **与旧逻辑的一致性**：把 `battle.ts:1970-1978` 的旧函数原样抄一份，断言**其余 103 条
 *     逐条相等** —— 这是本文件最重要的一组断言，防"顺手改坏别的"；
 *  4. 边界：硬编码 1/50/104、`opts.seq` 优先级、缺字段、ATTACK=40 阈值、简繁兜底。
 *
 * 数据直接读 `data/magics.json`（不走 `loadData()`，免得依赖资源目录）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  HEAL_TROOP_SEQS,
  SKILL_KIND_EVIDENCE,
  SKILL_KIND_LABEL,
  isHealTroopSeq,
  skillKindOfEx,
  type MagicLike,
  type SkillKind,
} from '../src/core/skill_kind.ts';

/** `data/magics.json` 的行：`MagicLike` 之外还带 NAME/ACTIVE（测试要断言它们）。 */
interface MagicRow extends MagicLike {
  NAME?: string;
  ACTIVE?: string;
}

const MAGICS: MagicRow[] = JSON.parse(
  readFileSync(new URL('../data/magics.json', import.meta.url), 'utf8'),
) as MagicRow[];

const BUBING = [5, 17, 19, 31, 37, 57, 81];

function bySeq(seq: number): MagicRow {
  const m = MAGICS.find((x) => x.SEQUENCE === seq);
  assert.ok(m, `data/magics.json 里必须有 seq=${seq}`);
  return m;
}

/**
 * `game/src/core/battle.ts:1970-1978` 的**逐字副本**（只把 `magicBySeq(data, seq)` 换成入参）。
 * 改这个函数就等于改断言基准，所以刻意保持与 battle.ts 一模一样。
 */
function legacySkillKindOf(m: MagicLike): 'heal' | 'strike' | 'aoe' | null {
  const seq = m.SEQUENCE;
  if (seq === 1) return 'heal';
  if (seq === 50) return 'strike';
  if (seq === 104) return 'aoe';
  if (m.ATTRIB?.includes('補血') || m.ATTRIB?.includes('补血')) return 'heal';
  return (m.ATTACK as number) >= 40 ? 'aoe' : 'strike';
}

// ── 1. 7 条「補兵」逐条 ────────────────────────────────────────────────────
// 每条都同时断言"数据侧"（ATTRIB/ATTACK/ACTIVE）与"分类侧"（kind），这样即使将来
// 有人改了 magics.json 的标签，测试也会立刻指向具体是哪一条变了。
for (const seq of BUBING) {
  test(`補兵 #${seq} ${bySeqSeqName(seq)} ⇒ heal-troop`, () => {
    const m = bySeq(seq);
    assert.equal(m.ATTRIB, '補兵', `#${seq} 的 ATTRIB 必须是 補兵`);
    assert.equal(m.ATTACK, 0, `#${seq} 的 ATTACK 必须是 0（脚本无伤害，见 magic_so.dis.txt）`);
    assert.equal(m.ACTIVE, '我方士兵', `#${seq} 的 ACTIVE 必须是 我方士兵`);
    assert.equal(skillKindOfEx(m), 'heal-troop', `#${seq} 应结算为补己方兵`);
    assert.equal(skillKindOfEx(m, { seq }), 'heal-troop');
    assert.equal(isHealTroopSeq(seq), true);
  });
}

/** 只用于测试标题里显示技名，避免标题里再写一遍中文名对不上。 */
function bySeqSeqName(seq: number): string {
  return MAGICS.find((x) => x.SEQUENCE === seq)?.NAME ?? '';
}

test('7 条補兵来自同一个 ATTRIB 值，且名单与数据完全吻合', () => {
  const fromData = MAGICS.filter((m) => (m.ATTRIB ?? '').includes('補兵')).map((m) => m.SEQUENCE as number);
  assert.deepEqual([...fromData].sort((a, b) => a - b), [...BUBING].sort((a, b) => a - b));
  assert.deepEqual([...HEAL_TROOP_SEQS].sort((a, b) => a - b), [...BUBING].sort((a, b) => a - b));
  // 名单之外一条都不能命中（isHealTroopSeq 是"脚本直证名单"，不该靠标签外溢）
  for (const m of MAGICS) {
    if (BUBING.includes(m.SEQUENCE as number)) continue;
    assert.equal(isHealTroopSeq(m.SEQUENCE), false, `#${m.SEQUENCE} 不该在補兵名单里`);
  }
});

test('7 条補兵在旧逻辑里全部被误判为 strike（这就是 WARN 的来源）', () => {
  for (const seq of BUBING) {
    assert.equal(legacySkillKindOf(bySeq(seq)), 'strike', `旧逻辑 #${seq} = strike`);
    assert.notEqual(skillKindOfEx(bySeq(seq)), legacySkillKindOf(bySeq(seq)), `#${seq} 必须被修正`);
  }
});

// ── 2. 110 条全量分布 ─────────────────────────────────────────────────────
test('110 条分布：strike 95 / aoe 6 / heal 2 / heal-troop 7 / 其它 0', () => {
  const dist: Record<SkillKind, number> = {
    strike: 0,
    aoe: 0,
    heal: 0,
    'heal-troop': 0,
    buff: 0,
    summon: 0,
    unknown: 0,
  };
  for (const m of MAGICS) dist[skillKindOfEx(m)]++;
  assert.deepEqual(dist, {
    strike: 95,
    aoe: 6,
    heal: 2,
    'heal-troop': 7,
    buff: 0,
    summon: 0,
    unknown: 0,
  });
  const total = Object.values(dist).reduce((a, b) => a + b, 0);
  assert.equal(total, 110);
  assert.equal(MAGICS.length, 110);
});

test('旧逻辑分布是 strike 102 / aoe 6 / heal 2（对照用）', () => {
  const dist: Record<string, number> = {};
  for (const m of MAGICS) {
    const k = legacySkillKindOf(m) as string;
    dist[k] = (dist[k] ?? 0) + 1;
  }
  assert.deepEqual(dist, { strike: 102, aoe: 6, heal: 2 });
});

test('aoe 只有 6 条且 ATTACK 都 >= 40', () => {
  const aoe = MAGICS.filter((m) => skillKindOfEx(m) === 'aoe');
  assert.deepEqual(
    aoe.map((m) => m.SEQUENCE),
    [42, 43, 85, 104, 109, 110],
  );
  for (const m of aoe) assert.ok((m.ATTACK as number) >= 40, `#${m.SEQUENCE} ATTACK=${m.ATTACK}`);
});

test('heal 只有 2 条，都是 ATTRIB 含補血（命療術 / 回天術）', () => {
  const heal = MAGICS.filter((m) => skillKindOfEx(m) === 'heal');
  assert.deepEqual(
    heal.map((m) => m.SEQUENCE),
    [1, 60],
  );
  for (const m of heal) assert.match(m.ATTRIB ?? '', /補血|补血/);
});

// ── 3. 与旧逻辑逐条一致（其余 103 条） ────────────────────────────────────
test('其余 103 条：skillKindOfEx === 旧 skillKindOf（逐条）', () => {
  let checked = 0;
  for (const m of MAGICS) {
    const seq = m.SEQUENCE as number;
    if (BUBING.includes(seq)) continue;
    checked++;
    assert.equal(
      skillKindOfEx(m),
      legacySkillKindOf(m),
      `#${seq} ${JSON.stringify(m.ATTRIB)} ATTACK=${m.ATTACK}：新旧必须一致`,
    );
  }
  assert.equal(checked, 103, '除 7 条補兵外应有 103 条');
});

test('差异集合恰好是 7 条補兵，一个不多一个不少', () => {
  const diff = MAGICS.filter((m) => (skillKindOfEx(m) as string) !== (legacySkillKindOf(m) as string)).map(
    (m) => m.SEQUENCE,
  );
  assert.deepEqual(diff, BUBING);
});

// ── 4. 边界与硬编码 ───────────────────────────────────────────────────────
test('seq 1/50/104 的硬编码保持原样（即使 ATTRIB/ATTACK 被改）', () => {
  assert.equal(skillKindOfEx({ SEQ: 1, ATTRIB: '', ATTACK: 0 }), 'heal');
  assert.equal(skillKindOfEx({ SEQ: 50, ATTRIB: '全體', ATTACK: 99 }), 'strike');
  assert.equal(skillKindOfEx({ SEQ: 104, ATTRIB: '全體', ATTACK: 0 }), 'aoe');
});

test('ATTACK 阈值仍是 40（40→aoe，39→strike）', () => {
  assert.equal(skillKindOfEx({ SEQ: 999, ATTRIB: '全體', ATTACK: 40 }), 'aoe');
  assert.equal(skillKindOfEx({ SEQ: 999, ATTRIB: '全體', ATTACK: 39 }), 'strike');
});

test('opts.seq 优先于 m.SEQ 与 m.SEQUENCE', () => {
  const m: MagicLike = { SEQ: 2, SEQUENCE: 2, ATTRIB: '', ATTACK: 0 };
  assert.equal(skillKindOfEx(m), 'strike');
  assert.equal(skillKindOfEx(m, { seq: 5 }), 'heal-troop', 'opts.seq=5 应按補兵判');
  assert.equal(skillKindOfEx({ SEQUENCE: 5, ATTRIB: '補兵', ATTACK: 0 }), 'heal-troop', '没有 SEQ 时退回 SEQUENCE');
});

test('缺 ATTACK 且无命中标签 ⇒ unknown（旧函数此处返回 strike/null）', () => {
  assert.equal(skillKindOfEx({ SEQ: 777 }), 'unknown');
  assert.equal(skillKindOfEx({}), 'unknown');
});

test('简体「补兵」也兜底成 heal-troop（INI 是 Big5，但代码里两种都认）', () => {
  assert.equal(skillKindOfEx({ SEQ: 1234, ATTRIB: '补兵', ATTACK: 0 }), 'heal-troop');
  assert.equal(skillKindOfEx({ SEQ: 1234, ATTRIB: '补血', ATTACK: 0 }), 'heal');
});

test('補血优先于補兵（同时带两个标签时仍回 heal）', () => {
  assert.equal(skillKindOfEx({ SEQ: 1234, ATTRIB: '補兵,補血', ATTACK: 0 }), 'heal');
});

test('SKILL_KIND_EVIDENCE 覆盖 7 条 + 3 个硬编码，且每条都能落到地址/文件行', () => {
  for (const seq of [...BUBING, 1, 50, 104]) {
    const ev = SKILL_KIND_EVIDENCE[seq];
    assert.ok(ev && ev.length > 0, `证据表缺 #${seq}`);
    assert.match(ev, /magic_so\.dis\.txt:\d+|MAGIC\.INI:\d+|battle\.ts:\d+/, `#${seq} 证据必须带可定位引用`);
  }
  for (const seq of BUBING) {
    assert.match(SKILL_KIND_EVIDENCE[seq] as string, /MoreSoldier|BackSoldier/, `#${seq} 证据要点名脚本函数`);
  }
});

test('SKILL_KIND_LABEL 覆盖全部 7 个 kind', () => {
  const kinds: SkillKind[] = ['strike', 'aoe', 'heal', 'heal-troop', 'buff', 'summon', 'unknown'];
  for (const k of kinds) assert.ok(SKILL_KIND_LABEL[k]?.length > 0, `缺 label: ${k}`);
  assert.deepEqual(Object.keys(SKILL_KIND_LABEL).sort(), [...kinds].sort());
});

test('数据完整性：seq 连续 1..110，无重复（分布断言的前提）', () => {
  const seqs = MAGICS.map((m) => m.SEQUENCE as number).sort((a, b) => a - b);
  assert.equal(seqs.length, 110);
  assert.deepEqual(seqs, Array.from({ length: 110 }, (_, i) => i + 1));
});
