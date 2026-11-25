/**
 * R113 契约：三条曾被标 `[推测]` 的技能音裁定 + 士兵行动间隔改回原作 40 帧。
 *
 * 证据全文（字节码地址/行号、排查清单、时长对拍）见 `project/113_技能音与士兵节奏.md`。
 *
 * 这里钉三件事：
 *   1. `magicSfxName()` 的**字符串路径**与表查表路径必须交出同一个串——
 *      视图层传进来的是 "m032snd01" 这种成品串，调试面板传的是 "43" 这种编号，
 *      两条路都绕开表就会漂。110 条逐一钉。
 *   2. 043 / 080 / 102 这三条曾经只有"目录存在+文件存在"的命名约定推测（证级 [X]），
 *      R113 用效果函数字节码直证后落定；值一旦回退成旧值，本文件必须红。
 *   3. `actionIntervalOf` 对主将/士兵分别返回什么。数值来源不是手感调参，是原作
 *      行动节奏计时器 `0x43B574` 到期复位 `[u+0x34] = 0x28`（40 帧）——
 *      主将更新器 `0x43E964`(0x43EB50) 与小队更新器 `0x43D125`(0x43D24B) 调的是同一个函数。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  MAGIC_SFX,
  MAGIC_SFX_GRADE,
  magicSfxGrade,
  magicSfxName,
} from '../src/core/audio_bus.ts';
import {
  ACTION_INTERVAL_TICKS,
  ATTACK_COOLDOWN,
  TICK_HZ,
  actionIntervalOf,
  createWorld,
} from '../src/core/battle.ts';
import type { Unit } from '../src/core/battle.ts';
import { loadData } from '../src/data.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const GAME = join(HERE, '..');
const AUDIO_JS = join(GAME, 'web', 'audio.js');
const data = loadData({ dir: new URL('../data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });

/** 从 game/web/audio.js 抽出浏览器端那份 MAGIC_SFX（普通 <script>，不能 import TS）。 */
function readAudioJsTable(): Record<string, string> {
  const src = readFileSync(AUDIO_JS, 'utf8');
  const body = /var MAGIC_SFX = \{([\s\S]*?)\n {2}\};/.exec(src);
  assert.ok(body, 'audio.js 里找不到 var MAGIC_SFX = { ... }');
  const out: Record<string, string> = {};
  for (const m of body![1].matchAll(/'(\d{3})':\s*'([^']+)'/g)) out[m[1]] = m[2];
  return out;
}

describe('R113 技能音：magicSfxName 与表逐条同源', () => {
  it('110 条键：magicSfxName("043") 与 magicSfxName(43) 都等于 MAGIC_SFX["043"]', () => {
    const keys = Object.keys(MAGIC_SFX).sort();
    assert.equal(keys.length, 110, '表必须是 110 条');
    const bad: Array<[string, string, string, string]> = [];
    for (const k of keys) {
      const want = MAGIC_SFX[k];
      // 字符串路径（视图层/调试面板传 "43"）
      const byStr = magicSfxName(String(Number(k)));
      // 数字路径（调用方传 number）
      const byNum = magicSfxName(Number(k));
      if (byStr !== want || byNum !== want) bad.push([k, want, byStr, byNum]);
    }
    assert.deepEqual(bad, [], '[键, 期望, 字符串路径, 数字路径] 不一致');
  });

  it('成品串原样透传：magicSfxName("m032snd01") === "m032snd01"（不二次查表）', () => {
    assert.equal(magicSfxName('m032snd01'), 'm032snd01');
    assert.equal(magicSfxName('M032SND01'), 'm032snd01', '大小写归一');
    // 未知编号给空串，不是抛错、也不是猜一个
    assert.equal(magicSfxName('999'), '');
    assert.equal(magicSfxName(999), '');
  });
});

describe('R113 三条 [X] → [A] 裁定', () => {
  // 每条：[技能号, 技能名, 最终值, 证据（magic_so.dis.txt 行号）]
  const RULINGS: Array<[string, string, string, string]> = [
    ['043', '狂雷天牢', 'm032snd01', 'Magic43>Sparkle>CreateSparkle 首条指令 PUSHS "m032snd01"（dis:24090/24092）'],
    ['080', '八卦奇陣', 'm029snd01', 'Magic94>Pa>CreatePa 首条指令 PUSHS "m029snd01"（dis:22417/22419）'],
    ['102', '集火柱', 'm031snd01', 'Magic107>FirePillar>CreateFirePillar PUSHS "m031snd01"（dis:23796/23798）'],
  ];

  for (const [seq, name, want, why] of RULINGS) {
    it(`${seq} ${name} = ${want}（${why}）`, () => {
      assert.equal(MAGIC_SFX[seq], want);
      assert.equal(magicSfxName(seq), want);
      // 证级：这三条已凭效果函数字节码直证，不再是命名约定推测
      assert.equal(MAGIC_SFX_GRADE[seq], 'A');
      assert.equal(magicSfxGrade(seq), 'A');
      assert.equal(magicSfxGrade(Number(seq)), 'A');
    });
  }

  it('全表 [X] 清零，三条旧值（m022snd01 / m021snd01）不再出现在这三键上', () => {
    assert.deepEqual(Object.keys(MAGIC_SFX_GRADE).filter((k) => MAGIC_SFX_GRADE[k] === 'X'), []);
    // 旧值来自"按 fx_dir_primary 命名约定猜"（043 的 dir022、102 的 dir021），已推翻
    assert.notEqual(MAGIC_SFX['043'], 'm022snd01', '043 的旧推测值');
    assert.notEqual(MAGIC_SFX['102'], 'm021snd01', '102 的旧推测值');
  });

  it('浏览器端 audio.js 的同三条与 TS 表一致（防两份漂移）', () => {
    const js = readAudioJsTable();
    for (const [seq, , want] of RULINGS) assert.equal(js[seq], want, `audio.js ${seq}`);
    assert.deepEqual(js, { ...MAGIC_SFX }, '整表逐条一致');
  });
});

describe('R113 士兵行动间隔：原作 40 帧（不是手感 120）', () => {
  it('常量锁：ACTION_INTERVAL_TICKS = ATTACK_COOLDOWN = 40 tick', () => {
    // 依据：原作 `0x43B5DE mov dword ptr [ecx+0x34], 0x28`（work/dis_battle_units.txt:1624）
    // 该函数 0x43B574 无兵种分支；主将 0x43E964→0x43EB50、小队 0x43D125→0x43D24B 都调它。
    assert.equal(ACTION_INTERVAL_TICKS, 40, '主将行动间隔');
    assert.equal(ATTACK_COOLDOWN, 40, '士兵行动间隔（旧值 120 无原作依据，是原型手感值）');
    assert.equal(ATTACK_COOLDOWN, ACTION_INTERVAL_TICKS, '主将/士兵原作共用同一计时器');
    // R192：TICK_HZ 30→60（原作实测 66–79 Hz，取 60 最保守）⇒ 40 帧 = 0.667 秒出手一次。
    // 旧断言是 4/3 秒（40/30）—— 那是把 40 tick 按 30 Hz 换算出来的 2 倍慢，见 project/190 p5。
    assert.equal(TICK_HZ, 60);
    assert.ok(Math.abs(ATTACK_COOLDOWN / TICK_HZ - 2 / 3) < 1e-9);
  });

  it('actionIntervalOf：实战世界里的主将与士兵都返回 40', () => {
    const w = createWorld({ data, seed: 1, a: { troop: 2 }, b: { troop: 10 } });
    const generals = w.units.filter((u: Unit) => u.isGeneral === true);
    const soldiers = w.units.filter((u: Unit) => u.isGeneral !== true && u.alive);
    assert.equal(generals.length, 2, '双方各一个主将');
    assert.ok(soldiers.length >= 12, `士兵数应 ≥12，实际 ${soldiers.length}`);
    for (const g of generals) assert.equal(actionIntervalOf(g), 40, '主将');
    for (const s of soldiers) assert.equal(actionIntervalOf(s), 40, '士兵');
  });

  it('两个常量分开留着，是因为证据链不同（改一个不许搭另一个的便车）', () => {
    // 主将：0x43B574 硬编码 0x28 直证；士兵：0x43D125 在 0x43D24B 复用同一函数间接证。
    // 若有人把它们合并成一个常量，本测试仍在，但语义会丢；这里锁住"两个都读得到"。
    assert.equal(typeof ACTION_INTERVAL_TICKS, 'number');
    assert.equal(typeof ATTACK_COOLDOWN, 'number');
    const w = createWorld({ data, seed: 2, a: { troop: 4 }, b: { troop: 4 } });
    const gen = w.units.find((u: Unit) => u.isGeneral === true)!;
    const sol = w.units.find((u: Unit) => u.isGeneral !== true)!;
    assert.equal(actionIntervalOf(gen), ACTION_INTERVAL_TICKS);
    assert.equal(actionIntervalOf(sol), ATTACK_COOLDOWN);
  });
});
