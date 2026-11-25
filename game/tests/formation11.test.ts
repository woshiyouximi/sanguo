/**
 * R28：阵形相克表 9×9 → 11×11（補亂陣）。跑法：
 *   cd F:\sanguo\game
 *   node --test tests/formation11.test.ts
 *
 * 原作 0x0048D2A0 是 11×11（stride 0x2C），第 10 行/列是亂陣：
 * 亂陣对任何阵 -25、任何阵对亂陣 +25——"不布阵就挨打"。
 * 玩家永远选不到亂陣（names / playable 仍是 9），它只作为矩阵的一维参与相克。
 *
 * 这里钉的是**数据形状 + 与 battle.ts 的接口**，不改 battle.ts：
 * formationBonus 用 matrix[a]?.vs[b] ?? 0，越界回 0（不崩），所以 11 维可以直接喂进去。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadData, EXPECT } from '../src/data.ts';
import { formationBonus } from '../src/core/battle.ts';

const data = loadData();
const forms = data.formations;
const rows = forms.matrix.map((r) => r.vs);
const LUAN = 10; // 亂陣下标；9 是特殊阵型

/** 原作 0x0048D2A0 的 11×11（docs/04b §3.3），逐格抄下来当金标准 */
const EXE11 = [
  [0, 7, -18, 19, 13, -6, 23, -23, -15, 7, 25],
  [-7, 0, -12, 22, 21, 6, 12, -24, -18, -6, 25],
  [18, 12, 0, -19, -11, 25, -25, -7, 6, 8, 25],
  [-19, -22, 19, 0, -5, -11, 3, 15, 20, -5, 25],
  [-13, -21, 11, 5, 0, -18, -6, 24, 19, -5, 25],
  [6, -6, -25, 11, 18, 0, 23, -10, -17, 6, 25],
  [-23, -12, 25, -3, 6, -23, 0, 14, 15, -6, 25],
  [23, 24, 7, -15, -24, 10, -14, 0, -12, 7, 25],
  [15, 18, -6, -20, -19, 17, -15, 12, 0, -6, 25],
  [-7, 6, -8, 5, 5, -6, 6, -7, 6, 0, 25],
  [-25, -25, -25, -25, -25, -25, -25, -25, -25, -25, 0],
];

test('矩阵尺寸是 11×11：11 行、每行 11 列', () => {
  assert.equal(forms.matrix.length, 11, '矩阵应 11 行');
  for (let i = 0; i < 11; i += 1) {
    assert.equal(rows[i]!.length, 11, `第 ${i} 行应 11 列`);
  }
  // 每格都是 ±25 内的整数（原作表的取值范围）
  for (let i = 0; i < 11; i += 1) {
    for (let j = 0; j < 11; j += 1) {
      const v = rows[i]![j]!;
      assert.ok(Number.isInteger(v) && v >= -25 && v <= 25, `[${i}][${j}] = ${v} 越界`);
    }
  }
});

test('矩阵与 docs/04b §3.3 的 EXE 11×11 逐格相同', () => {
  assert.deepEqual(rows, EXE11);
  assert.deepEqual(
    forms.matrix.map((r) => r.name),
    (forms as unknown as { matrix_names: string[] }).matrix_names,
    '行名应与 matrix_names 对齐',
  );
});

test('反对称 + 对角为 0（11×11 全表）', () => {
  for (let i = 0; i < 11; i += 1) {
    assert.equal(rows[i]![i], 0, `对角 [${i}][${i}] 应为 0`);
    for (let j = 0; j < 11; j += 1) {
      assert.equal(rows[i]![j]! + rows[j]![i]!, 0, `[${i}][${j}] 与 [${j}][${i}] 不对称`);
    }
  }
});

test('亂陣行全 -25、亂陣列全 +25（對自己 0）', () => {
  for (let j = 0; j < 11; j += 1) {
    if (j === LUAN) {
      assert.equal(rows[LUAN]![j], 0, '亂陣对亂陣应为 0');
    } else {
      assert.equal(rows[LUAN]![j], -25, `亂陣对 ${j} 应为 -25`);
    }
  }
  for (let i = 0; i < 11; i += 1) {
    if (i !== LUAN) assert.equal(rows[i]![LUAN], 25, `${i} 对亂陣应为 +25`);
  }
});

test('formationBonus(亂陣 vs 任一阵) = -25，反向 +25；越界回 0', () => {
  for (let f = 0; f < 9; f += 1) {
    assert.equal(formationBonus(data, LUAN, f), -25, `亂陣 vs ${forms.names[f]} 应为 -25`);
    assert.equal(formationBonus(data, f, LUAN), 25, `${forms.names[f]} vs 亂陣 应为 +25`);
  }
  assert.equal(formationBonus(data, LUAN, LUAN), 0, '亂陣 vs 亂陣 应为 0');
  // battle.ts 用 matrix[a]?.vs[b] ?? 0，越界不会崩，直接 0（所以不用改它）
  assert.equal(formationBonus(data, 11, 0), 0);
  assert.equal(formationBonus(data, 0, 11), 0);
  assert.equal(formationBonus(data, 99, 99), 0);
  assert.equal(formationBonus(data, -1, 3), 0);
});

test('玩家可选阵仍是 9 个：亂陣不进 names，也不进 deploy 的阵形列表', () => {
  assert.equal(forms.names.length, EXPECT.formations);
  assert.equal((forms as unknown as { playable: number }).playable, 9);
  assert.deepEqual(forms.names, ['方形', '圆形', '锥形', '雁形', '玄襄', '鱼丽', '钩形', '冲锋', '箭矢']);
  assert.ok(!forms.names.includes('乱阵'), '亂陣不能出现在 names 里（原作玩家选不到）');
  const mnames = (forms as unknown as { matrix_names: string[] }).matrix_names;
  assert.equal(mnames.length, 11);
  assert.equal(mnames[LUAN], '乱阵');
  assert.equal(mnames[9], '特殊阵型');
  // 列表 = names.slice(0, playable)：乱阵 不在其中
  assert.ok(!mnames.slice(0, 9).includes('乱阵'));
});

test('game/data/formations.json 与 data/formations.json 内容一致', () => {
  const a = readFileSync(new URL('../../data/formations.json', import.meta.url), 'utf8');
  const b = readFileSync(new URL('../data/formations.json', import.meta.url), 'utf8');
  assert.equal(a, b, '两份 formations.json 必须同源同内容');
  const parsed = JSON.parse(b) as { matrix: { vs: number[] }[] };
  assert.equal(parsed.matrix.length, 11);
});
