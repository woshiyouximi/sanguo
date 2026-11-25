/**
 * R52 / R79 / R80 的回归测试：脚本音效与特效事件真的走出 VM、进到 sink。
 *
 * 背景：R52 之前 `MAGIC.SO` 里的 `0x301/0x300`（音效）、`0x12F`（亮度）、`0x131`（闪白）
 * 只在 `SkillRun` 里记一行日志，`game/web/audio.js` 从没被调过 —— 88 个脚本发声点在页面上是静音的。
 * 这组测试用**假 sink** 断言"事件序列"，不依赖浏览器，也不依赖 mp3 真的能解码。
 *
 * 覆盖：
 *   - R52：字节码音效（含 3D）、音量 0..255 折算、闪白/亮度、别名兜底、sink 抛错隔离；
 *   - R79：`SYSTEM.SO` 里 4 个最便宜的原生函数（亮度 / 大将阵亡 / 载入战场地图）；`AllRush`
 *     自 R137 起搬进 `core/syso_host.ts`（它要写 `world.rush`），这里验它的宿主通道；
 *   - R80：战场六类触发（命中 / 受击 / 格挡 / 阵亡 / 撤退 / 撤离出场）。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { loadData } from '../src/data.ts';
// m4：默认待機后旧测试要显式下令。
import { engage } from './_engage.ts';
import { createWorld, requestRetreat, step, type World } from '../src/core/battle.ts';
import { createBattleSysoHost, runSkill } from '../src/core/smartscript/runtime.ts';
import {
  BATTLE_MAP_AMBIENT,
  BATTLE_MAP_AMBIENT_OF,
  SYSTEM_SO_IMPLEMENTED,
  audioBrightnessLevel,
  audioBusStats,
  audioEvents,
  battleAudioEvents,
  battleAudioMark,
  callSystemSo,
  emitMagic,
  emitSfx,
  normalizeSfxName,
  resetAudioBus,
  setAudioSink,
  volume255,
  type AudioEvent,
  type BattleAudioMark,
} from '../src/core/audio_bus.ts';

const data = loadData();

/** 音频包里的真实资源键（`emitSfx` 发出去的名字必须都能在这里找到）。 */
const AUDIO_INDEX = JSON.parse(
  readFileSync(new URL('../web/assets/audio/index.json', import.meta.url), 'utf8'),
) as { sfx: Record<string, unknown>; aliases?: Record<string, string> };
const SFX_KEYS = new Set(Object.keys(AUDIO_INDEX.sfx));

type Call = { kind: string; name?: string; volume?: number; unit?: number; level?: number; on?: boolean; dir?: string };

/**
 * 装一个假 sink 并把收到的调用记下来。
 *
 * 用 sink 而不是读 `audioEvents()`，是为了顺带验证"总线真的把事件交给了播放层"。
 */
function fakeSink(): { calls: Call[]; names: string[] } {
  const calls: Call[] = [];
  const names: string[] = [];
  setAudioSink({
    sfx: (name, opts) => {
      calls.push({ kind: 'sfx', name, volume: opts?.volume, unit: opts?.unit });
      names.push(name);
    },
    magic: (dir, opts) => {
      calls.push({ kind: 'magic', dir, volume: opts?.volume });
      names.push(dir);
    },
    flash: (on) => calls.push({ kind: 'flash', on }),
    brightness: (level) => calls.push({ kind: 'brightness', level }),
  });
  return { calls, names };
}

function staged(seed = 7): World {
  const world = createWorld({
    data,
    seed,
    a: { formation: 0, troop: 0, morale: 50, soldiers: 20, general: { name: 'A', str: 60, int: 70 } },
    b: { formation: 0, troop: 0, morale: 50, soldiers: 20, general: { name: 'B', str: 60, int: 70 } },
  });
  const g = world.units.find((u) => u.isGeneral && u.side === 'A');
  assert.ok(g, 'A 方应有主将单位');
  g.x = 24;
  g.y = 6.5;
  g.prevX = g.x;
  g.prevY = g.y;
  world.sides.A.general.hp = Math.round(world.sides.A.general.maxHp * 0.4);
  return world;
}

function scriptOf(seq: number): number {
  const m = data.magics.find((x) => x.SEQUENCE === seq);
  assert.ok(m, `找不到第 ${seq} 号技能`);
  return m.SCRIPT;
}

function run(seq: number, world = staged()) {
  resetAudioBus();
  const sink = fakeSink();
  const r = runSkill(world, 'A', scriptOf(seq), 20, 6.5);
  assert.equal(r.ok, true, `技能 ${seq} 应运行成功：${r.log.join(' | ')}`);
  return { world, r, ...sink };
}

// ── R52：字节码里的音效真的播 ────────────────────────────────────────────

test('R52 命療術(1) 的 Heal 子脚本把 m016snd01 送到 sink', () => {
  const { names, calls } = run(1);
  assert.deepEqual(names, ['m016snd01'], `应只有一条 Heal 音：${JSON.stringify(names)}`);
  const sfx = calls.find((c) => c.kind === 'sfx');
  assert.equal(sfx!.volume, 1, '原作音量 255 应折成 1.0');
});

test('R52 半月斬(50) 的 0x300 带 unit 句柄（3D 音）', () => {
  const { calls } = run(50);
  const sfx = calls.filter((c) => c.kind === 'sfx');
  assert.ok(sfx.length >= 1, '半月斬应发声');
  assert.equal(sfx[0]!.name, 'm001snd01');
  assert.ok(sfx[0]!.unit !== undefined && sfx[0]!.unit > 0, `0x300 应带 unit：${JSON.stringify(sfx[0])}`);
});

test('R52 一次技能里的多个发声点全部按顺序送达（49 号 → m036snd01 + 7×m036snd02）', () => {
  // R87 语义修正（`project/117_技能等待语义.md`）：`0x129`/`0x10D` 的唯一实参是**阵营**
  // （`LDG 5; PUSHI 1; XOR`），旧实现把它当句柄 ⇒ 恒返回 0 ⇒ 刀劍亂 553 的
  // `STL loc3` 走 `loc3==0 → loc3 = g3` 兜底分支，每轮循环都建 `CreateSlashByTarget`
  // （每个各含一处 m036snd02），凑出 11 条。修好阵营解析后 loc3 = 敌方主将，
  // 字节码走真正的 `0x12A > 2 → CreateSlash` 分支，只剩 3 个"指定目标斩"发声点。
  //
  // R163 重定基线（3 → 7）：`0x12A/0x12B` 从「造 1 个物件返回 1」改成真实的矩形计数后，
  // `Slash`（`func #286 @0x2EAFC`，`magic_so.dis.txt:26603`）的两段循环才按原作跑满：
  // 第一段 `for loc4 < 4`（dis:26604-26607，每轮一次 `CreateSlash`/`CreateSlashByTarget`）
  // + 第二段 `for loc4 < 3`（dis:26671-26675，每轮一次 `CreateSlash`）= 4 + 3 = 7 处发声。
  // 测试语义不变：第一条是 snd01，随后的 snd02 按顺序送达。
  const { names } = run(49);
  assert.equal(names[0], 'm036snd01');
  assert.equal(names.filter((n) => n === 'm036snd02').length, 7, `实际：${names.join(' ')}`);
});

test('R52 音量是 0..255 口径，折成 0..1（128 → 0.502、255 → 1）', () => {
  // 原断言用 seq 3（`CreateSpoutAround` 内层的 230 档，dis:20222）来证明"两档不同音量"。
  // L1 把 0x3C/0x3D 按 EXE 改对后（0x464660 `je +3` / 0x464690 `jne +3`），seq 3 只走外层
  // 200 档：内层循环的 trip count 是 `CreateSpoutAround` 的 arg1，当前端口调用时恒 0
  // （arg1 由调用方的计数 syscall 给出，端口 `0x12A/0x12B` 还是固定返 1 的近似，见 project/159 §5）。
  // 所以改用 seq 27（絕命壩）——端口里**运行时真能送出**两档以上音量的技能之一
  // （`work/159_probe_volumes.mjs` 扫 110 条，只有 12/27/40/70/92/108 有 ≥2 档）。
  // 测试意图不变：证明 0x301 的音量是 0..255 口径、折成 0..1、且不是恒 1。
  const { calls } = run(27);
  const vols = calls.filter((c) => c.kind === 'sfx').map((c) => c.volume!);
  assert.ok(vols.length > 0, '应发声');
  for (const v of vols) assert.ok(v >= 0 && v <= 1, `音量越界：${v}`);
  const distinct = [...new Set(vols)].sort((a, b) => a - b);
  assert.ok(distinct.length >= 2, `应有两档以上不同音量：${distinct.join(',')}`);
  assert.ok(distinct.some((v) => Math.abs(v - 128 / 255) < 1e-6), `应有 128/255：${vols.join(',')}`);
  assert.ok(distinct.some((v) => Math.abs(v - 1) < 1e-6), `应有 255/255 = 1：${vols.join(',')}`);
});

test('R52 每个武将技都会开压暗开关 + 逐帧压暗再抬回（0x131 / 0x12F）', () => {
  const { calls } = run(1);
  const flash = calls.filter((c) => c.kind === 'flash').map((c) => c.on);
  assert.equal(flash[0], true, `应以"压暗开始"开场：${JSON.stringify(flash)}`);
  assert.ok(flash.filter((x) => x === true).length === 1, `不该重复开场：${JSON.stringify(flash)}`);
  const levels = calls.filter((c) => c.kind === 'brightness').map((c) => c.level!);
  assert.ok(levels.length >= 8, `应有一串亮度帧：${levels.join(',')}`);
  assert.equal(levels[0], 15, '原作从 15 开始压暗');
  assert.ok(Math.min(...levels) <= 8, `应压到 8 以下：${levels.join(',')}`);
  assert.equal(levels[levels.length - 1], 16, '最后抬回满亮度');
});

test('R52 0x131 紧跟着 DownBrightness(level, frames)：HalfMoon 的字节码顺序', () => {
  // 实测 magic_so 里 HalfMoon @0x4738 是 SYSCALL 0x131 → PUSHI 12 → PUSHI 5 → CALL DownBrightness，
  // 所以"开关"和"亮度帧"必然同帧出现，且亮度先动、音效后到。
  const { calls } = run(50);
  const firstFlash = calls.findIndex((c) => c.kind === 'flash');
  const firstBright = calls.findIndex((c) => c.kind === 'brightness');
  assert.ok(firstFlash >= 0 && firstBright > firstFlash, `顺序应为 开关→亮度：${JSON.stringify(calls.map((c) => c.kind))}`);
});

test('R52 m016a 没有资源包，别名兜底到 m016snd01', () => {
  assert.equal(normalizeSfxName('m016a'), 'm016snd01');
  resetAudioBus();
  const sink = fakeSink();
  const ev = emitSfx({ name: 'm016a', volume: 255 });
  assert.ok(ev);
  assert.equal(ev!.name, 'm016snd01');
  assert.equal(ev!.raw, 'm016a');
  assert.deepEqual(sink.names, ['m016snd01']);
});

test('R52 空名字被丢弃并计数，不抛异常', () => {
  resetAudioBus();
  fakeSink();
  assert.equal(emitSfx({ name: '' }), null);
  assert.equal(audioBusStats().dropped, 1);
});

test('R52 sink 抛错不会打断技能执行', () => {
  resetAudioBus();
  setAudioSink({
    sfx: () => {
      throw new Error('音频解码炸了');
    },
  });
  const world = staged();
  const r = runSkill(world, 'A', scriptOf(50), 20, 6.5);
  assert.equal(r.ok, true, `sink 抛错不应影响技能：${r.log.join(' | ')}`);
  assert.ok(audioBusStats().sfx > 0, '事件仍应被记录');
});

test('R52 技能日志仍保留音效行，并新增“音效事件 N 条 → audio_bus”', () => {
  const { r } = run(50);
  assert.ok(r.log.some((l) => l.includes('音效')), `日志应有音效行：${r.log.join(' | ')}`);
  assert.ok(r.log.some((l) => l.includes('音效事件')), `日志应有 bus 行：${r.log.join(' | ')}`);
});

test('R52 全技能抽样：发出去的名字全部能在音频包里找到资源', () => {
  const seqs = [1, 2, 3, 5, 7, 8, 9, 11, 13, 14, 16, 17, 19, 21, 23, 24, 27, 49, 50, 60, 104];
  const missing: string[] = [];
  const seen = new Set<string>();
  for (const seq of seqs) {
    const { names } = run(seq);
    for (const n of names) {
      seen.add(n);
      if (!SFX_KEYS.has(n)) missing.push(`${seq}:${n}`);
    }
  }
  assert.deepEqual(missing, [], `这些脚本音在包里没有资源：${missing.join(' ')}`);
  assert.ok(seen.size >= 8, `抽到的不同音效应够多：${[...seen].join(' ')}`);
});

test('R52 音量折算函数对 0..1 与 0..255 都成立', () => {
  assert.equal(volume255(255), 1);
  assert.equal(volume255(0), 0);
  assert.ok(Math.abs(volume255(128) - 128 / 255) < 1e-9);
  assert.equal(volume255(0.62), 0.62, '已经是 0..1 的直接用');
  assert.equal(volume255(Number.NaN), 1, '非法值给满音量');
});

// ── R79：SYSTEM.SO 的 5 个原生函数 ──────────────────────────────────────

test('R79/R137 音效管子只留 4 个：AllRush 搬家后返回 null，让调用方落到宿主', () => {
  assert.deepEqual(SYSTEM_SO_IMPLEMENTED, [
    'DownBrightness', 'RaiseBrightness', 'MajorDeath', 'LoadingBattleMap',
  ]);
  resetAudioBus();
  fakeSink();
  assert.equal(callSystemSo('BattleYield', []), null, '未实装的必须返回 null');
  assert.equal(callSystemSo('StartBattle', []), null);
  assert.equal(callSystemSo('EnterWar4', []), null);
  // R137：AllRush 要写 `world.rush`（gameplay），不能再由音效管子短路，
  // 否则 `runtime.callScript` 里 `if (sys) return undefined` 会让 SysoHost 永远进不去。
  assert.equal(callSystemSo('AllRush', []), null, 'AllRush 已搬进 core/syso_host.ts（status:host）');
});

test('R79 DownBrightness / RaiseBrightness 改的是同一格亮度（0x12F + 0x130）', () => {
  resetAudioBus();
  const sink = fakeSink();
  callSystemSo('DownBrightness', [4]);
  assert.equal(sink.calls[0]!.level, 12, '16-4=12');
  assert.equal(audioBrightnessLevel(), 12, '读回来应是 12');
  callSystemSo('RaiseBrightness', [16]);
  assert.equal(sink.calls[1]!.level, 16);
  assert.equal(audioBrightnessLevel(), 16);
});

test('R137 AllRush 改走宿主通道：Rush01 + 一对闪白 + 「全軍突擊!」+ world.rush.A', () => {
  resetAudioBus();
  const sink = fakeSink();
  const world = freshWorld();
  const log: string[] = [];
  const host = createBattleSysoHost(world, 'A', { log });
  assert.deepEqual(host.call('AllRush', []), { handled: true });
  assert.equal(world.rush.A, true, '0x120(主将, 0x10000) 必须真的把该侧置成突击态');
  assert.deepEqual(sink.names, ['rush01'], '0x301 "Rush01"');
  assert.deepEqual(
    sink.calls.filter((c) => c.kind === 'flash').map((c) => c.on),
    [true, false],
    '0x131 / 0x110 的一对压暗括号',
  );
  assert.ok(log.some((l) => l.includes('全軍突擊')), `0x003 的台词应进 log：${log.join(' | ')}`);
  // 幂等：第二次调用不再改状态，但音频/台词照播（原作每次调用都播）
  assert.equal(host.call('AllRush', []).handled, true);
  assert.equal(world.rush.A, true, '第二次不该反转或重复置位');
  assert.equal(sink.names.length, 2, '两次调用各播一次 Rush01');
});

test('R79 MajorDeath 播 Yell03 + Horse02 + VICTORY', () => {
  resetAudioBus();
  const sink = fakeSink();
  callSystemSo('MajorDeath', [0, 0]);
  assert.deepEqual(sink.names, ['yell03', 'horse02', 'victory']);
  for (const n of sink.names) assert.ok(SFX_KEYS.has(n), `${n} 应在音频包里`);
});

test('R79 LoadingBattleMap 只给 3/5/8/9 四个地形配底噪，其余静默', () => {
  assert.deepEqual(Object.keys(BATTLE_MAP_AMBIENT_OF).map(Number), [3, 5, 8, 9], '表本身只含这 4 个地形');
  resetAudioBus();
  const sink = fakeSink();
  // 有底噪的四个地形，按 SYSTEM.SO 的 CASE 分支顺序
  for (const terrain of [3, 5, 8, 9]) callSystemSo('LoadingBattleMap', [terrain]);
  assert.deepEqual(sink.names, [...BATTLE_MAP_AMBIENT]);
  for (const n of sink.names) assert.ok(SFX_KEYS.has(n), `${n} 应在音频包里`);
  // 其余地形（含 4、7 这两个历史上被 % 4 误算出声音的）应当一点声音都不发
  const before = sink.names.length;
  for (const terrain of [0, 1, 2, 4, 6, 7, 10, 11]) callSystemSo('LoadingBattleMap', [terrain]);
  assert.equal(sink.names.length, before, '无底噪地形不应发任何声音');
});

test('R79 音效管子的 source/clock 透传（环形日志里查得到）', () => {
  // 原来这条用 AllRush 取证；R137 起 AllRush 搬去宿主（见上一条），换 MajorDeath 验同一根管子。
  resetAudioBus();
  fakeSink();
  callSystemSo('MajorDeath', [0, 0], { source: 'system:MajorDeath', clock: 7 });
  const evs: AudioEvent[] = audioEvents();
  assert.ok(evs.some((e) => e.kind === 'sfx' && e.name === 'yell03'));
  assert.equal(evs[0]!.clock, 7, 'clock 应透传');
  assert.equal(evs[0]!.source, 'system:MajorDeath', 'source 应透传');
});

test('R79 技能起手用 emitMagic 进总线（dir 补成 3 位）', () => {
  resetAudioBus();
  const sink = fakeSink();
  emitMagic('1', 0.7, 'skill:cast');
  assert.deepEqual(sink.names, ['001']);
  assert.equal(audioEvents().filter((e) => e.kind === 'magic').length, 1);
});

// ── R80：战场六类触发 ───────────────────────────────────────────────────

function freshWorld(seed = 11, soldiers = 20): World {
  // m4：默认待機后旧测试要显式下令，战斗才会在 tick 循环里打完。
  return engage(createWorld({
    data,
    seed,
    a: { formation: 0, troop: 0, morale: 50, soldiers, general: { name: 'A', str: 60, int: 70 } },
    b: { formation: 0, troop: 0, morale: 50, soldiers, general: { name: 'B', str: 60, int: 70 } },
  }));
}

function namesOf(evs: AudioEvent[]): string[] {
  return evs.filter((e): e is Extract<AudioEvent, { kind: 'sfx' }> => e.kind === 'sfx').map((e) => e.name);
}

test('R80 命中与格挡按 stats 增量触发（hit01 / defense）', () => {
  resetAudioBus();
  fakeSink();
  const world = freshWorld();
  const mark: BattleAudioMark = battleAudioMark(world);
  assert.deepEqual(namesOf(battleAudioEvents(world, mark)), [], '没变化时不该有事件');

  world.stats.hitsA += 2;
  world.stats.blocks += 1;
  const evs = battleAudioEvents(world, mark);
  assert.deepEqual(namesOf(evs), ['hit01', 'defense']);
  assert.ok(evs[0]!.kind === 'sfx' && Math.abs(evs[0]!.volume - 0.62) < 1e-9, '2 下用 0.62');
});

test('R80 一次 ≥4 下命中提高音量到 0.8', () => {
  resetAudioBus();
  fakeSink();
  const world = freshWorld();
  const mark = battleAudioMark(world);
  world.stats.hitsA += 4;
  const evs = battleAudioEvents(world, mark);
  assert.equal(namesOf(evs)[0], 'hit01');
  assert.ok(evs[0]!.kind === 'sfx' && evs[0]!.volume === 0.8);
});

test('R80 主将挨打播 yell0x，小兵挨打播 hit02', () => {
  resetAudioBus();
  fakeSink();
  const world = freshWorld();
  const mark = battleAudioMark(world);
  const g = world.units.find((u) => u.isGeneral && u.side === 'A')!;
  g.lastHitTick = world.tick;
  const troop = world.units.find((u) => !u.isGeneral && u.side === 'B')!;
  troop.lastHitTick = world.tick;
  const names = namesOf(battleAudioEvents(world, mark));
  assert.ok(names.some((n) => /^yell0[1-4]$/.test(n)), `主将应惨叫：${names.join(' ')}`);
  assert.ok(names.includes('hit02'), `小兵应受击音：${names.join(' ')}`);
});

test('R80 阵亡：小兵 death（≥3 个提高音量）、主将 death3', () => {
  resetAudioBus();
  fakeSink();
  const world = freshWorld();
  const mark = battleAudioMark(world);
  const troops = world.units.filter((u) => !u.isGeneral && u.side === 'B').slice(0, 3);
  assert.equal(troops.length, 3);
  for (const t of troops) t.alive = false;
  const evs = battleAudioEvents(world, mark);
  assert.deepEqual(namesOf(evs), ['death']);
  assert.ok(evs[0]!.kind === 'sfx' && evs[0]!.volume === 0.7, '3 个以上用 0.7');

  const g = world.units.find((u) => u.isGeneral && u.side === 'B')!;
  g.alive = false;
  assert.ok(namesOf(battleAudioEvents(world, mark)).includes('death3'));
});

test('R80 撤退令下达的那一帧播 yell03 + horse02，且只播一次', () => {
  resetAudioBus();
  fakeSink();
  const world = freshWorld();
  const mark = battleAudioMark(world);
  assert.equal(requestRetreat(world, 'A'), true);
  assert.deepEqual(namesOf(battleAudioEvents(world, mark)), ['yell03', 'horse02']);
  assert.deepEqual(namesOf(battleAudioEvents(world, mark)), [], '下一帧不应重复');
});

test('R80 撤离出场的单位（cullFled）播 horse02', () => {
  resetAudioBus();
  fakeSink();
  const world = freshWorld();
  const mark = battleAudioMark(world);
  const u = world.units.find((x) => !x.isGeneral && x.side === 'A')!;
  u.flee = true;
  world.units.splice(world.units.indexOf(u), 1);
  assert.deepEqual(namesOf(battleAudioEvents(world, mark)), ['horse02']);
});

// tick 预算：R158 起移动改成原作「每 40 帧行动一次、一次一格」（`0x43B574`/`0x43BF26`），
// 60v60 实测要 1397 tick 才打完（旧连续速度模型约 1/3.6）；1200 会截断在战斗中段，
// 所以放宽到 2600 tick，断言口径不变（六类事件都真的出现过、战场事件不进 sink）。
test('R80 真跑一场战斗：六类里至少命中/格挡/阵亡/受击都出现', () => {
  resetAudioBus();
  const sink = fakeSink();
  const world = freshWorld(11, 60);
  const mark = battleAudioMark(world);
  const counts: Record<string, number> = {};
  for (let i = 0; i < 2600 && !world.over; i++) {
    step(world);
    for (const n of namesOf(battleAudioEvents(world, mark))) counts[n] = (counts[n] ?? 0) + 1;
  }
  assert.ok(world.over, '战斗应在 2600 tick 内结束（60v60 实测 1397）');
  assert.ok((counts.hit01 ?? 0) > 5, `命中太少：${JSON.stringify(counts)}`);
  assert.ok((counts.defense ?? 0) > 0, `格挡没触发：${JSON.stringify(counts)}`);
  assert.ok((counts.death ?? 0) > 5, `阵亡太少：${JSON.stringify(counts)}`);
  // 战场事件只进总线（播放由 web 侧 tickBattleSfx 定速），不进 sink —— 否则会双播
  assert.ok(audioBusStats().total > 10, '事件应进总线日志');
  assert.equal(sink.names.length, 0, '战场事件不该直接推 sink（会和 main.js 的节流重复播）');
});

test('R80 战场事件不进 sink：避免与 main.js 的 tickBattleSfx 双播', () => {
  resetAudioBus();
  const sink = fakeSink();
  const world = freshWorld();
  const mark = battleAudioMark(world);
  world.stats.hitsA += 2;
  world.stats.blocks += 1;
  const evs = battleAudioEvents(world, mark);
  assert.ok(evs.length >= 2, `应产出事件：${JSON.stringify(evs)}`);
  assert.equal(sink.names.length, 0);
  // 但技能侧仍然直连 sink（一次性事件，无需节流）
  emitSfx({ name: 'm016snd01', volume: 200, source: 'syscall:0x301' });
  assert.deepEqual(sink.names, ['m016snd01']);
});

test('R80 事件都带 tick 时钟，方便和战报对齐', () => {
  resetAudioBus();
  fakeSink();
  const world = freshWorld();
  const mark = battleAudioMark(world);
  world.stats.hitsA += 1;
  const evs = battleAudioEvents(world, mark);
  assert.equal(evs[0]!.clock, world.tick);
});

test('R80 mark 是纯增量：同一 tick 调用两次，第二次为空', () => {
  resetAudioBus();
  fakeSink();
  const world = freshWorld();
  const mark = battleAudioMark(world);
  world.stats.hitsA += 1;
  world.stats.blocks += 1;
  assert.equal(battleAudioEvents(world, mark).length, 2);
  assert.equal(battleAudioEvents(world, mark).length, 0);
});
