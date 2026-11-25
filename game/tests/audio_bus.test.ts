/**
 * 音频总线（`core/audio_bus.ts`）的 **sink 契约**。
 *
 * 这里只测"事件 → sink"的转发语义，不重复 `smartscript_audio.test.ts` 已覆盖的
 * MAGIC.SO / SYSTEM.SO 端到端序列。核心是一条真实修过的 bug：
 *
 *   > 曾经 `battleAudioEvents()` 里的发声点也走 `emitSfx()`（会转发 sink），
 *   > 而 web 侧 `main.js` 的 `tickBattleSfx()` 又播一遍 → `?sim=300` 实测
 *   > **defense 播了 151 次、事件只有 90 条**。
 *
 * 现在的契约：`emitSfx()` 每次恰好转发一次（不重发、不批量重放）；战场路径
 * `emitSfxInternal(input, false)` 只记账不转发。本文件把这个区别钉死。
 */
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../src/data.ts';
import { createWorld, step } from '../src/core/battle.ts';
import {
  audioBusStats,
  audioEvents,
  battleAudioEvents,
  battleAudioMark,
  emitBrightness,
  emitFlash,
  emitMagic,
  emitSfx,
  getAudioSink,
  normalizeSfxName,
  resetAudioBus,
  setAudioSink,
  volume255,
} from '../src/core/audio_bus.ts';
import type { AudioSink } from '../src/core/audio_bus.ts';
import { engage } from './_engage.ts';

const data = loadData({ dir: new URL('../data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });

type SfxOpts = Parameters<NonNullable<AudioSink['sfx']>>[1];
type MagicOpts = Parameters<NonNullable<AudioSink['magic']>>[1];
type FlashOpts = Parameters<NonNullable<AudioSink['flash']>>[1];
type BrightnessOpts = Parameters<NonNullable<AudioSink['brightness']>>[1];

/** 记录全部回调的假 sink。 */
function fakeSink() {
  const sfx: { name: string; opts: SfxOpts }[] = [];
  const magic: { dir: string; opts: MagicOpts }[] = [];
  const flash: { on: boolean; opts: FlashOpts }[] = [];
  const brightness: { level: number; opts: BrightnessOpts }[] = [];
  const sink: AudioSink = {
    sfx(name, opts) {
      sfx.push({ name, opts });
    },
    magic(dir, opts) {
      magic.push({ dir, opts });
    },
    flash(on, opts) {
      flash.push({ on, opts });
    },
    brightness(level, opts) {
      brightness.push({ level, opts });
    },
  };
  return { sink, sfx, magic, flash, brightness, names: () => sfx.map((c) => c.name) };
}

beforeEach(() => {
  resetAudioBus();
});

describe('sink 转发契约：一次 emit = 恰好一次回调', () => {
  it('emitSfx 只转发一次：名字/音量/来源/原始名/单位句柄都对', () => {
    const f = fakeSink();
    setAudioSink(f.sink);
    assert.equal(getAudioSink(), f.sink);

    const ev = emitSfx({ name: 'hit01', volume: 200, unit: 7, source: 'syscall:0x301', clock: 42 });
    assert.ok(ev);
    assert.equal(f.sfx.length, 1, '一次 emit 只能触发一次 sink.sfx');
    assert.equal(f.sfx[0]!.name, 'hit01');
    assert.equal(f.sfx[0]!.opts.raw, 'hit01');
    assert.equal(f.sfx[0]!.opts.source, 'syscall:0x301');
    assert.equal(f.sfx[0]!.opts.unit, 7);
    assert.ok(Math.abs(f.sfx[0]!.opts.volume - 200 / 255) < 1e-12, `音量应折成 200/255，实际 ${f.sfx[0]!.opts.volume}`);
    assert.equal(ev.clock, 42, '事件要带 tick 时钟');
    assert.equal(audioBusStats().sfx, 1);
    assert.equal(audioBusStats().total, 1);
  });

  it('默认值：volume=255 折成 1、source 默认 ?、unit 不传则 opts 里没有', () => {
    const f = fakeSink();
    setAudioSink(f.sink);
    emitSfx({ name: 'hit01' });
    assert.equal(f.sfx[0]!.opts.volume, 1);
    assert.equal(f.sfx[0]!.opts.source, '?');
    assert.equal(f.sfx[0]!.opts.unit, undefined);
  });

  it('151 次 emitSfx → sink 恰好 151 次（不是 302 次）—— 双发 bug 回归', () => {
    const f = fakeSink();
    setAudioSink(f.sink);
    const N = 151;
    for (let i = 0; i < N; i++) emitSfx({ name: 'defense', source: 'battle' });
    assert.equal(f.sfx.length, N, `151 次发声回了 ${f.sfx.length} 次，双发回归`);
    assert.equal(audioBusStats().byName.defense, N);
    assert.equal(audioBusStats().total, N);
  });

  it('连续 emit 不同名字：顺序与数量都一一对应', () => {
    const f = fakeSink();
    setAudioSink(f.sink);
    emitSfx({ name: 'hit01' });
    emitSfx({ name: 'death' });
    emitSfx({ name: 'horse02' });
    assert.deepEqual(f.names(), ['hit01', 'death', 'horse02']);
    assert.deepEqual(
      audioEvents().map((e) => (e.kind === 'sfx' ? e.name : e.kind)),
      ['hit01', 'death', 'horse02'],
    );
  });

  it('替换 sink 后只发给新 sink；注销后不再发也不抛异常', () => {
    const a = fakeSink();
    const b = fakeSink();
    setAudioSink(a.sink);
    emitSfx({ name: 'hit01' });
    assert.equal(a.sfx.length, 1);

    setAudioSink(b.sink);
    emitSfx({ name: 'hit02' });
    assert.equal(a.sfx.length, 1, '旧 sink 不应再收到事件');
    assert.equal(b.sfx.length, 1);

    setAudioSink(null);
    assert.equal(getAudioSink(), null);
    assert.doesNotThrow(() => emitSfx({ name: 'hit03' }));
    assert.equal(a.sfx.length + b.sfx.length, 2);
    assert.equal(audioBusStats().sfx, 3, '没有 sink 也必须记账');
  });

  it('sink 抛异常被吞掉：事件仍入库，调用方不崩', () => {
    setAudioSink({
      sfx() {
        throw new Error('boom');
      },
    });
    assert.doesNotThrow(() => emitSfx({ name: 'hit01' }));
    assert.equal(audioBusStats().sfx, 1);
    assert.deepEqual(
      audioEvents().map((e) => (e.kind === 'sfx' ? e.name : e.kind)),
      ['hit01'],
    );
  });
});

describe('名字归一化：脚本名 → 资源键', () => {
  it('m016a → m016snd01（任务书锚点），大小写/空白都折掉', () => {
    assert.equal(normalizeSfxName('m016a'), 'm016snd01');
    assert.equal(normalizeSfxName(' M016A '), 'm016snd01');
    assert.equal(normalizeSfxName('HIT01'), 'hit01');
    assert.equal(normalizeSfxName('yell03'), 'yell03', '别名表里的恒等项也要折成小写');
    assert.equal(normalizeSfxName(''), '');
    assert.equal(normalizeSfxName('   '), '');
    assert.equal(normalizeSfxName(undefined as unknown as string), '');
  });

  it('转发的是归一化后的键，但 raw 保留脚本原样', () => {
    const f = fakeSink();
    setAudioSink(f.sink);
    emitSfx({ name: ' M016A ' });
    assert.deepEqual(f.names(), ['m016snd01']);
    assert.equal(f.sfx[0]!.opts.raw, ' M016A ', 'raw 是排障用的原文，不能被归一化');
    assert.equal(audioBusStats().byName.m016snd01, 1);
  });

  it('空名字/纯空白：不转发、返回 null、dropped 计数', () => {
    const f = fakeSink();
    setAudioSink(f.sink);
    assert.equal(emitSfx({ name: '' }), null);
    assert.equal(emitSfx({ name: '   ' }), null);
    assert.equal(f.sfx.length, 0);
    assert.equal(audioBusStats().sfx, 0);
    assert.equal(audioBusStats().dropped, 2);
  });
});

describe('audioBusStats：计数随 emit 增长，byName 逐名累计', () => {
  it('sfx/magic/flash/brightness/total 分别计数', () => {
    const f = fakeSink();
    setAudioSink(f.sink);
    emitSfx({ name: 'hit01' });
    emitSfx({ name: 'hit01' });
    emitMagic('016');
    emitMagic('7');
    emitFlash(true);
    emitBrightness(3);

    const st = audioBusStats();
    assert.equal(st.sfx, 2);
    assert.equal(st.magic, 2);
    assert.equal(st.flash, 1);
    assert.equal(st.brightness, 1);
    assert.equal(st.total, 6, 'total = 事件日志(5) + 亮度次数(1)');
    assert.deepEqual(st.byName, { hit01: 2 });
    assert.equal(st.dropped, 0);
    assert.equal(audioEvents().length, 5, '亮度不进环形日志');

    assert.equal(f.sfx.length, 2);
    assert.equal(f.magic.length, 2);
    assert.equal(f.flash.length, 1);
    assert.equal(f.brightness.length, 1);
    assert.equal(f.magic[0]!.dir, '016');
    assert.equal(f.magic[1]!.dir, '007', 'dir 必须补零到 3 位');
  });

  it('emitMagic 的 dir 只留数字、补零到 3 位、超长截末 3 位', () => {
    emitMagic('a1b2c3');
    emitMagic('1234567');
    emitMagic('');
    assert.deepEqual(
      audioEvents().map((e) => (e.kind === 'magic' ? e.dir : e.kind)),
      ['123', '567', '000'],
    );
  });

  it('emitFlash 强度夹 0..1，emitBrightness 等级夹 0..16 且四舍五入', () => {
    emitFlash(true, 5);
    emitFlash(false, -2);
    const flashes = audioEvents().filter((e) => e.kind === 'flash');
    assert.deepEqual(flashes.map((e) => (e.kind === 'flash' ? e.strength : -1)), [1, 0]);

    emitBrightness(99);
    emitBrightness(-5);
    emitBrightness(7.6);
    assert.equal(audioBusStats().brightness, 3);
    const levels = audioEvents().filter((e) => e.kind === 'brightness');
    assert.equal(levels.length, 0, '亮度不进事件日志');
  });

  it('volume255：0..255 与 0..1 两种口径都收，越界夹紧', () => {
    assert.equal(volume255(255), 1);
    assert.equal(volume255(0), 0);
    assert.equal(volume255(128), 128 / 255);
    assert.equal(volume255(1), 1);
    assert.equal(volume255(0.5), 0.5);
    assert.equal(volume255(-3), 0);
    assert.equal(volume255(Number.NaN), 1);
  });

  it('resetAudioBus 清空事件/sink/计数/序号', () => {
    const f = fakeSink();
    setAudioSink(f.sink);
    emitSfx({ name: 'hit01' });
    emitBrightness(3);
    assert.ok(audioBusStats().total > 0);

    resetAudioBus();

    assert.deepEqual(audioEvents(), []);
    assert.equal(getAudioSink(), null);
    const st = audioBusStats();
    assert.equal(st.total, 0);
    assert.equal(st.sfx + st.magic + st.flash + st.brightness + st.dropped, 0);
    assert.deepEqual(st.byName, {});
    const ev = emitSfx({ name: 'hit01' });
    assert.equal(ev?.seq, 1, '序号应从 1 重新开始');
  });
});

// tick 预算：R158 起移动改成原作「每 40 帧行动一次、一次一格」（`0x43B574`/`0x43BF26`），
// 40v40 从列阵到接触要 ≈500+ tick，300 tick 的窗口里一次命中都不会有；
// 这里放宽到 1200 tick，断言口径不变（战场事件只进日志、不直推 sink）。
describe('战场路径不转发 sink（151 次双播的根因）', () => {
  it('1200 tick 混战：battleAudioEvents 产出大量事件，但 sink 收到 0 次；显式 emitSfx 仍能转发', () => {
    resetAudioBus();
    const f = fakeSink();
    setAudioSink(f.sink);
    const world = engage(createWorld({ data, seed: 3, a: { soldiers: 40 }, b: { soldiers: 40 } }));
    const mark = battleAudioMark(world);

    const seen: string[] = [];
    for (let i = 0; i < 1200 && !world.over; i++) {
      step(world);
      for (const ev of battleAudioEvents(world, mark)) {
        if (ev.kind === 'sfx') seen.push(ev.name);
      }
    }

    assert.ok(seen.length > 0, '1200 tick 混战应该产出战场音效事件');
    const allowed = new Set(['hit01', 'hit02', 'defense', 'death', 'death3', 'horse02', 'yell01', 'yell02', 'yell03', 'yell04']);
    for (const name of seen) assert.ok(allowed.has(name), `战场事件出现未登记的音效名：${name}`);
    assert.equal(f.sfx.length, 0, 'battleAudioEvents 不能直推 sink —— 会和 main.js 的 tickBattleSfx 双播');
    assert.equal(audioBusStats().total, seen.length, '事件只进总线日志，一条不多一条不少');

    emitSfx({ name: 'hit01', source: 'ui' });
    assert.equal(f.sfx.length, 1, '显式 emitSfx 仍必须直连 sink');
    assert.equal(audioBusStats().total, seen.length + 1);
  });
});
