// @ts-nocheck —— 被测模块 web/saves.js 是浏览器端的无类型 ESM（仓库 tsconfig 不含 web/*.js），
// 这里只验行为，不引入类型；理由同 tests/city_rules.test.ts:2。
/**
 * R196：招降面板「士氣 / 疲勞 / 勝敗場」真值的**存档层契约 + 网页接线**。
 *
 * 跑法：cd F:\sanguo\game && node --test tests/capture_fields.test.ts
 *
 * 考证（反汇编位址 / 文件行号全文见 project/196_招降字段真值.md）：
 *   · 原作 09:10 俘虜處理面板从被俘武將的 General 記錄逐行读：
 *     士氣 `0x44F222 movsx eax, word [g+0x38]` → `0x491E50`；
 *     疲勞 `0x44F25F movsx ecx, word [g+0x3A]` → `0x491E5C`；
 *     勝場 `0x44F3BE movsx eax, word [g+0x9F]` → `0x491E9C`；
 *     敗場 `0x44F3FE movsx ecx, word [g+0xA1]` → `0x491EA8`。
 *   · 勝/敗按将持久化：累加 `0x4084C9`、写档 `0x431A81`/`0x431AA2`（段4 +0xC7/+0xC9）、
 *     读档 `0x433493`/`0x4334B4`；docs/04b_战斗系统.md:68、docs/07b_存档字段详解.md:325-326。
 *   · 士氣/疲勞 也持久化（段4 +0x58/+0x5A，docs/07b:301-303），但本作只有 `save.morale`/`save.tire`
 *     两张表、只在战后按**双方主将**回写（main.js:953-975）→ 非主将俘虏没有条目，保持「—」。
 *
 * 本檔钉住的四件事：
 *   ① 旧档（没有 `generalRecord`）→ `generalRecordOf()` 返回 null → 面板灰「—」，不是 0 勝 0 敗；
 *   ② 有字段 → 取真值（夹 0..9999、坏行丢弃）；
 *   ③ 落账只写 `generalRecord` 这一个可选键：不动 wins/losses/streak/v、不删未知键、不进 SNAPSHOT_REQUIRED；
 *   ④ campaign.html 的接线（surFields 取真值、finishSurrender 落账、探针不落账、士氣/疲勞 仍走 save.morale/save.tire）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  GENERAL_RECORD_MAX,
  SNAPSHOT_VERSION,
  generalRecordOf,
  hasGeneralRecord,
  normalizeGeneralRecord,
  noteGeneralResult,
  upgradeSnapshot,
} from '../web/saves.js';

const CAMPAIGN = fs.readFileSync(new URL('../web/campaign.html', import.meta.url), 'utf8');

/** 取 `function <name>(...) { ... }` 的函数体（含大括号），找不到返回 ''；同 tests/hud_surrender191.test.ts。 */
function fnBody(src, name) {
  const at = src.indexOf(`function ${name}(`);
  if (at < 0) return '';
  const open = src.indexOf('{', src.indexOf(')', at));
  if (open < 0) return '';
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  return '';
}

// ---------------------------------------------------------------------------
// 一、存档层：normalizeGeneralRecord / generalRecordOf
// ---------------------------------------------------------------------------

test('R196：normalizeGeneralRecord 坏输入一律空表，名字 trim、数字取整夹 0..9999', () => {
  for (const bad of [null, undefined, 0, 7, 'x', [], [1, 2], true]) {
    assert.deepEqual(normalizeGeneralRecord(bad), {}, `坏输入 ${JSON.stringify(bad)} 应得空表`);
  }
  const out = normalizeGeneralRecord({
    '  關羽  ': { w: 3, l: 2 },
    張飛: { w: 99999, l: -5 },
    空行: null,
    壞行: 'nope',
    小數: { w: 2.9, l: '4' },
  });
  assert.deepEqual(out['關羽'], { w: 3, l: 2 }, '名字 trim 后入库');
  assert.deepEqual(out['張飛'], { w: GENERAL_RECORD_MAX, l: 0 }, 'w 夹到 9999、负 l 夹到 0');
  assert.deepEqual(out['小數'], { w: 2, l: 4 }, '小数截断、数字字符串照收');
  assert.ok(!('空行' in out) && !('壞行' in out), '坏行丢掉');
});

test('R196：旧档没有 generalRecord → generalRecordOf 返回 null（面板灰「—」，不是 0 勝 0 敗）', () => {
  assert.equal(generalRecordOf(undefined, '關羽'), null);
  assert.equal(generalRecordOf(null, '關羽'), null);
  assert.equal(generalRecordOf({ v: 3 }, '關羽'), null, 'v3 旧档没有这个可选键');
  assert.equal(generalRecordOf({ v: 3, generalRecord: {} }, '關羽'), null, '空表 = 没有记录');
  assert.equal(generalRecordOf({ generalRecord: { 張飛: { w: 1, l: 0 } } }, '關羽'), null, '没这个人');
  assert.equal(generalRecordOf({ generalRecord: { 張飛: { w: 1, l: 0 } } }, '  '), null, '空名字');
  assert.equal(hasGeneralRecord({ v: 3 }, '關羽'), false);
});

test('R196：有 generalRecord 时取真值（不是缺省 0），w/l 缺失按 0 算', () => {
  const save = { generalRecord: { 關羽: { w: 7, l: 3 }, 張飛: { w: 2 } } };
  assert.deepEqual(generalRecordOf(save, '關羽'), { w: 7, l: 3 });
  assert.deepEqual(generalRecordOf(save, '張飛'), { w: 2, l: 0 }, '缺 l 按 0');
  assert.equal(hasGeneralRecord(save, '關羽'), true);
  // 返回的是副本：改回去不影响存档
  const got = generalRecordOf(save, '關羽');
  got.w = 999;
  assert.equal(save.generalRecord['關羽'].w, 7);
});

// ---------------------------------------------------------------------------
// 二、存档层：noteGeneralResult（只写 generalRecord 这一个可选键）
// ---------------------------------------------------------------------------

test('R196：noteGeneralResult 败 +1 / 勝 +1 互不影响，缺省从 0 起算', () => {
  const save = {};
  assert.deepEqual(noteGeneralResult(save, '關羽', false), { w: 0, l: 1 }, '首败从 0 起');
  assert.deepEqual(noteGeneralResult(save, '關羽', false), { w: 0, l: 2 });
  assert.deepEqual(noteGeneralResult(save, '關羽', true), { w: 1, l: 2 }, '勝 +1 不动 l');
  assert.deepEqual(noteGeneralResult(save, '關羽', true), { w: 2, l: 2 });
  assert.deepEqual(generalRecordOf(save, '關羽'), { w: 2, l: 2 });
  // 别的将不受影响
  assert.equal(generalRecordOf(save, '張飛'), null);
  // 夹到 9999
  const cap = { generalRecord: { 關羽: { w: 9999, l: 9999 } } };
  assert.deepEqual(noteGeneralResult(cap, '關羽', false), { w: 9999, l: 9999 }, '不越界');
});

test('R196：noteGeneralResult 的 won 不是布尔 → null 且完全不写档（不猜结果）', () => {
  for (const bad of ['true', 1, 0, null, undefined, {}, [], NaN]) {
    const save = {};
    assert.equal(noteGeneralResult(save, '關羽', bad), null, `won=${JSON.stringify(bad)} 应拒绝`);
    assert.ok(!('generalRecord' in save), '拒绝时不写 generalRecord 键');
  }
  assert.equal(noteGeneralResult(null, '關羽', false), null, '坏 snapshot');
  assert.equal(noteGeneralResult({}, '', false), null, '空名字');
  assert.equal(noteGeneralResult({}, '   ', false), null, '空白名字');
});

test('R196：落账不删未知键、不改 v、不动既有 wins/losses/streak/bestStreak 语义', () => {
  const save = {
    v: SNAPSHOT_VERSION,
    month: 7,
    wins: 5,
    losses: 2,
    streak: 1,
    bestStreak: 3,
    defWins: 4,
    tire: { 關羽: 20 },
    morale: { 關羽: 64 },
    lastPost: { city: '洛陽', ts: 123 },
    fooUnknown: 'keep-me',
  };
  assert.equal(SNAPSHOT_VERSION, 3, '本轮不升存档版本号');
  noteGeneralResult(save, '關羽', false);
  assert.equal(save.v, 3, 'v 不变');
  assert.equal(save.wins, 5, '全局 wins 不动');
  assert.equal(save.losses, 2, '全局 losses 不动');
  assert.equal(save.streak, 1);
  assert.equal(save.bestStreak, 3);
  assert.equal(save.defWins, 4);
  assert.deepEqual(save.tire, { 關羽: 20 }, 'tire 表不被战績落账改动');
  assert.deepEqual(save.morale, { 關羽: 64 });
  assert.deepEqual(save.lastPost, { city: '洛陽', ts: 123 });
  assert.equal(save.fooUnknown, 'keep-me', '未知键一个不删');
  assert.deepEqual(save.generalRecord, { 關羽: { w: 0, l: 1 } }, '只新增 generalRecord');
});

test('R196：generalRecord 是可选字段——upgradeSnapshot 不补、不覆盖、不删，旧档照读', () => {
  // ① v2 老档（没有这个键）→ 升级不补它（补了就等于给所有旧档造记录）
  const up2 = upgradeSnapshot({ v: 2, month: 3, gold: 500, wins: 1 });
  assert.ok(up2.snapshot, 'v2 档能升级');
  assert.deepEqual(up2.steps, ['v2→v3']);
  assert.ok(!('generalRecord' in up2.snapshot), '不把 generalRecord 补进老档');
  assert.ok(!up2.filled.includes('generalRecord'), 'filled 里也不该出现');

  // ② 已有记录的档 → 升级后原样保留（不是 {}、不是丢键）
  const withRec = { v: 2, month: 3, generalRecord: { 關羽: { w: 4, l: 1 } }, foo: 'bar' };
  const up3 = upgradeSnapshot(withRec);
  assert.deepEqual(up3.snapshot.generalRecord, { 關羽: { w: 4, l: 1 } }, '记录原样往返');
  assert.equal(up3.snapshot.foo, 'bar', '未知键照旧保留');

  // ③ 已经是 v3 且字段齐的档：不再走升级（changed=false），记录不动
  const v3 = {
    v: 3, scenario: 1, month: 2, gold: 100, wins: 0, losses: 0, streak: 0, bestStreak: 0,
    defWins: 0, owned: [], cities: {}, forces: {}, generalLevel: {}, generalExp: {}, learned: {},
    loyal: {}, king: '曹操', monarch: '曹操', force: '曹操', monarchSince: 1, log: [], armies: [],
    roster: { _moved: {} }, appointed: {}, fate: {}, drift: {}, tire: {}, morale: {},
    lastActionMonth: 0, ts: 0, year: 1, yearFlag: 0, generalStatus: {}, weapon: {}, horse: {}, thing: {},
    generalRecord: { 張飛: { w: 2, l: 2 } },
  };
  const up4 = upgradeSnapshot(v3);
  assert.equal(up4.changed, false, '字段齐的 v3 档不重写');
  assert.deepEqual(up4.snapshot.generalRecord, { 張飛: { w: 2, l: 2 } });
});

// ---------------------------------------------------------------------------
// 三、网页接线：campaign.html 的 surFields / finishSurrender / 探针
// ---------------------------------------------------------------------------

test('R196：surFields 勝場/敗場 走 Saves.generalRecordOf，没有记录仍回落 null → 灰「—」', () => {
  const body = fnBody(CAMPAIGN, 'surFields');
  assert.ok(body, '必须有 surFields()');
  assert.match(body, /Saves\.generalRecordOf\(save, name\)/, '勝/敗場来源 = 存档可选键 generalRecord');
  // 十项与顺序不变（project/188 §10 + 原作 09:10 面板）
  const cellsAt = body.indexOf('const cells = [');
  const cellsSrc = body.slice(cellsAt, body.indexOf('];', cellsAt));
  const keys = [...cellsSrc.matchAll(/\[\s*'([^']+)'\s*,/g)].map((m) => m[1]);
  assert.deepEqual(keys, ['等級', '士氣', '疲勞', '武力', '智力', '忠誠', '武器', '物品', '勝場數', '敗場數']);
  // 「没有记录」的默认仍是字面 null（旧档/没打过仗的面板 → 灰「—」）
  assert.match(cellsSrc, /\['勝場數', null\]/);
  assert.match(cellsSrc, /\['敗場數', null\]/);
  // 真值覆盖只发生在 put()，且敗場 = 存档 l + 本战
  assert.match(body, /put\('勝場數', rec \? rec\.w : null\)/);
  assert.match(body, /put\('敗場數', \(rec \|\| lossNow\) \? \(rec \? rec\.l : 0\) \+ lossNow : null\)/);
  assert.match(body, /const lossNow = surBattleReal \? 1 : 0;/, '本战那 1 败只看 surBattleReal');
  assert.match(body, /class="none"/, '「—」带 .none（灰）');
});

test('R196：士氣/疲勞 仍取 save.morale / save.tire 的真实条目，缺条目保持「—」（不拿缺省 60 冒充）', () => {
  const body = fnBody(CAMPAIGN, 'surFields');
  assert.match(body, /\['士氣', hasKey\(morMap\) \? int\(morMap\[name\]\) : null\]/);
  assert.match(body, /\['疲勞', hasKey\(tireMap\) \? int\(tireMap\[name\]\) : null\]/);
  assert.match(body, /moraleNormalize\(save && save\.morale\)/);
  assert.match(body, /tireNormalize\(save && save\.tire\)/);
  assert.doesNotMatch(body, /moraleOf\(/, '不许用 moraleOf 的缺省值 60 顶替真值');
});

test('R196：finishSurrender 只在真打过的面板落账（被俘 = 该将败场 +1），探针不落账', () => {
  const finish = fnBody(CAMPAIGN, 'finishSurrender');
  assert.ok(finish, '必须有 finishSurrender()');
  assert.match(finish, /if \(surBattleReal\) \{/, '落账必须在 surBattleReal 守卫里');
  assert.match(finish, /Saves\.noteGeneralResult\(save, c\.name, false\)/, '每张卡的将都记一败');
  assert.match(finish, /for \(const c of st\.cards\)/, '按卡片（= 这一仗的俘虜）遍历');
  // surBattleReal 的来源：settleBattleReturn 里 !surProbeOn()
  const settle = fnBody(CAMPAIGN, 'settleBattleReturn');
  assert.match(settle, /surBattleReal = false;/, '每次结算先复位');
  assert.match(settle, /surBattleReal = !surProbeOn\(\);/, '真战才置真');
  assert.match(fnBody(CAMPAIGN, 'surProbeOn'), /SUR_PROBE === true/, '探针判定');
});

test('R196：验收探针種的是存档同名键（save.morale / save.tire / save.generalRecord），不改显示逻辑', () => {
  const seed = fnBody(CAMPAIGN, 'seedSurFieldsProbe');
  assert.ok(seed, '必须有 seedSurFieldsProbe()');
  assert.match(seed, /moraleSet\(save, nm\.trim\(\), Number\(val\)\)/, '?surmor → save.morale（同 main.js 战后回写）');
  assert.match(seed, /save\.tire = map;/, '?surtire → save.tire');
  assert.match(seed, /save\.generalRecord = all;/, '?surrec → save.generalRecord');
  assert.match(fnBody(CAMPAIGN, 'seedSurrenderProbe'), /seedSurFieldsProbe\(\);/, '种值只在探针路径上跑');
  // dev gate：没有 ?dev=1 时这三个键必须被剔除（project/115 §6）
  const gate = CAMPAIGN.slice(CAMPAIGN.indexOf('const DEV_QUERY_KEYS'), CAMPAIGN.indexOf('const DEV_FLAG'));
  for (const k of ['surmor', 'surtire', 'surrec']) assert.match(gate, new RegExp(`'${k}'`), `DEV_QUERY_KEYS 漏了 ${k}`);
});
