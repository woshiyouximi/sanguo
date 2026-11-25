#!/usr/bin/env node
/**
 * 接线预演：不改 `game/src/core/battle.ts`，只把「接线后的 skillKindOf()」在本地跑一遍，
 * 证明 `work/fidelity/check.mjs` 的 `magic.castkind` 7 条 WARN 会归零。
 *
 *   cd F:\sanguo
 *   node work/skill_kind/predict_castkind.mjs
 *
 * 注意 check.mjs 默认读 **game/dist/core/*.js**（不是 src），所以接线后必须
 * `cd game; npx tsc -p tsconfig.build.json` 重出 dist，WARN 才会真的变。
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { skillKindOfEx } from '../../game/src/core/skill_kind.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');

const MAGICS = JSON.parse(readFileSync(path.join(ROOT, 'game/data/magics.json'), 'utf8'));
const EXPECT = JSON.parse(readFileSync(path.join(ROOT, 'work/fidelity/fidelity_expect.json'), 'utf8'));

/** 接线方案：battle.ts 的 skillKindOf 保留旧签名（'heal'|'strike'|'aoe'|null），把新增的 kind 折回表现层口径。 */
function wiredSkillKindOf(seq) {
  const m = MAGICS.find((x) => x.SEQUENCE === seq);
  if (!m) return null;
  const k = skillKindOfEx(m, { seq });
  if (k === 'heal' || k === 'heal-troop') return 'heal'; // 補兵＝给己方补员，与补血同为"己方增益"色
  if (k === 'strike' || k === 'aoe') return k;
  return null; // buff / summon / unknown
}

const before = [];
const after = [];
for (const em of EXPECT.magics) {
  const m = MAGICS.find((x) => x.SEQUENCE === em.seq);
  const oldKind = m.SEQUENCE === 1 ? 'heal' : m.SEQUENCE === 50 ? 'strike' : m.SEQUENCE === 104 ? 'aoe'
    : (m.ATTRIB ?? '').match(/補血|补血/) ? 'heal' : m.ATTACK >= 40 ? 'aoe' : 'strike';
  if (oldKind !== em.castKind) before.push(`#${em.seq} ${oldKind}≠${em.castKind}(${em.attrib})`);
  const nk = wiredSkillKindOf(em.seq);
  if (nk !== em.castKind) after.push(`#${em.seq} ${nk}≠${em.castKind}(${em.attrib})`);
}

console.log(`magic.castkind 接线前 ${before.length} 条：${before.join(', ')}`);
console.log(`magic.castkind 接线后 ${after.length} 条：${after.join(', ') || '（无）'}`);
if (after.length) process.exitCode = 1;
