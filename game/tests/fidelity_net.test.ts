// @ts-nocheck —— 期望 JSON 是运行时产物（any），与 tests/city_rules.test.ts 同风格
/**
 * 保真校验网 · node:test 版（核心子集）
 *
 * 期望值有两种来源，全部**不写字面量**：
 *   - 原作侧：  work/fidelity/fidelity_expect.json（由 work/fidelity/gen_expect.mjs 从
 *               extract/json/*、work/sfx84/map6.json、work/dis_magicmap_skills.txt、
 *               extract/pak/SHAPE/** 生成）
 *   - 运行期侧：game/data/*.json 与 game/src/core/*.ts（本测试直读 TS，走 node 原生剥离）
 *
 * 单独的完整版（含 PASS/FAIL/WARN 分级、--only 过滤、dist 模式）是 work/fidelity/check.mjs；
 * 这里只保留每次 `node --test tests/*.test.ts` 都能跑的硬断言。
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import * as B from '../src/core/battle.ts';
import * as W from '../src/core/wises.ts';
import * as S from '../src/core/strategy.ts';
import * as M from '../src/core/march.ts';
import * as L from '../src/core/levels.ts';
import * as G from '../src/core/garrison.ts';
import * as A from '../src/core/audio_bus.ts';
import * as U from '../src/core/unlock.ts';
import * as LAYOUT from '../src/view/layout.ts';
import * as PROJ from '../src/view/mapProj.ts';

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const DATA_DIR = fileURLToPath(new URL('../data/', import.meta.url));
const E = readJson(fileURLToPath(new URL('../../work/fidelity/fidelity_expect.json', import.meta.url)));

const data = {
  magics: readJson(DATA_DIR + 'magics.json'),
  wises: readJson(DATA_DIR + 'wises.json'),
  troops: readJson(DATA_DIR + 'troops.json'),
  terrains: readJson(DATA_DIR + 'terrains.json'),
  generals: readJson(DATA_DIR + 'generals.json'),
  items: readJson(DATA_DIR + 'items.json'),
  scenarios: readJson(DATA_DIR + 'scenarios.json'),
  formations: readJson(DATA_DIR + 'formations.json'),
  garrison: readJson(DATA_DIR + 'garrison.json'),
  levels_by_scenario: readJson(DATA_DIR + 'levels_by_scenario.json'),
};

const EQ = (a, b, msg) => assert.deepEqual(a, b, msg);
const NE = (a, b, msg) => assert.notDeepEqual(a, b, msg);
const ROOT = fileURLToPath(new URL('../../', import.meta.url));

// ── 数据条数 / 序号 ─────────────────────────────────────────────────────────
describe('保真网·原作数据条数', () => {
  test('武将技 110 条（MAGIC.INI）', () => {
    assert.equal(data.magics.length, E.counts.magics);
  });
  test('军师技 67 条（MAGIC.INI [WISE]）', () => {
    assert.equal(data.wises.length, E.counts.wises);
  });
  test('兵种 13 个名称（XLS 宝典）', () => {
    EQ(data.troops.names, E.troops.names);
  });
  test('地形 12 条（SANGO.INI [TERRAIN]）', () => {
    assert.equal(data.terrains.length, E.counts.terrains);
  });
  test('武将 401 条（TIMES GENERAL，含 id0 模板）', () => {
    assert.equal(data.generals.length, E.counts.generals);
  });
  test('剧本 5 个（TIMES1..5）', () => {
    assert.equal(data.scenarios.length, E.counts.scenarios);
  });
  test('每个剧本 60 城', () => {
    for (const sc of data.scenarios) assert.equal(sc.cities.length, E.counts.citiesPerScenario);
  });
  test('每个剧本 116 条路', () => {
    for (const sc of data.scenarios) assert.equal(sc.paths.length, E.counts.pathsPerScenario);
  });
  test('每个剧本 39 条 Length=30000 哨兵', () => {
    for (const sc of data.scenarios) {
      const sent = sc.paths.filter((p) => Number(p.Length) >= E.origin.sentinelLength);
      assert.equal(sent.length, E.counts.sentinelPerScenario);
    }
  });
  test('武将技 SEQUENCE 1..N 连续', () => {
    data.magics.forEach((m, i) => assert.equal(Number(m.SEQUENCE), i + 1));
  });
  test('军师技 SEQUENCE 1..N 连续', () => {
    data.wises.forEach((w, i) => assert.equal(Number(w.SEQUENCE), i + 1));
  });
  test('武将 id 与数组下标一致、SEQUENCE 连续', () => {
    data.generals.forEach((g, i) => {
      assert.equal(Number(g.id), i);
      if (i > 0) assert.equal(Number(g.SEQUENCE), i);
    });
  });
  test('id0 是「盜賊」模板（BaseEXP/TYPE）', () => {
    assert.equal(data.generals[0].NAME, E.generals.rows[0].name);
    assert.equal(Number(data.generals[0].BaseEXP), E.generals.rows[0].baseExp);
    assert.equal(Number(data.generals[0].TYPE), E.generals.rows[0].type);
  });
});

// ── 武将技 ──────────────────────────────────────────────────────────────────
describe('保真网·武将技', () => {
  test('110 条 INI 字段逐条一致（seq/name/mp/power/attack/script/attrib/title/note/active）', () => {
    const bad = [];
    for (const em of E.magics) {
      const m = data.magics[em.seq - 1];
      const pairs = [[m.SEQUENCE, em.seq], [m.NAME, em.name], [m.MP, em.mp], [m.POWER, em.power],
        [m.ATTACK, em.attack], [m.SCRIPT, em.script], [m.ATTRIB, em.attrib],
        [m.TITLE, em.title], [m.NOTE, em.note], [m.ACTIVE, em.active]];
      for (const [got, want] of pairs) if (String(got) !== String(want)) bad.push(`${em.seq}:${got}≠${want}`);
    }
    EQ(bad, []);
  });
  test('POWER 全等于期望值（全 100 = 满气条百分比）', () => {
    for (const em of E.magics) assert.equal(Number(data.magics[em.seq - 1].POWER), em.power);
  });
  test('MP（技力消耗）全等于期望值', () => {
    for (const em of E.magics) assert.equal(Number(data.magics[em.seq - 1].MP), em.mp);
  });
  test('SCRIPT（MAGIC.SO 入口）全等于期望值', () => {
    for (const em of E.magics) assert.equal(Number(data.magics[em.seq - 1].SCRIPT), em.script);
  });
  test('ATTACK 全等于期望值', () => {
    for (const em of E.magics) assert.equal(Number(data.magics[em.seq - 1].ATTACK), em.attack);
  });
  test('每个技能的音效名都取自 MAGIC.SO 的 PUSHS 字符串集合', () => {
    for (const em of E.magics) {
      const got = A.magicSfxName(em.seq);
      assert.ok(em.sfx.all.includes(got), `seq ${em.seq} 音效 ${got} 不在 ${em.sfx.all.join('|')}`);
    }
  });
  test('MAGIC_SFX 键 = SEQUENCE 三位补零，110 条全覆盖', () => {
    const keys = Object.keys(A.MAGIC_SFX).sort();
    EQ(keys, E.magics.map((m) => String(m.seq).padStart(3, '0')).sort());
  });
  test('气力消耗 = qiPercent × QI_MAX/100（POWER 当百分比，[推测]口径回归）', () => {
    for (const em of E.magics) {
      assert.equal(B.qiCostOf(data, em.seq), Math.round(em.qiPercent * E.origin.qiMax / 100));
    }
  });
  test('特效驻留 = clamp(round(帧数×2.2),24,132)；无帧→默认 30（[推测]口径回归）', () => {
    for (const em of E.magics) {
      const frames = Number(data.magics[em.seq - 1].fx_frames) || 0;
      const ttl = B.fxTtlOf(data, em.seq);
      if (frames <= 0) {
        assert.equal(ttl, B.FX_TTL_DEFAULT);
      } else {
        const want = Math.min(B.FX_TTL_MAX, Math.max(B.FX_TTL_MIN, Math.round(frames * B.FX_TICK_PER_FRAME)));
        assert.equal(ttl, want);
      }
    }
  });
  test('magicBySeq 按 SEQUENCE 取到同名技能', () => {
    for (const em of E.magics) assert.equal(B.magicBySeq(data, em.seq)?.NAME, em.name);
  });
  test('MAGIC_SO 音效名同时接受数字与字符串序号', () => {
    assert.equal(A.magicSfxName(1), A.magicSfxName('1'));
    assert.equal(A.magicSfxName(1), E.magics[0].sfx.primary);
  });
});

// ── 军师技 ──────────────────────────────────────────────────────────────────
describe('保真网·军师技', () => {
  test('67 条 INI 字段逐条一致（Execute/WiseLevel/Level/ATTRIB/ACTIVE）', () => {
    const bad = [];
    for (const ew of E.wises) {
      const w = data.wises[ew.seq - 1];
      const pairs = [[w.SEQUENCE, ew.seq], [w.NAME, ew.name], [w.Execute, ew.execute],
        [w.WiseLevel, ew.wiseLevel], [w.Level, ew.level], [String(w.ATTRIB), String(ew.attrib)],
        [w.ACTIVE, ew.activeMask]];
      for (const [got, want] of pairs) if (String(got) !== String(want)) bad.push(`${ew.seq}:${got}≠${want}`);
    }
    EQ(bad, []);
  });
  test('ACTIVE 目标码分布 = 期望（1/2/4/8 四值）', () => {
    const hist = {};
    for (const ew of E.wises) hist[ew.activeMask] = (hist[ew.activeMask] || 0) + 1;
    const got = {};
    for (const w of data.wises) got[Number(w.ACTIVE)] = (got[Number(w.ACTIVE)] || 0) + 1;
    EQ(got, hist);
  });
  test('Execute 执行代码 67 条互不重复', () => {
    assert.equal(new Set(data.wises.map((w) => Number(w.Execute))).size, data.wises.length);
  });
  test('策略表按 Execute 建表且覆盖全部军师技', () => {
    assert.equal(S.STRATEGY_TABLE.length, data.wises.length);
    const table = new Set(S.STRATEGY_TABLE.map((d) => Number(d.exec)));
    for (const w of data.wises) assert.ok(table.has(Number(w.Execute)), `Execute ${w.Execute} 无策略定义`);
  });
  test('WISE_SPECS 键落在 1..67 且结构合法', () => {
    for (const [k, v] of Object.entries(W.WISE_SPECS)) {
      const seq = Number(k);
      assert.ok(seq >= 1 && seq <= data.wises.length);
      assert.equal(typeof v.kind, 'string');
      assert.ok(v.target === 'self' || v.target === 'enemy');
      assert.equal(typeof v.op, 'string');
      assert.ok(Number.isFinite(v.value));
    }
  });
  test('parseWiseSkill 还原 TIMES 的军师技学习行（401 将）', () => {
    const bad = [];
    for (const r of E.generals.rows.slice(1)) {
      const got = W.parseWiseSkill(data.generals[r.id]);
      if (JSON.stringify(got) !== JSON.stringify(r.wiseSkills)) bad.push(r.id);
    }
    EQ(bad, []);
  });
  test('99 级时每个武将都有可学军师技（listWisdomChoices 非空）', () => {
    const empty = E.generals.rows.slice(1).filter((r) => W.listWisdomChoices(data, data.generals[r.id]).length === 0);
    EQ(empty.map((r) => r.id), []);
  });
  test('军师技 1 应用后士气 + WISE_SPECS[1].value', () => {
    const world = B.createWorld({ data });
    const before = world.sides.A.morale;
    W.applyWise(world, 'A', 1);
    assert.equal(world.sides.A.morale - before, W.WISE_SPECS[1].value);
  });
});

// ── 兵种 ────────────────────────────────────────────────────────────────────
describe('保真网·兵种相克与攻速', () => {
  test('13×13 相克矩阵等于 XLS 宝典', () => {
    data.troops.matrix.forEach((row, i) => {
      assert.equal(row.name, data.troops.names[i]);
      EQ(row.vs, E.troops.matrix[i]);
    });
  });
  test('troopBonus 169 格与矩阵逐格一致，对角为 0', () => {
    for (let i = 0; i < E.troops.matrix.length; i++) {
      for (let j = 0; j < E.troops.matrix.length; j++) {
        assert.equal(B.troopBonus(data, i, j), E.troops.matrix[i][j], `${i},${j}`);
      }
      assert.equal(B.troopBonus(data, i, i), 0);
    }
  });
  test('攻击间隔 = 40 帧（unit+0x34=0x28），主将与士兵同值', () => {
    assert.equal(B.actionIntervalOf({ isGeneral: true }), E.troops.attackIntervalFrames);
    assert.equal(B.actionIntervalOf({ isGeneral: false }), E.troops.attackIntervalFrames);
    assert.equal(B.ACTION_INTERVAL_TICKS, E.troops.attackIntervalFrames);
    assert.equal(B.ATTACK_COOLDOWN, E.troops.attackIntervalFrames);
  });
  test('战斗 tick 60Hz', () => {
    assert.equal(B.TICK_HZ, E.origin.tickHz);
  });
});

// ── 地形 ────────────────────────────────────────────────────────────────────
describe('保真网·地形', () => {
  test('12 条 SANGO.INI 字段逐条一致', () => {
    const bad = [];
    for (const et of E.terrains) {
      const t = data.terrains[et.seq];
      const pairs = [[t.Sequence, et.seq], [t.Name, et.name], [t.SoundTrack, et.soundtrack],
        [t.Floor, et.floor], [t.Foreground, et.foreground], [t.Midground, et.midground],
        [t.Background, et.background]];
      for (const [got, want] of pairs) if (JSON.stringify(got) !== JSON.stringify(want)) bad.push(`${et.seq}:${got}`);
    }
    EQ(bad, []);
  });
  test('Floor 1 张 + FG/MG/BG 各 2 张资源都存在', () => {
    for (const et of E.terrains) {
      for (const f of [et.files.floor, ...et.files.fg, ...et.files.mg, ...et.files.bg]) {
        assert.ok(existsSync(ROOT + f), `缺资源 ${f}`);
      }
    }
  });
});

// ── 武将 ────────────────────────────────────────────────────────────────────
describe('保真网·武将', () => {
  test('FACE 引用与 TIMES 一致，且 FACE001..400 文件都在', () => {
    for (const r of E.generals.rows) {
      assert.equal(String(data.generals[r.id].FACE), r.face);
      assert.ok(existsSync(ROOT + r.faceFile), `缺 ${r.faceFile}`);
    }
  });
  test('TYPE = XLS 群英2「图形的类型」', () => {
    for (const r of E.generals.rows) assert.equal(Number(data.generals[r.id].TYPE), r.type);
  });
  test('TYPE 分布回归', () => {
    const hist = {};
    for (const r of E.generals.rows) hist[r.type] = (hist[r.type] || 0) + 1;
    EQ(hist, E.generals.typeHistogram);
  });
  test('TYPE→造型映射（generalAtlas SHAPE_OF_TYPE）等于期望表', () => {
    const src = readFileSync(ROOT + 'game/src/view/generalAtlas.ts', 'utf8');
    const m = src.match(/SHAPE_OF_TYPE\s*=\s*\[([^\]]+)\]/);
    assert.ok(m, 'generalAtlas.ts 里找不到 SHAPE_OF_TYPE');
    const got = m[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, ''));
    EQ(got, E.generals.shapeOfType);
  });
  test('STR/INT 与 XLS 群英2 400 行一致', () => {
    for (const [seq, war, int] of E.generals.xlsWarInt) {
      assert.equal(Number(data.generals[seq].STR), war);
      assert.equal(Number(data.generals[seq].INT), int);
    }
  });
  test('learnTableOf(SKILL) 还原 TIMES 武将技学习行', () => {
    const bad = [];
    for (const r of E.generals.rows.slice(1)) {
      const got = U.learnTableOf(data, r.name, 'SKILL').map((x) => [Number(x.level), Number(x.seq)]);
      if (JSON.stringify(got) !== JSON.stringify(r.skills)) bad.push(r.id);
    }
    EQ(bad, []);
  });
  test('learnTableOf(WISESKILL) 还原 TIMES 军师技学习行', () => {
    const bad = [];
    for (const r of E.generals.rows.slice(1)) {
      const got = U.learnTableOf(data, r.name, 'WISESKILL').map((x) => [Number(x.level), Number(x.seq)]);
      if (JSON.stringify(got) !== JSON.stringify(r.wiseSkills)) bad.push(r.id);
    }
    EQ(bad, []);
  });
  test('武将技学习等级与技能号不越界', () => {
    for (const r of E.generals.rows.slice(1)) {
      for (const [lv, seq] of r.skills) {
        assert.ok(lv >= 1 && lv <= U.LEARN_MAX_LEVEL, `${r.id} 等级 ${lv}`);
        assert.ok(seq >= 1 && seq <= data.magics.length, `${r.id} 技能 ${seq}`);
      }
    }
  });
});

// ── 剧本：城与路 ────────────────────────────────────────────────────────────
describe('保真网·剧本城池与路径', () => {
  test('60 城坐标与 TIMES 一致且落在 1280×960 内', () => {
    for (const es of E.scenarios) {
      const sc = data.scenarios[es.id - 1];
      es.cities.forEach((ec, i) => {
        assert.equal(sc.cities[i].NAME, ec.name);
        EQ(sc.cities[i].POS, [ec.x, ec.y]);
        assert.ok(ec.x >= 0 && ec.x <= E.origin.mapW && ec.y >= 0 && ec.y <= E.origin.mapH, `${ec.name} 越界`);
      });
    }
  });
  test('116 条路 Start/End/Length 与 TIMES 一致', () => {
    for (const es of E.scenarios) {
      const sc = data.scenarios[es.id - 1];
      es.paths.forEach((ep, i) => {
        assert.equal(sc.paths[i].Start, ep.start);
        assert.equal(sc.paths[i].End, ep.end);
        assert.equal(Number(sc.paths[i].Length), ep.length);
      });
    }
  });
  test('路点数量与首末点一致（times 扁平 ↔ data 点对）', () => {
    for (const es of E.scenarios) {
      const sc = data.scenarios[es.id - 1];
      es.paths.forEach((ep, i) => {
        const pts = sc.paths[i].points;
        assert.equal(pts.length, ep.npts, `${es.id}#${i + 1}`);
        NE(pts[0], undefined);
      });
    }
  });
  test('77 条真路把 60 城连成 1 个连通分量', () => {
    for (const es of E.scenarios) {
      const adj = new Map();
      for (const p of es.paths.filter((x) => !x.sentinel)) {
        for (const [a, b] of [[p.start, p.end], [p.end, p.start]]) {
          if (!adj.has(a)) adj.set(a, new Set());
          adj.get(a).add(b);
        }
      }
      const start = es.cities[0].name;
      const seen = new Set([start]);
      const queue = [start];
      while (queue.length) {
        const cur = queue.shift();
        for (const nx of adj.get(cur) || []) if (!seen.has(nx)) { seen.add(nx); queue.push(nx); }
      }
      EQ(es.cities.map((c) => c.name).filter((n) => !seen.has(n)), []);
    }
  });
  test('计时 BaseEXP → defaultLevel 与 levels_by_scenario 一致', () => {
    for (const es of E.scenarios) {
      const lb = (data.levels_by_scenario.scenarios || []).find((x) => Number(x.id) === es.id);
      assert.ok(lb, `levels_by_scenario 缺剧本 ${es.id}`);
      assert.equal(es.levels.baseExpCommon, lb.baseExpCommon);
      assert.equal(es.levels.defaultLevel, L.levelFromExp(es.levels.baseExpCommon));
    }
  });
});

// ── 等级 / 带兵数（VA 级证据）───────────────────────────────────────────────
describe('保真网·等级与带兵数', () => {
  test('expToReach(k) 全表 = 期望（0x409EE0）', () => {
    for (let k = 1; k <= E.origin.expTable.length; k++) {
      assert.equal(B.expToReach(k), E.origin.expTable[k - 1], `k=${k}`);
    }
  });
  test('levelFromExp(expToReach(k)) 往返回到 k（0x409F73）', () => {
    for (let k = 1; k <= E.origin.expTable.length; k++) {
      assert.equal(L.levelFromExp(B.expToReach(k)), k, `k=${k}`);
    }
  });
  test('troopCapOf(lv)=max(1,min(lv*5,100))（0x409FB6）', () => {
    for (let lv = 1; lv <= E.origin.expTable.length; lv++) {
      assert.equal(L.troopCapOf(lv), Math.max(1, Math.min(lv * 5, 100)), `lv=${lv}`);
    }
  });
  test('cavalryCapOf(lv)=max(0,min((lv-20)*5,100))（0x409FD8）', () => {
    for (let lv = 1; lv <= E.origin.expTable.length; lv++) {
      assert.equal(L.cavalryCapOf(lv), Math.max(0, Math.min((lv - 20) * 5, 100)), `lv=${lv}`);
    }
  });
  test('startLevelOf(BaseEXP) = levelFromExp(BaseEXP)（0x42D38B→0x409F73）', () => {
    for (const r of E.generals.rows) {
      assert.equal(L.startLevelOf({ BaseEXP: r.baseExp }), E.origin.levelTable[String(r.baseExp)], `id=${r.id}`);
    }
  });
});

// ── 守城战配置 ──────────────────────────────────────────────────────────────
describe('保真网·守城战配置', () => {
  test('300 城 battleSetup 不抛错、enemyTroops 在 1..200', () => {
    for (let si = 0; si < data.scenarios.length; si++) {
      for (const city of data.scenarios[si].cities) {
        const bs = G.battleSetup(data, si, city.NAME, 100, { troopMode: 'exe' });
        assert.ok(bs && Number.isFinite(bs.enemyTroops), `${si}:${city.NAME}`);
        assert.ok(bs.enemyTroops >= 1 && bs.enemyTroops <= 200, `${si}:${city.NAME} troop=${bs.enemyTroops}`);
      }
    }
  });
  test('reserve 模式 = clamp(round(守军/6),60,100)', () => {
    for (const cityName of ['襄平', '洛陽', '成都']) {
      const g = G.garrisonOf(data, 0, cityName);
      assert.ok(g, `缺城 ${cityName}`);
      const bs = G.battleSetup(data, 0, cityName, 100, { troopMode: 'reserve' });
      const want = Math.min(100, Math.max(60, Math.round((Number(g.garrison) || 0) / 6)));
      assert.equal(bs.enemyTroops, want, cityName);
    }
  });
});

// ── 战斗内核 ────────────────────────────────────────────────────────────────
describe('保真网·战斗内核', () => {
  test('createWorld 气力初值 = 0xEA60（60000）', () => {
    const world = B.createWorld({ data });
    assert.equal(world.sides.A.general.qi, E.origin.qiStart);
    assert.ok(world.units.length > 0);
  });
  test('补血技 cast 立即回血（满血时 healed=0 不算异常）', () => {
    const world = B.createWorld({ data });
    world.sides.A.general.hp = 1;
    const healSeq = E.magics.find((m) => m.castKind === 'heal' && m.mp > 0).seq;
    const r = B.cast(world, 'A', healSeq);
    assert.equal(r.ok, true);
    assert.ok(world.sides.A.general.hp > 1);
  });
  test('cast 扣 MP = MAGIC.INI 的 MP、扣气力 = qiCostOf', () => {
    const world = B.createWorld({ data });
    const em = E.magics.find((m) => m.castKind !== 'heal' && m.mp > 0);
    const mp0 = world.sides.A.general.mp;
    const qi0 = world.sides.A.general.qi;
    B.cast(world, 'A', em.seq);
    assert.equal(mp0 - world.sides.A.general.mp, em.mp);
    assert.equal(qi0 - world.sides.A.general.qi, Math.round(B.qiCostOf(data, em.seq) * B.qiCostMul(world, 'A')));
  });
  test('气力不足时拒绝施放（reason=qi）', () => {
    const world = B.createWorld({ data });
    world.sides.A.general.qi = 0;
    const r = B.cast(world, 'A', E.magics[0].seq);
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'qi');
  });
  test('哨兵路不可通行、真路可通行（march.pathBetween）', () => {
    assert.equal(M.SENTINEL_LENGTH, E.origin.sentinelLength);
    const sc = data.scenarios[0];
    const real = sc.paths.find((p) => Number(p.Length) < E.origin.sentinelLength);
    assert.notEqual(M.pathBetween(sc, real.Start, real.End), null);
    const sent = sc.paths.find((p) => Number(p.Length) >= E.origin.sentinelLength);
    const twin = sc.paths.find((p, j) => j !== sc.paths.indexOf(sent) &&
      Number(p.Length) < E.origin.sentinelLength &&
      ((p.Start === sent.Start && p.End === sent.End) || (p.Start === sent.End && p.End === sent.Start)));
    if (!twin) assert.equal(M.pathBetween(sc, sent.Start, sent.End), null);
  });
});

// ── 竖屏差异（不是缺口，只钉住几何关系）────────────────────────────────────
describe('保真网·竖屏几何', () => {
  test('战场可视行数 = FIELD_H / ROW_PX，且高于原作横屏视野', () => {
    assert.equal(LAYOUT.VISIBLE_ROWS, LAYOUT.FIELD_H / (96 * (750 / 1008)));
    assert.ok(LAYOUT.VISIBLE_ROWS > E.origin.gridH / 2, '竖屏纵深应大于原作的一半场高');
  });
  test('地图 1280×960 装进竖屏时 contain 保比例（letterbox 是版面决策）', () => {
    const box = PROJ.fitBox(LAYOUT.DESIGN_W, LAYOUT.FIELD_H, 'contain');
    const scale = Math.min(LAYOUT.DESIGN_W / E.origin.mapW, LAYOUT.FIELD_H / E.origin.mapH);
    assert.ok(Math.abs(scale - Math.min(box.width / E.origin.mapW, box.height / E.origin.mapH)) < 1e-6);
    assert.ok(box.width <= LAYOUT.DESIGN_W + 1e-6 && box.height <= LAYOUT.FIELD_H + 1e-6);
    assert.ok(box.width < LAYOUT.DESIGN_W - 1 || box.height < LAYOUT.FIELD_H - 1, 'contain 必须在某一方向留边');
  });
});
