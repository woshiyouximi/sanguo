/**
 * 技能编号 → 音效串 的映射表契约（project/96_技能音效映射.md、work/sfx84/）。
 *
 * 这里钉三件事：
 *   1. 表的**键**是技能编号（magics.json 的 SEQUENCE），不是特效目录号——
 *      旧版 audio.js 把键当 fx_dir_primary 用，110 个技能只覆盖 40 个、34 个追不到串。
 *   2. 表的**值**必须是 sfx 目录里真实存在的文件，且与 game/web/audio.js 的同名表逐条一致
 *      （浏览器端是普通 <script>，不能 import TS，所以两份表 + 本测试防漂移）。
 *   3. 004/007/033 这三个"脚本层无直接播放点"的编号由「脚本 PUSHI 物件号 -> THINGS.INI
 *      物件动画 `$` 或 `!nnnn` 回调 -> 播串」的静态链裁决；R148 起证级记 [A2]——原 24 条
 *      [C] 已全部按 A2 的三条链取证升级，[C] 清零。详见 project/148_技能音证据表.md。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  MAGIC_SFX,
  MAGIC_SFX_GRADE,
  magicSfxName,
  magicSfxGrade,
  normalizeSfxName,
} from '../src/core/audio_bus.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const GAME = join(HERE, '..');
const SFX_DIR = join(GAME, 'web', 'assets', 'audio', 'sfx');
const AUDIO_JS = join(GAME, 'web', 'audio.js');

interface MagicRow { SEQUENCE: number; NAME: string; fx_dir?: string[]; fx_dir_primary?: string }
const MAGICS: MagicRow[] = JSON.parse(readFileSync(join(GAME, 'data', 'magics.json'), 'utf8'));
const BY_SEQ = new Map(MAGICS.map((m) => [m.SEQUENCE, m]));
const SFX_FILES = new Set(
  readdirSync(SFX_DIR).filter((f) => f.toLowerCase().endsWith('.mp3')).map((f) => f.slice(0, -4)),
);
const pad3 = (n: number) => String(n).padStart(3, '0');

/** 从 audio.js 源码里抽出 MAGIC_SFX 表（浏览器端那份）。 */
function readAudioJsTable(): Record<string, string> {
  const src = readFileSync(AUDIO_JS, 'utf8');
  const body = /var MAGIC_SFX = \{([\s\S]*?)\n {2}\};/.exec(src);
  assert.ok(body, 'audio.js 里找不到 var MAGIC_SFX = { ... }');
  const out: Record<string, string> = {};
  for (const m of body![1].matchAll(/'(\d{3})':\s*'([^']+)'/g)) out[m[1]] = m[2];
  return out;
}

describe('技能音映射表：键集合', () => {
  it('键 = magics.json 的全部 110 个技能编号（补 3 位），不多不少', () => {
    const want = new Set(MAGICS.map((m) => pad3(m.SEQUENCE)));
    const got = new Set(Object.keys(MAGIC_SFX));
    const missing = [...want].filter((k) => !got.has(k));
    const extra = [...got].filter((k) => !want.has(k));
    assert.deepEqual(missing, [], '缺技能号');
    assert.deepEqual(extra, [], '多出的键');
    assert.equal(got.size, 110);
    assert.equal(MAGICS.length, 110);
  });

  it('键是技能编号而不是特效目录号：016 是「虎咆震」-> m008snd01（旧表是 m016snd01）', () => {
    assert.equal(BY_SEQ.get(16)!.NAME, '虎咆震');
    assert.equal(BY_SEQ.get(16)!.fx_dir_primary, '008');
    assert.equal(MAGIC_SFX['016'], 'm008snd01');
    // 旧口径下 '016' 表示 dir016（命療術/回天術），现在 '001'/'060' 才是它们
    assert.equal(MAGIC_SFX['001'], 'm016snd01');
    assert.equal(MAGIC_SFX['060'], 'm016snd01');
  });

  it('没有 000 键（技能号从 1 起），也没有 111 以上的键', () => {
    assert.equal(MAGIC_SFX['000'], undefined);
    assert.deepEqual(Object.keys(MAGIC_SFX).filter((k) => Number(k) > 110 || Number(k) < 1), []);
  });
});

describe('技能音映射表：值与磁盘', () => {
  it('每条值都能在 web/assets/audio/sfx 找到 .mp3（含通用 arrow）', () => {
    const bad = Object.entries(MAGIC_SFX).filter(([, v]) => !SFX_FILES.has(v));
    assert.deepEqual(bad, [], 'sfx 目录缺文件');
    assert.ok(SFX_FILES.has('arrow'));
    assert.ok(SFX_FILES.size >= 99);
  });

  it('值只有两种形态：mNNNsndNN 或 arrow（没有目录名、没有别的长度）', () => {
    const odd = Object.entries(MAGIC_SFX).filter(([, v]) => !/^m\d{3}snd\d{2}$/.test(v) && v !== 'arrow');
    assert.deepEqual(odd, []);
  });

  it('audio.js 的表与 audio_bus.ts 的表逐条一致（防两份漂移）', () => {
    const js = readAudioJsTable();
    assert.equal(Object.keys(js).length, 110, 'audio.js 表行数');
    assert.deepEqual(js, { ...MAGIC_SFX });
  });
});

describe('技能音映射表：证级', () => {
  it('每键都有证级，分布 A=73 / A2=37 / C=0 / X=0（R148 后 [C] 清零）', () => {
    assert.deepEqual(Object.keys(MAGIC_SFX_GRADE).sort(), Object.keys(MAGIC_SFX).sort());
    const cnt: Record<string, number> = {};
    for (const g of Object.values(MAGIC_SFX_GRADE)) cnt[g] = (cnt[g] ?? 0) + 1;
    const counts: Record<string, number> = { ...cnt };
    assert.deepEqual(cnt, { A: 73, A2: 37 });
    assert.equal(counts.C, undefined, '[C] 应已清零（006 系 6 条已取证升 A2）');
    assert.equal(counts.A2, 37, 'R148 把原 24 条 [C] 全部升 [A2]');
    // R113：最后 3 条纯命名约定推测已全部取证升 [A]，[X] 清零。
    //   043 → Magic43 > Sparkle > CreateSparkle 首条指令就 PUSHS "m032snd01"（magic_so.dis.txt:24090/24092）
    //   080 → Magic94 > Pa > CreatePa 同形（:22417/22419），旧值 m029snd01 本来对
    //   102 → Magic107 > FirePillar > CreateFirePillar（:23796/23798）
    // 详见 project/113_技能音与士兵节奏.md。
    assert.deepEqual(Object.keys(MAGIC_SFX_GRADE).filter((k) => MAGIC_SFX_GRADE[k] === 'X').sort(), []);
  });

  it('magicSfxGrade 归一化：16 / "16" / "016" 同一条；未知返回空串', () => {
    assert.equal(magicSfxGrade(16), 'A');
    assert.equal(magicSfxGrade('16'), 'A');
    assert.equal(magicSfxGrade('016'), 'A');
    assert.equal(magicSfxGrade(65), 'A2');
    assert.equal(magicSfxGrade(999), '');
  });
});

describe('magicSfxName：边界与回落', () => {
  it('接受 16 / "16" / "016" / 016 四种写法，结果一致', () => {
    assert.equal(magicSfxName(16), 'm008snd01');
    assert.equal(magicSfxName('16'), 'm008snd01');
    assert.equal(magicSfxName('016'), 'm008snd01');
    assert.equal(magicSfxName(' 016 '), 'm008snd01');
  });

  it('缺档回落：未知编号 / 空串 / null / 非数字 -> 空串（调用方静默，不抛错）', () => {
    assert.equal(magicSfxName('999'), '');
    assert.equal(magicSfxName(''), '');
    assert.equal(magicSfxName('   '), '');
    assert.equal(magicSfxName(null as unknown as string), '');
    assert.equal(magicSfxName('abc'), '');
    assert.equal(magicSfxName('0166'), '');
  });

  it('已经是音效名时原样小写返回（调试/旧调用兼容）', () => {
    assert.equal(magicSfxName('M008SND01'), 'm008snd01');
    assert.equal(magicSfxName('m016snd01'), 'm016snd01');
    assert.equal(magicSfxName('arrow'), '');
  });

  it('normalizeSfxName 的别名与大小写边界不被本表影响', () => {
    assert.equal(normalizeSfxName('m016a'), 'm016snd01'); // sc3602/Xsc3602 的音
    assert.equal(normalizeSfxName('  RUSH01 '), 'rush01');
    assert.equal(normalizeSfxName('m005snd02'), 'm005snd02');
    assert.equal(normalizeSfxName(''), '');
    assert.equal(normalizeSfxName('Horse02'), 'horse02');
  });
});

describe('004 / 007 / 033 三组存疑编号的裁决', () => {
  it('脚本 PUSHI 物件号 -> THINGS 物件 $ / !回调 -> 播串（R148 起证级 [A2]）', () => {
    // 技能号 -> 期望音效：065/082/104 用 dir004，069/074/090 用 dir033，048/091/105 用 dir007
    const tabs: Array<[string[], string, string]> = [
      [['065', '082', '104'], 'm004snd01', '004'],
      [['069', '074', '090'], 'm033snd01', '033'],
      [['048', '091', '105'], 'm007snd01', '007'],
    ];
    for (const [seqs, snd, dir] of tabs) {
      for (const s of seqs) {
        assert.equal(MAGIC_SFX[s], snd, `技能 ${s}`);
        assert.equal(MAGIC_SFX_GRADE[s], 'A2', `技能 ${s} 应是 A2 物件层链证据`);
        assert.equal(BY_SEQ.get(Number(s))!.fx_dir_primary, dir, `技能 ${s} 的 fx_dir`);
      }
      assert.ok(SFX_FILES.has(snd), `${snd} 必须在磁盘上`);
    }
  });

  it('m007 的三个变体里，只有 snd01 是 THINGS 层的（snd02/snd03 属 FireStoneExplode/StoneExplode）', () => {
    assert.equal(MAGIC_SFX['048'], 'm007snd01');
    assert.ok(!Object.values(MAGIC_SFX).includes('m007snd02'));
    assert.ok(!Object.values(MAGIC_SFX).includes('m007snd03'));
  });

  it('006 系 6 个技能播通用 arrow（原作没有 m006snd*）', () => {
    for (const s of ['004', '015', '030', '045', '072', '087']) {
      assert.equal(MAGIC_SFX[s], 'arrow', `技能 ${s}`);
    }
    assert.deepEqual(readdirSync(SFX_DIR).filter((f) => /^m006snd/i.test(f)), []);
  });
});

describe('目录级 -> 逐技能：同目录不同音', () => {
  it('dir028 的两个技能不再共用一个音（068 突襲石 m028snd01 / 095 劍輪舞 m038snd02）', () => {
    assert.equal(BY_SEQ.get(68)!.fx_dir_primary, '028');
    assert.equal(BY_SEQ.get(95)!.fx_dir_primary, '028');
    assert.equal(MAGIC_SFX['068'], 'm028snd01');
    assert.equal(MAGIC_SFX['095'], 'm038snd02');
  });

  it('dir001 的半月斬/旋龍/三日月斬 分到 3 条不同音效串', () => {
    assert.deepEqual(new Set(['050', '051', '083'].map((k) => MAGIC_SFX[k])), new Set(['m001snd01', 'm011snd01']));
    assert.equal(MAGIC_SFX['050'], 'm001snd01');
    assert.equal(MAGIC_SFX['051'], 'm011snd01');
    assert.equal(MAGIC_SFX['083'], 'm001snd01');
  });

  it('不再有任何技能整体静默（旧表缺键的 006 系/024 系都补齐了）', () => {
    const empty = Object.entries(MAGIC_SFX).filter(([, v]) => !v);
    assert.deepEqual(empty, []);
    // 旧 audio.js 对 024 系（後伏連兵/後伏兵陣/後伏軍陣）整组无键 -> 现在都有
    for (const s of ['019', '031', '037']) assert.equal(MAGIC_SFX[s], 'm002snd01');
  });
});

describe('audio.js 运行时接线', () => {
  const src = readFileSync(AUDIO_JS, 'utf8');

  it('magicSfx 已按技能号解析，且 api.magic 在查不到时返回 null', () => {
    assert.match(src, /function magicSfx\(seq\)/);
    assert.match(src, /api\.magic = function \(seq, opts\)/);
    assert.match(src, /if \(!key\) return null;/);
  });

  it('暴露 magicTable()/lastMagic() 供 ?sfxdbg=1 与浏览器验证取数', () => {
    assert.match(src, /api\.magicTable = function \(\)/);
    assert.match(src, /api\.lastMagic = function \(\)/);
    assert.match(src, /st\.lastMagic = String\(seq\) \+ ' -> ' \+ key;/);
  });

  it('调试面板会打印 magic: <技能号> -> <音效串>', () => {
    assert.match(src, /if \(st\.lastMagic\) lines\.push\('magic: ' \+ st\.lastMagic\);/);
  });
});
