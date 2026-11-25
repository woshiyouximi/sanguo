// UnitFrames 契约单测：用**真实** game/web/anim/units.json 验证按阵营取帧
// 需要先把 UnitFrames.ts 编成 CommonJS：见同目录 test_unitframes.ps1
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const OUT = 'F:/sanguo/work/cocos_battlevis/_ts/UnitFrames.js';
if (!fs.existsSync(OUT)) { console.error('missing ' + OUT); process.exit(2); }
const M = require(OUT);

const atlasPath = 'F:/sanguo/game/web/anim/units.json';
const atlas = JSON.parse(fs.readFileSync(atlasPath, 'utf8'));
const names = new Set((atlas.pages[0].sprites || []).map((s) => s.name));
const groups = atlas.groups;

let fail = 0;
const eq = (a, b, msg) => { if (JSON.stringify(a) !== JSON.stringify(b)) { console.error('FAIL ' + msg + ' got=' + JSON.stringify(a) + ' want=' + JSON.stringify(b)); fail++; } };
const ok = (cond, msg) => { if (!cond) { console.error('FAIL ' + msg); fail++; } };

ok(M.hasForceSchema(groups) === true, 'hasForceSchema(web units.json) === true');
ok(M.hasForceSchema({ archer: [] }) === false, 'hasForceSchema(纯数组组) === false');
ok(M.hasForceSchema(null) === false, 'hasForceSchema(null) === false');
ok(M.UNIT_HOLD === 5, 'UNIT_HOLD === 5');

for (const [troop, key] of Object.entries(M.GROUP_BY_TROOP)) {
  ok(!!groups[key], 'GROUP_BY_TROOP[' + troop + ']=' + key + ' 在 units.json.groups 里');
}

const hasFrame = (n) => names.has(n);
const rows = [];
for (let troop = 0; troop <= 12; troop++) {
  const a = M.pickUnitFrames(groups, troop, 'A', hasFrame);
  const b = M.pickUnitFrames(groups, troop, 'B', hasFrame);
  ok(!!a && !!b, 'troop ' + troop + ' 两侧都有帧');
  if (!a || !b) continue;
  const key = M.unitGroupOf(troop);
  eq(a.group, key, 'troop ' + troop + ' A group');
  eq(a.walk.length, groups[key].back.length, 'troop ' + troop + ' A walk 帧数 = back.length');
  eq(b.walk.length, groups[key].front.length, 'troop ' + troop + ' B walk 帧数 = front.length');
  eq(a.attack.length, (groups[key].attack || []).length, 'troop ' + troop + ' A attack 帧数');
  eq(b.attack.length, (groups[key].attackEnemy || groups[key].attack || []).length, 'troop ' + troop + ' B attack 帧数');
  ok(a.hold === (groups[key].hold || M.UNIT_HOLD), 'troop ' + troop + ' hold');
  ok(a.walk.every((n) => /_walk_\d+$/.test(n)), 'troop ' + troop + ' A 全是 M 走路帧（{g}_walk_NN）');
  ok(b.walk.every((n) => /_ewalk_\d+$/.test(n)), 'troop ' + troop + ' B 全是 N 走路帧（{g}_ewalk_NN）');
  ok(a.walk.every((n) => hasFrame(n)) && b.walk.every((n) => hasFrame(n)), 'troop ' + troop + ' 帧名都在页里');
  ok(a.walk.indexOf(b.walk[0]) === -1, 'troop ' + troop + ' A/B 帧集不相交（不同阵营 = 不同图）');
  rows.push([troop, key, a.walk.length, a.walk[0], b.walk[0], a.attack[0], b.attack[0]].join('\t'));
}

// 未知兵种 / 缺组要降级成 null，而不是抛
eq(M.pickUnitFrames(groups, 99, 'A', hasFrame), null, 'troop 99 走不到组 -> null');
eq(M.pickUnitFrames({}, 0, 'A', hasFrame), null, '空 groups -> null');
eq(M.pickUnitFrames(groups, 0, 'A', () => false), null, '帧名全不在页里 -> null');

console.log('troop\tgroup\twalkA\tA[0]\tB[0]\tAatk[0]\tBatk[0]');
console.log(rows.join('\n'));
console.log(fail === 0 ? '\nALL PASS' : '\nFAILURES: ' + fail);
process.exit(fail === 0 ? 0 : 1);
