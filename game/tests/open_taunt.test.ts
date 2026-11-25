/**
 * 開場叫陣（`src/core/open_taunt.ts`）的单测。
 *
 * 口径全部对着 `syso_host.ts:1288-1372` 的实装：
 *   - `CallLine` 看 near（loc5），`AnswerLine` 看 far（loc6），只有 `far===2` 才回看 near；
 *   - 编号区间 300..409，两句撞号要重抽（最多 64 次）；
 *   - `?taunt=0` 关闭、holdTicks 夹取、尾码/占位符替换；
 *   - 台詞表 110 条完整、关键编号逐字对齐（防止手抄漏行）。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  answerLine,
  buildTauntSeq,
  callLine,
  clampHoldTicks,
  fillTauntText,
  makeTauntRng,
  regionFromCamera,
  screenRegion,
  TAUNT_HOLD_MAX,
  TAUNT_HOLD_MIN,
  TAUNT_HOLD_TICKS,
  TAUNT_MAX_REROLL,
  TAUNT_MSG_MAX,
  TAUNT_MSG_MIN,
  TAUNT_TEXT,
  tauntEnabled,
  type TauntLine,
} from '../src/core/open_taunt.ts';

/** 脚本化乱数：记录每次 (min,max)，按给定序列回值（用尽后回 min）。 */
function scripted(values: number[]) {
  let i = 0;
  const calls: Array<[number, number]> = [];
  const rand = (min: number, max: number): number => {
    calls.push([min, max]);
    const v = values[i];
    i += 1;
    return v === undefined ? min : v;
  };
  return { rand, calls };
}

describe('screenRegion / regionFromCamera：0x206 分区', () => {
  it('忠实照抄 75/90 阈值：屏内 2、边线 1、出屏 0', () => {
    assert.equal(screenRegion(0, 0), 2);
    assert.equal(screenRegion(74, 74), 2);
    assert.equal(screenRegion(74, 89), 1);
    assert.equal(screenRegion(75, 0), 1);
    assert.equal(screenRegion(0, 75), 1);
    assert.equal(screenRegion(89, 89), 1);
    assert.equal(screenRegion(90, 0), 0);
    assert.equal(screenRegion(0, 90), 0);
    assert.equal(screenRegion(200, 200), 0);
    assert.equal(screenRegion(Number.NaN, 10), 0);
  });

  it('重制版相机代理：3.74 / 7.43 行两档，越远越出屏', () => {
    assert.equal(regionFromCamera(40, 40), 2);
    assert.equal(regionFromCamera(43.7, 40), 2);
    assert.equal(regionFromCamera(43.8, 40), 1);
    assert.equal(regionFromCamera(40, 32.6), 1);
    assert.equal(regionFromCamera(40, 32.5), 0);
    assert.equal(regionFromCamera(Number.NaN, 40), 0);
  });
});

describe('CallLine：第一段（敌将叫阵，看 loc5）', () => {
  it('near=0 掷 0 → 300..319，并检查闭区间实参', () => {
    const s = scripted([0, 305]);
    assert.equal(callLine(0, 2, s.rand), 305);
    assert.deepEqual(s.calls, [[0, 1], [300, 319]]);
  });

  it('near=0 掷 1 → 380..399', () => {
    const s = scripted([1, 390]);
    assert.equal(callLine(0, 2, s.rand), 390);
    assert.deepEqual(s.calls, [[0, 1], [380, 399]]);
  });

  it('near=1 → 320..339 / 380..399 二选一', () => {
    const s = scripted([0, 333]);
    assert.equal(callLine(1, 0, s.rand), 333);
    assert.deepEqual(s.calls, [[0, 1], [320, 339]]);
    const t = scripted([1, 381]);
    assert.equal(callLine(1, 2, t.rand), 381);
  });

  it('near=2 & far=0 → 340..359 / 380..399 二选一（far=0 不再看三选）', () => {
    const s = scripted([0, 350]);
    assert.equal(callLine(2, 0, s.rand), 350);
    assert.deepEqual(s.calls, [[0, 1], [340, 359]]);
    const t = scripted([1, 399]);
    assert.equal(callLine(2, 0, t.rand), 399);
  });

  it('near=2 & far!=0 → 三选：340..359 / 380..399 / 360..379', () => {
    const a = scripted([0, 345]);
    assert.equal(callLine(2, 1, a.rand), 345);
    assert.deepEqual(a.calls, [[0, 2], [340, 359]]);
    const b = scripted([1, 388]);
    assert.equal(callLine(2, 2, b.rand), 388);
    assert.deepEqual(b.calls, [[0, 2], [380, 399]]);
    const c = scripted([2, 370]);
    assert.equal(callLine(2, 2, c.rand), 370);
    assert.deepEqual(c.calls, [[0, 2], [360, 379]]);
  });

  it('near 异常值回 0 且不消耗乱数（照 syso_host 的兜底）', () => {
    const s = scripted([9, 9]);
    assert.equal(callLine(3, 0, s.rand), 0);
    assert.deepEqual(s.calls, []);
  });
});

describe('AnswerLine：第二段（我将接话，看 loc6）', () => {
  it('far=0 → 300..319 / 380..399 / 400..409 三选', () => {
    const a = scripted([0, 301]);
    assert.equal(answerLine(0, 0, a.rand), 301);
    assert.deepEqual(a.calls, [[0, 2], [300, 319]]);
    const b = scripted([1, 395]);
    assert.equal(answerLine(0, 0, b.rand), 395);
    assert.deepEqual(b.calls, [[0, 2], [380, 399]]);
    const c = scripted([2, 405]);
    assert.equal(answerLine(0, 0, c.rand), 405);
    assert.deepEqual(c.calls, [[0, 2], [400, 409]]);
  });

  it('far=1 → 320..339 / 380..399 / 400..409，且无视 near', () => {
    const a = scripted([0, 325]);
    assert.equal(answerLine(2, 1, a.rand), 325);
    assert.deepEqual(a.calls, [[0, 2], [320, 339]]);
    const b = scripted([2, 407]);
    assert.equal(answerLine(2, 1, b.rand), 407);
  });

  it('far=2 & near=0 → 340..359 / 380..399 / 400..409', () => {
    const s = scripted([0, 342]);
    assert.equal(answerLine(0, 2, s.rand), 342);
    assert.deepEqual(s.calls, [[0, 2], [340, 359]]);
  });

  it('far=2 & near!=0 → 四选，含 360..379 与 400..409', () => {
    const a = scripted([2, 366]);
    assert.equal(answerLine(1, 2, a.rand), 366);
    assert.deepEqual(a.calls, [[0, 3], [360, 379]]);
    const b = scripted([3, 409]);
    assert.equal(answerLine(2, 2, b.rand), 409);
    assert.deepEqual(b.calls, [[0, 3], [400, 409]]);
    const c = scripted([0, 344]);
    assert.equal(answerLine(2, 2, c.rand), 344);
  });

  it('far 异常值回 0 且不消耗乱数', () => {
    const s = scripted([9]);
    assert.equal(answerLine(1, 7, s.rand), 0);
    assert.deepEqual(s.calls, []);
  });
});

describe('buildTauntSeq：序列编排', () => {
  const table: Record<number, string> = {
    300: '我乃%s1%是也！%k%%e%',
    301: '反賊%S2%，準備受死吧！%K%%E%',
  };

  it('先 B（敌将）后 A（我将），两句不同、holdTicks 默认 90', () => {
    // near=0/far=0：CallLine 掷 0 → rand(300,319)=300；
    // AnswerLine 第 1 次掷 0 → 300（撞号），第 2 次掷 0 → 301。
    const s = scripted([0, 300, 0, 300, 0, 301]);
    const seq = buildTauntSeq({
      near: 0,
      far: 0,
      rand: s.rand,
      textTable: table,
      aName: '張飛',
      bName: '曹操',
    });
    assert.equal(seq.length, 2);
    assert.deepEqual(seq.map((l) => l.side), ['B', 'A']);
    assert.deepEqual(seq.map((l) => l.msgId), [300, 301]);
    assert.equal(seq[0].holdTicks, TAUNT_HOLD_TICKS);
    assert.equal(seq[1].holdTicks, TAUNT_HOLD_TICKS);
    assert.equal(seq[0].text, '我乃曹操是也！');
    assert.equal(seq[1].text, '反賊曹操，準備受死吧！');
    for (const line of seq) {
      assert.ok(line.msgId >= TAUNT_MSG_MIN && line.msgId <= TAUNT_MSG_MAX);
    }
  });

  it('撞号时按原作重抽；这里把上限锁成 64 次后仍允许同号', () => {
    const always = scripted([]); // 用尽后恒回 min ⇒ CallLine/AnswerLine 恒 300
    const seq = buildTauntSeq({ near: 0, far: 0, rand: always.rand, textTable: table });
    assert.equal(seq[0].msgId, 300);
    assert.equal(seq[1].msgId, 300);
    // CallLine 2 次 + 首次 AnswerLine 2 次 + 64 次重抽 × 2
    assert.equal(always.calls.length, 2 + 2 * (1 + TAUNT_MAX_REROLL));
  });

  it('enabled=false 返回空序列，且不消耗乱数（?taunt=0）', () => {
    const s = scripted([0, 300]);
    assert.deepEqual(buildTauntSeq({ near: 0, far: 0, enabled: false, rand: s.rand }), []);
    assert.deepEqual(s.calls, []);
  });

  it('同 seed 同序列；默认文本表能填出文字', () => {
    const a = buildTauntSeq({ near: 2, far: 0, seed: 42, aName: '張飛', bName: '曹操' });
    const b = buildTauntSeq({ near: 2, far: 0, seed: 42, aName: '張飛', bName: '曹操' });
    assert.deepEqual(a.map((l) => l.msgId), b.map((l) => l.msgId));
    for (const line of a) assert.ok(line.text.length > 0, `MSG${line.msgId} 文本为空`);
    const c = buildTauntSeq({ near: 0, far: 0, seed: 42 });
    assert.equal(c.length, 2);
  });

  it('自定义 holdTicks 会夹到 [30,300]', () => {
    const lo = buildTauntSeq({ near: 0, far: 0, seed: 1, holdTicks: 1 });
    const hi = buildTauntSeq({ near: 0, far: 0, seed: 1, holdTicks: 10000 });
    const mid = buildTauntSeq({ near: 0, far: 0, seed: 1, holdTicks: 123.6 });
    assert.deepEqual(lo.map((l: TauntLine) => l.holdTicks), [TAUNT_HOLD_MIN, TAUNT_HOLD_MIN]);
    assert.deepEqual(hi.map((l) => l.holdTicks), [TAUNT_HOLD_MAX, TAUNT_HOLD_MAX]);
    assert.deepEqual(mid.map((l) => l.holdTicks), [124, 124]);
  });
});

describe('tauntEnabled / clampHoldTicks', () => {
  it('?taunt=0 关，缺省开', () => {
    assert.equal(tauntEnabled(null), true);
    assert.equal(tauntEnabled(undefined), true);
    assert.equal(tauntEnabled('1'), true);
    assert.equal(tauntEnabled(''), true);
    assert.equal(tauntEnabled('0'), false);
    assert.equal(tauntEnabled('off'), false);
    assert.equal(tauntEnabled('FALSE'), false);
    assert.equal(tauntEnabled('no'), false);
  });

  it('非法/越界 holdTicks', () => {
    assert.equal(clampHoldTicks(undefined), 90);
    assert.equal(clampHoldTicks(Number.NaN), 90);
    assert.equal(clampHoldTicks(0), 30);
    assert.equal(clampHoldTicks(29.4), 30);
    assert.equal(clampHoldTicks(90.4), 90);
    assert.equal(clampHoldTicks(999), 300);
  });
});

describe('fillTauntText：尾码与占位符', () => {
  it('剥 %k%%e% / %K%%E%，替换 %s1% / %S1% / %S2%', () => {
    assert.equal(fillTauntText('我乃%s1%是也！%k%%e%', '張飛', '曹操'), '我乃張飛是也！');
    assert.equal(
      fillTauntText('反賊%S2%，早早投降可以免你一死！%K%%E%', '張飛', '曹操'),
      '反賊曹操，早早投降可以免你一死！',
    );
    assert.equal(fillTauntText('%S1%在此，誰敢與我一決死戰！%K%%E%', '關羽', ''), '關羽在此，誰敢與我一決死戰！');
    assert.equal(fillTauntText('', '張飛', '曹操'), '');
  });
});

describe('TAUNT_TEXT：MSG300-409 完整性', () => {
  it('恰好 110 条、编号连续且非空', () => {
    const ids = Object.keys(TAUNT_TEXT).map(Number).sort((a, b) => a - b);
    assert.equal(ids.length, 110);
    assert.equal(ids[0], 300);
    assert.equal(ids[ids.length - 1], 409);
    for (let id = 300; id <= 409; id += 1) {
      assert.equal(typeof TAUNT_TEXT[id], 'string');
      assert.ok(TAUNT_TEXT[id].length > 0, `MSG${id} 为空`);
    }
  });

  it('关键编号逐字对齐 docs/03d 与 message.json', () => {
    assert.equal(TAUNT_TEXT[300], '我乃%s1%是也！%k%%e%');
    assert.equal(TAUNT_TEXT[301], '和我%S1%交手是你一生最大的錯誤！%K%%E%');
    assert.equal(TAUNT_TEXT[319], '反賊，還不快快下馬受縛！%K%%E%');
    assert.equal(TAUNT_TEXT[339], '和我%S1%交手是你一生最大的錯誤！%K%%E%');
    assert.equal(TAUNT_TEXT[358], '我乃%s1%是也！%k%%e%');
    assert.equal(TAUNT_TEXT[359], '我是%S1%，來比試一下吧！%K%%E%');
    assert.equal(TAUNT_TEXT[360], '完了！完了！搞不好今天要死在這裡了！！%K%%E%');
    assert.equal(TAUNT_TEXT[379], '真糟糕，我的運氣實在不好！%K%%E%');
    assert.equal(TAUNT_TEXT[380], '誰敢和我%S1%交手！%K%%E%');
    assert.equal(TAUNT_TEXT[398], '誰敢和我%S1%交手！%K%%E%');
    assert.equal(TAUNT_TEXT[399], '敢和我%S1%交手？來吧！%K%%E%');
    assert.equal(TAUNT_TEXT[400], '別廢話多說，一決勝負吧！%K%%E%');
    assert.equal(TAUNT_TEXT[409], '只動嘴巴是不會贏的，來吧！%K%%E%');
  });
});

describe('makeTauntRng：闭区间与可复现', () => {
  it('同 seed 同序列，且永远落在 [min,max] 内', () => {
    const a = makeTauntRng(7);
    const b = makeTauntRng(7);
    for (let i = 0; i < 500; i += 1) {
      const va = a(300, 409);
      const vb = b(300, 409);
      assert.equal(va, vb);
      assert.ok(va >= 300 && va <= 409);
      assert.equal(Number.isInteger(va), true);
    }
    const c = makeTauntRng(8);
    const seqA = Array.from({ length: 32 }, () => a(0, 1)).join('');
    const seqC = Array.from({ length: 32 }, () => c(0, 1)).join('');
    assert.notEqual(seqA, seqC);
  });

  it('min===max 与反序入参都不炸', () => {
    const r = makeTauntRng(1);
    assert.equal(r(5, 5), 5);
    const v = r(9, 3);
    assert.ok(v >= 3 && v <= 9);
  });
});

