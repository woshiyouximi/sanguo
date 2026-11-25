/**
 * R68 武将技 / 军师技学习门槛 —— 运行期流程（升级触发 / 月末触发 / 存档往返）。
 *
 * 口径来源：`docs/04b_战斗系统.md:61-63`（`+0x54` 已学武将技 8 槽 / `+0x5C` 已学军师技 8 槽 /
 * `+0x65`、`+0x75` 学习表）、`:572`（`0x40A183` / `0x40A227` 补学 + 「學會新的武將技」提示）、
 * `:637`（「等級到了自動學會，無需技能樹」）、`docs/03a-武将技表MAGIC.md:477`（第一列上界 41 级）。
 *
 * 纯函数在 `src/core/unlock.ts`（`createLearnState` / `pendingLearn` / `learnable` / `applyLearn` /
 * `onLevelUp` / `monthlyLearnCheck`）；这里只验证「流程」以及它与既有 `capture.ts` 补学报告的一致性。
 * 跑法：cd F:\sanguo\game && node --test tests/skills_r68.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../src/data.ts';
import { knownMagicOf, learnedAtLevelUp } from '../src/core/capture.ts';
import {
  LEARN_MAX_LEVEL,
  MAGIC_SLOTS,
  applyLearn,
  createLearnState,
  learnTableOf,
  monthlyLearnCheck,
  onLevelUp,
  pendingLearn,
} from '../src/core/unlock.ts';
import type { PendingLearn } from '../src/core/unlock.ts';

const data = loadData({ dir: new URL('../data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });

/** 从结里取出序号（保持顺序） */
const seqs = (list: PendingLearn[]): number[] => list.map((p) => p.seq);
/** 从结里取出技名（保持顺序） */
const names = (list: PendingLearn[]): string[] => list.map((p) => p.name);

test('R68 升级流程：關羽 1→6→11→17 逐级只补 (旧,新] 这一段', () => {
  const st = createLearnState(data, '關羽', 1);
  monthlyLearnCheck(st); // 开局补学：1 级那两条
  assert.deepEqual(seqs(pendingLearn(st)), []);
  assert.deepEqual(st.magic, [50]);
  assert.deepEqual(st.wise, [8]);

  const lv6 = onLevelUp(st, 1, 6);
  assert.deepEqual(seqs(lv6), [63, 16]);

  const lv11 = onLevelUp(st, 6, 11);
  assert.deepEqual(seqs(lv11), [69]);
  assert.equal(lv11[0]!.kind, 'magic');

  const lv17 = onLevelUp(st, 11, 17);
  assert.deepEqual(seqs(lv17), [22, 77], '12 级军师技与 17 级武将技一起跨过');

  assert.deepEqual(st.magic, [50, 63, 69, 77], '17 级已学 4 条武将技');
  assert.deepEqual(st.wise, [8, 16, 22], '17 级已学 3 条军师技（19 级那条还没到）');
  assert.equal(st.level, 17);

  // 名字必须与 magics.json / wises.json 一致（提示语「學會新的武將技:%s」用这份名字）
  for (const p of [...lv6, ...lv11, ...lv17]) {
    const def =
      p.kind === 'magic'
        ? data.magics.find((m) => m.SEQUENCE === p.seq)
        : data.wises.find((w) => w.SEQUENCE === p.seq);
    assert.ok(def, `序号 ${p.seq} 在数据里不存在`);
    assert.equal(p.name, def.NAME);
  }
  assert.deepEqual(names(lv6), [
    data.magics.find((m) => m.SEQUENCE === 63)!.NAME,
    data.wises.find((w) => w.SEQUENCE === 16)!.NAME,
  ]);
});

test('R68 与 capture.learnedAtLevelUp 逐将逐级一致（升级补学的既有报告口径）', () => {
  let compared = 0;
  for (const g of data.generals) {
    for (let lo = 1; lo < LEARN_MAX_LEVEL; lo++) {
      const hi = lo + 1;
      const got = onLevelUp(createLearnState(data, g.NAME, 1), lo, hi);
      const want = learnedAtLevelUp(data, g.NAME, lo, hi);
      const gotMagic = got.filter((p) => p.kind === 'magic').map((p) => p.seq).sort((a, b) => a - b);
      const wantMagic = want.filter((p) => p.kind === 'magic').map((p) => p.seq).sort((a, b) => a - b);
      assert.deepEqual(gotMagic, wantMagic, `${g.NAME} 武将技 ${lo}→${hi}`);
      // capture 的军师技按 NAME 去重，这里也按名字集合比
      const gotWise = [...new Set(got.filter((p) => p.kind === 'wise').map((p) => p.name))].sort();
      const wantWise = [...new Set(want.filter((p) => p.kind === 'wise').map((p) => p.name))].sort();
      assert.deepEqual(gotWise, wantWise, `${g.NAME} 军师技 ${lo}→${hi}`);
      compared++;
    }
  }
  assert.equal(compared, data.generals.length * (LEARN_MAX_LEVEL - 1));
});

test('R68 与 capture.knownMagicOf 一致：41 级整表已学、1 级只学第一行', () => {
  for (const g of data.generals) {
    const table = learnTableOf(data, g.NAME, 'SKILL');
    const st41 = createLearnState(data, g.NAME, LEARN_MAX_LEVEL);
    monthlyLearnCheck(st41);
    assert.deepEqual(st41.magic, knownMagicOf(data, g.NAME, LEARN_MAX_LEVEL), `${g.NAME} 41 级武将技`);
    assert.deepEqual([...st41.magic].sort((a, b) => a - b), table.map((r) => r.seq).sort((a, b) => a - b));

    const st1 = createLearnState(data, g.NAME, 1);
    monthlyLearnCheck(st1);
    assert.deepEqual(st1.magic, knownMagicOf(data, g.NAME, 1), `${g.NAME} 1 级武将技`);
    assert.deepEqual(
      seqs(pendingLearn(st1)),
      [],
      `${g.NAME} 1 级补学后不该还有待学（1 级以前的表行不存在）`,
    );
  }
});

test('R68 上界：41 级学满后不再有新技，42 级也一样', () => {
  let maxRowLevel = 0;
  for (const g of data.generals) {
    for (const row of [...learnTableOf(data, g.NAME, 'SKILL'), ...learnTableOf(data, g.NAME, 'WISESKILL')]) {
      if (row.level > maxRowLevel) maxRowLevel = row.level;
    }
    const st = createLearnState(data, g.NAME, LEARN_MAX_LEVEL + 1);
    monthlyLearnCheck(st); // 先补学，之后 42 级不该再有新技
    assert.equal(pendingLearn(st).length, 0, `${g.NAME} 42 级不该有待学`);
    assert.equal(st.magic.length, learnTableOf(data, g.NAME, 'SKILL').length);
  }
  assert.equal(maxRowLevel, LEARN_MAX_LEVEL);
});

test('R68 两个触发点同状态幂等：升级补过的，月末不会重复发', () => {
  const st = createLearnState(data, '關羽', 1);
  monthlyLearnCheck(st);
  assert.deepEqual(seqs(onLevelUp(st, 1, 22)), [63, 16, 69, 22, 77, 32, 84], '按习得等级排：同级武将技在前');
  assert.equal(st.level, 22);
  assert.equal(st.magic.length, MAGIC_SLOTS - 3, '22 级 5 条武将技');
  assert.deepEqual(monthlyLearnCheck(st), [], '月末无漏学');
  assert.deepEqual(onLevelUp(st, 22, 22), [], '同级重复触发不发');
});

test('R68 存档往返：只存已学序号，重建后状态一致且不重复补', () => {
  const st = createLearnState(data, '關羽', 22);
  monthlyLearnCheck(st);
  const saved = { magic: [...st.magic], wise: [...st.wise] };
  const back = createLearnState(data, '關羽', 22, saved);
  assert.deepEqual(back.magic, st.magic);
  assert.deepEqual(back.wise, st.wise);
  assert.deepEqual(pendingLearn(back), []);
  assert.deepEqual(monthlyLearnCheck(back), []);
  // 坏存档：序号重复/越界/表外，也不能崩
  const dirty = createLearnState(data, '關羽', 22, { magic: [50, 50, 999], wise: [8, 8, -3] });
  assert.deepEqual(dirty.magic, [50, 999]);
  assert.deepEqual(dirty.wise, [8]);
});

test('R68 同名三档军师技：各占一条（表最多 8 条 = 8 槽），出征页去重是另一层', () => {
  // 大喬 WISESKILL 里「喝阻敵軍」出现两次（14 级 20 / 35 级 48），原作表就是按行存
  const table = learnTableOf(data, '大喬', 'WISESKILL');
  const drink = table.filter((r) => r.name === '喝阻敵軍');
  assert.equal(drink.length, 2);
  assert.deepEqual(drink.map((r) => r.level), [14, 35]);

  const st = createLearnState(data, '大喬', LEARN_MAX_LEVEL);
  monthlyLearnCheck(st);
  assert.ok(st.wise.includes(20) && st.wise.includes(48), '两档都进已学表');
  assert.equal(st.wise.length, table.length);
  assert.ok(st.wise.length <= 8, '表最多 8 条，正好不超 8 槽');
});

test('R68 学习表覆盖：401 名武将的武将技 2061 行、军师技 1567 行，全部能学', () => {
  let magicRows = 0;
  let wiseRows = 0;
  for (const g of data.generals) {
    const magic = learnTableOf(data, g.NAME, 'SKILL');
    const wise = learnTableOf(data, g.NAME, 'WISESKILL');
    assert.deepEqual(
      magic.map((r) => r.level),
      [...magic.map((r) => r.level)].sort((a, b) => a - b),
      `${g.NAME} 武将技表要按等级升序`,
    );
    assert.deepEqual(
      wise.map((r) => r.level),
      [...wise.map((r) => r.level)].sort((a, b) => a - b),
      `${g.NAME} 军师技表要按等级升序`,
    );
    magicRows += magic.length;
    wiseRows += wise.length;
  }
  assert.equal(magicRows, 2061);
  assert.equal(wiseRows, 1567);
});
