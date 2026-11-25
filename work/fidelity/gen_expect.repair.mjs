#!/usr/bin/env node
/**
 * 保真校验�?· 期望值生成器（一次�生成，落盘�?check.mjs / fidelity_net.test.ts 比��? *
 * 输入全部�?*原作�?*材料，运行时实现�行不读：
 *   extract/json/magic.json            MAGIC.INI（cp950）�条解析结果 + 分类
 *   extract/json/sango.json            SANGO.INI [TERRAIN] 12 �? *   extract/json/times1..5.json        TIMES1..5.INI�?0 �?/ 116 �?/ 15 君主 / 401 �? *   extract/json/xls_*.json            XLS 宝典�?10 � / 67 军师� / 13 兵� / 60 �?/ 116 �?/ 400 �? *   extract/json/stats_paths.json      116 跇� 39 �?30000 哨兵的统�? *   work/sfx84/map6.json               110 �的音�?特效盽�证据（含 A/A2/C/X 证级�?via�? *   work/dis_magicmap_skills.txt       110 �反汇编（75 段有直证音效串）
 *   docs/*.md                          兼��?VA 出�（� EVID�? *   extract/pak/SHAPE/**               原作美术资源昐�存在（FACE / BG / MAJOR\BODY�? *
 * 叆� work/fidelity/fidelity_expect.json，不�?game/**�? * 用法：node work/fidelity/gen_expect.mjs [--quiet]
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const OUT = path.join(HERE, 'fidelity_expect.json');
const QUIET = process.argv.includes('--quiet');

const log = (...a) => { if (!QUIET) console.log(...a); };
const J = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const sha16 = (buf) => crypto.createHash('sha1').update(buf).digest('hex').slice(0, 16);
const exists = (p) => fs.existsSync(path.join(ROOT, p));

// �� 证据簿：每条都带 file:line �?VA ������������������������������������������
const EVID = {
  tick40: '见 project/192（R192 修复：原始证据串在编码事故中损坏，数值期望未变）',
  tickHz60: 'project/190_主将与士兵�度裁决.md（p5�?0x34 单位 = 引擎 tick；录像实�?66�?9 Hz�? project/192_引擎节拍60Hz.md + game/src/core/battle.ts TICK_HZ=60（R192 取最保守�档，不是原作真�）',
  qiMax: '见 project/192（R192 修复：原始证据串在编码事故中损坏，数值期望未变）',
  expFormula: '见 project/192（R192 修复：原始证据串在编码事故中损坏，数值期望未变）',
  troopCap: '见 project/192（R192 修复：原始证据串在编码事故中损坏，数值期望未变）',
  sentinel: '见 project/192（R192 修复：原始证据串在编码事故中损坏，数值期望未变）',
  magicIni: 'extract/json/magic.json entries[kind=magic]（MAGIC.INI cp950 逐字段）�?extract/json/xls_武将�.json 110 行数值（序号/��?能量/攻击�?调用代码�? 巼�',
  magicCategory: 'extract/json/magic.json entries[].category / category_rule（��?Attribute+攻击力判定）',
  wiseIni: '见 project/192（R192 修复：原始证据串在编码事故中损坏，数值期望未变）',
  wiseTarget: '见 project/192（R192 修复：原始证据串在编码事故中损坏，数值期望未变）',
  sfx: 'work/sfx84/map6.json �?seq {dir,dirs,snd,grade,via,deep,A,C,B,all}；work/dis_magicmap_skills.txt 75 段�音效字符串:」直证；docs/05c_MAGIC特效映射.md:66-67�?18058 PUSHS "m016snd01" / SYSCALL 0x301」，:411 指向该反汇编',
  troopMatrix: 'extract/json/xls_兵�.json 13×13（header 首列为空列）�?game/data/troops.json.matrix 0 巼�',
  terrain: 'extract/json/sango.json terrain[12]（SANGO.INI [TERRAIN]，字�?Sequence/Name/SoundTrack/Floor/Foreground/Midground/Background）；资源�?extract/pak/SHAPE/BG/',
  generalTimes: 'extract/json/times1..5.json GENERAL 段各 401 条（name/face/str/int/max_hp/max_mp/base_exp/loyal/spirit/constancy/type/skills/wise_skills/pos…）；与 extract/json/xls_群英2.json 400 行��?0 巼�',
  typeShape: '见 project/192（R192 修复：原始证据串在编码事故中损坏，数值期望未变）',
  faces: '见 project/192（R192 修复：原始证据串在编码事故中损坏，数值期望未变）',
  cities: 'extract/json/times1..5.json cities[60] �?extract/json/xls_城池.json 60 行（序号/名称/坐标/等级/旗帜�? 巼�',
  paths: 'extract/json/times1..5.json paths[116] �?extract/json/xls_跾�.json 116 行（�?�?长度/跂��? 巼�',
  qiPercent: '见 project/192（R192 修复：原始证据串在编码事故中损坏，数值期望未变）',
  castKind: '见 project/192（R192 修复：原始证据串在编码事故中损坏，数值期望未变）',
  activeMask: '见 project/192（R192 修复：原始证据串在编码事故中损坏，数值期望未变）',
  fxTtl: '见 project/192（R192 修复：原始证据串在编码事故中损坏，数值期望未变）',
  marchSpeed: '见 project/192（R192 修复：原始证据串在编码事故中损坏，数值期望未变）',
  formationNote: '阵营阵形不在�校验范围（game/data/formations.json names 9 / matrix 11，含 2 丝�玩�阵）',
  verticalMap: '见 project/192（R192 修复：原始证据串在编码事故中损坏，数值期望未变）',
  verticalBattle: '见 project/192（R192 修复：原始证据串在编码事故中损坏，数值期望未变）',
  verticalDesign: '见 project/192（R192 修复：原始证据串在编码事故中损坏，数值期望未变）',
};

// �� 原作材料 ����������������������������������������������������������������
const magicIni = J('extract/json/magic.json');
const sango = J('extract/json/sango.json');
const xlsMagic = J('extract/json/xls_武将�.json');
const xlsWise = J('extract/json/xls_军师�.json');
const xlsTroop = J('extract/json/xls_兵�.json');
const xlsCity = J('extract/json/xls_城池.json');
const xlsPath = J('extract/json/xls_跾�.json');
const xlsGen = J('extract/json/xls_群英2.json');
const statsPaths = J('extract/json/stats_paths.json');
const times = [1, 2, 3, 4, 5].map((i) => J(`extract/json/times${i}.json`));
const map6 = J('work/sfx84/map6.json');
const levelsMeta = J('game/data/levels_by_scenario.json');
const dataMagic = J('game/data/magics.json');
const dataWises = J('game/data/wises.json');
const dataGenerals = J('game/data/generals.json');

const disText = fs.readFileSync(path.join(ROOT, 'work/dis_magicmap_skills.txt'), 'utf8');
const disSfx = new Map();
for (const block of disText.split(/^#(?=\d+ )/m).filter((s) => /^\d+ /.test(s))) {
  const seq = Number(/^(\d+) /.exec(block)[1]);
  const m = /音效字��?\s*([^\r\n]*)/.exec(block);
  if (m) disSfx.set(seq, m[1].split(',').map((s) => s.trim()).filter(Boolean));
}

// �� 兼�（原作侧，独立于运�时实现）������������������������������������������
const expToReach = (k) => (k > 99 ? 9999999 : (((k - 1) * 137 - 34) * k) / 2 + 17);
const levelFromExpOrig = (exp) => {
  for (let i = 0; i < 99; i++) if (exp < expToReach(i)) return i - 1;
  return 99;
};
const LEVEL_TABLE = { '200': levelFromExpOrig(200), '9999': levelFromExpOrig(9999) };

// �� 音效期望：dis 直证优先，其�?map6 的策展�?�������������������������������
function sfxOf(seq) {
  const direct = disSfx.get(seq) || [];
  const row = map6.find((m) => m.seq === seq) || {};
  const curated = row.all?.length ? row.all : (row.snd ? [row.snd] : []);
  const all = [...new Set(direct.length ? direct : curated)];
  const grade = direct.length ? (row.grade === 'X' ? 'A' : row.grade || 'A') : (row.grade || 'X');
  return {
    primary: all[0] || '',
    all,
    grade,
    via: row.via || (direct.length ? 'dis 直证' : ''),
    direct: direct.length > 0,
    gradeRaw: row.grade || '',
  };
}

// �� 110 � �����������������������������������������������������������������
const magicEntries = magicIni.entries.filter((e) => e.kind === 'magic');
const xlsMagicBySeq = new Map(xlsMagic.rows.map((r) => [Number(r[0]), r]));
const magics = magicEntries.map((e) => {
  const x = xlsMagicBySeq.get(e.sequence) || [];
  const attrib = e.attrib || '';
  const castKind = /補�|補兵/.test(attrib)
    ? 'heal'
    : e.attack >= 40
      ? 'aoe'
      : 'strike';
  const qiPercent = Math.min(80, Math.max(20, Math.round(e.mp)));
  return {
    seq: e.sequence,
    name: e.name,
    mp: e.mp,
    power: e.power,
    attack: e.attack,
    script: e.script,
    attrib,
    attribTags: e.attrib_tags,
    title: e.title,
    note: e.note,
    active: e.active,
    activeMask: e.active_mask,
    activeBits: e.active_bits,
    category: e.category,
    grade: 'L1',
    xls: { seq: Number(x[0]), mp: Number(x[2]), power: Number(x[3]), attack: Number(x[4]), script: Number(x[5]) },
    castKind,
    castKindGrade: '[推断]',
    qiPercent,
    qiPercentGrade: '[推测]',
    fx: { dir: (map6.find((m) => m.seq === e.sequence) || {}).dir, dirs: (map6.find((m) => m.seq === e.sequence) || {}).dirs, func: (map6.find((m) => m.seq === e.sequence) || {}).func },
    sfx: sfxOf(e.sequence),
    evidence: [EVID.magicIni, EVID.sfx, EVID.qiPercent],
  };
});

// �� 67 军师� ���������������������������������������������������������������
const wiseEntries = magicIni.entries.filter((e) => e.kind === 'wise');
const xlsWiseBySeq = new Map(xlsWise.rows.map((r) => [Number(r[0]), r]));
const wises = wiseEntries.map((e) => {
  const x = xlsWiseBySeq.get(e.sequence) || [];
  return {
    seq: e.sequence,
    name: e.name,
    execute: e.execute,
    wiseLevel: e.wise_level,
    level: e.level,
    attrib: e.attrib,
    activeMask: e.active_mask,
    activeBits: e.active_bits,
    targetClass: e.active_bits[0] || '',
    targetGrade: '[推测]',
    xls: { seq: Number(x[0]), execute: Number(x[1]), wiseLevel: Number(x[2]), level: Number(x[5]), target: Number(x[6]) },
    evidence: [EVID.wiseIni, EVID.wiseTarget],
  };
});

// �� 13 兵� ����������������������������������������������������������������
const troopNames = xlsTroop.header.slice(1);
const troops = {
  count: troopNames.length,
  names: troopNames,
  matrix: xlsTroop.rows.map((r) => r.slice(1).map(Number)),
  matrixSource: 'extract/json/xls_兵�.json rows[i][1..13]',
  attackIntervalFrames: 40,
  attackIntervalGrade: 'A',
  tickHz: 60,
  perTroopSpeedField: false,
  note: '原作 13 兵�没有各自的攻�?移动字�：攻击间隔统��?unit+0x34=0x28�?0 帧）决定；�度�?MOVE_PER_TICK 全局系数决定',
  evidence: [EVID.tick40, EVID.tickHz60, EVID.troopMatrix],
};

// �� 12 地形 ����������������������������������������������������������������
const pakRel = (p) => 'extract/pak/SHAPE/' + String(p).replace(/\\/g, '/').replace(/^SHAPE\//, '');
const terrains = sango.terrain.map((t) => {
  const files = {
    floor: pakRel(t.floor),
    fg: t.foreground.map(pakRel),
    mg: t.midground.map(pakRel),
    bg: t.background.map(pakRel),
  };
  const missing = [
    ...(exists(files.floor) ? [] : [files.floor]),
    ...files.fg.filter((f) => !exists(f)),
    ...files.mg.filter((f) => !exists(f)),
    ...files.bg.filter((f) => !exists(f)),
  ];
  return {
    seq: t.sequence,
    name: t.name,
    soundtrack: t.soundtrack,
    floor: t.floor,
    foreground: t.foreground,
    midground: t.midground,
    background: t.background,
    files,
    filesOk: missing.length === 0,
    missing,
    evidence: [EVID.terrain],
  };
});

// �� 401 �?�����������������������������������������������������������������
const SHAPE_OF_TYPE = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C', 'D', 'E', '0'];
const shapeOfType = (t) => SHAPE_OF_TYPE[Math.min(15, Math.max(1, t)) - 1];
const bodyFiles = fs.readdirSync(path.join(ROOT, 'extract/pak/SHAPE/MAJOR/BODY'));
const shapeFamily = (sym) => ({
  L: bodyFiles.filter((f) => f[0] === 'L' && f[1] === sym).length,
  R: bodyFiles.filter((f) => f[0] === 'R' && f[1] === sym).length,
});
const genRows = times[0].generals.map((g, i) => {
  const posByScenario = times.map((t) => t.generals[i]?.pos || []);
  const faceFile = 'extract/pak/SHAPE/' + String(g.face || '').replace(/\\/g, '/') + '.SHP';
  return {
    id: i,
    name: g.name,
    face: g.face,
    faceFile,
    faceExists: g.face_file_exists === true && exists(faceFile),
    type: g.type,
    shape: shapeOfType(g.type),
    str: g.str,
    int: g.int,
    maxHp: g.max_hp,
    maxMp: g.max_mp,
    baseExp: g.base_exp,
    loyal: g.loyal ?? null,
    spirit: g.spirit ?? null,
    constancy: g.constancy ?? null,
    weapon: g.weapon,
    horse: g.horse,
    battleArray: g.battle_array,
    useBattleArray: g.use_battle_array,
    force: g.force,
    useForce: g.use_force,
    skills: (g.skills || []).map((s) => [s.level, s.id]),
    wiseSkills: (g.wise_skills || []).map((s) => [s.level, s.id]),
    skillLevels: [g.skilllevel1, g.skilllevel2, g.skilllevel3, g.skilllevel4].filter((v) => v !== undefined),
    posByScenario,
    city: g.city,
    status: g.status,
  };
});
const generals = {
  count: genRows.length,
  shapeOfType: SHAPE_OF_TYPE,
  shapeOfTypeGrade: '项目/48 §1 �?[推测-强�觉证据]',
  shapeFamilies: Object.fromEntries(SHAPE_OF_TYPE.map((s) => [s, shapeFamily(s)])),
  xlsWarInt: xlsGen.rows.map((r) => [Number(r[0]), Number(r[2]), Number(r[3])]),
  typeHistogram: genRows.reduce((a, g) => ((a[g.type] = (a[g.type] || 0) + 1), a), {}),
  rows: genRows,
  evidence: [EVID.generalTimes, EVID.typeShape, EVID.faces],
};

// �� 5 剧本 × 60 �?× 116 �?�������������������������������������������������
const SENTINEL = 30000;
const scenarios = times.map((t) => {
  const real = t.paths.filter((p) => p.length < SENTINEL);
  const sent = t.paths.filter((p) => p.length >= SENTINEL);
  const cityNames = new Set(t.cities.map((c) => c.name));
  const pathRows = t.paths.map((p) => ({
    seq: p.index,
    start: p.start,
    end: p.end,
    length: p.length,
    sentinel: p.length >= SENTINEL,
    npts: (p.points?.[0]?.length || 0) / 2,
    pointsSha16: sha16(Buffer.from(JSON.stringify(p.points || []), 'utf8')),
    endsExist: cityNames.has(p.start) && cityNames.has(p.end),
  }));
  return {
    id: t.times_index,
    file: t.source,
    name: t.system?.time,
    year: t.system?.year,
    kings: t.kings.length,
    cityCount: t.cities.length,
    pathCount: t.paths.length,
    realPathCount: real.length,
    sentinelCount: sent.length,
    cities: t.cities.map((c) => ({ name: c.name, x: c.pos[0], y: c.pos[1] })),
    paths: pathRows,
    levels: { baseExpCommon: levelsMeta.scenarios[t.times_index - 1]?.baseExpCommon, defaultLevel: levelsMeta.scenarios[t.times_index - 1]?.defaultLevel },
    evidence: [EVID.cities, EVID.paths, EVID.sentinel],
  };
});

// �� 等级衼�原作兼�，独立算出）����������������������������������������������
const expTable = Array.from({ length: 99 }, (_, i) => expToReach(i + 1));

// �� �：期望�内部的原作�?join 必须 0 巼� ��������������������������������
const selfCheck = [];
function join(id, bad, sample) {
  selfCheck.push({ id, ok: bad.length === 0, diffs: bad.length, sample: bad.slice(0, 3) });
  if (bad.length) log(`  �?join ${id}: ${bad.length} 处差�?�?${JSON.stringify(bad.slice(0, 2))}`);
  return bad.length;
}
let joinFails = 0;
joinFails += join('magic.ini-vs-xls', magics.filter((m) => m.xls.seq !== m.seq || m.xls.mp !== m.mp || m.xls.power !== m.power || m.xls.attack !== m.attack || m.xls.script !== m.script).map((m) => m.seq));
joinFails += join('wise.ini-vs-xls', wises.filter((w) => w.xls.seq !== w.seq || w.xls.execute !== w.execute || w.xls.wiseLevel !== w.wiseLevel || w.xls.level !== w.level || w.xls.target !== w.activeMask).map((w) => w.seq));
joinFails += join('troop.xls-header', troopNames.length === 13 && dataMagic.length === 110 ? [] : ['count']);
joinFails += join('city.xls-vs-times', times[0].cities.filter((c, i) => Number(xlsCity.rows[i]?.[2]) !== c.pos[0] || Number(xlsCity.rows[i]?.[3]) !== c.pos[1]).map((c) => c.name));
// XLS 宝典昮�体�TIMES �?cp950 繁体；XLS 多出 2 行（118 �?vs TIMES 116 条），按「序号���?const xlsPathBySeq = new Map(xlsPath.rows.filter((r) => r && r[0] != null).map((r) => [Number(r[0]), r]));
joinFails += join('path.xls-vs-times', times[0].paths.filter((p) => {
  const r = xlsPathBySeq.get(p.index);
  if (!r || r[3] == null) return true;
  const npts = (String(r[4] || '').trim().match(/\d+,\d+/g) || []).length;
  return Number(r[3]) !== p.length || npts !== (p.points?.[0]?.length || 0) / 2;
}).map((p) => p.index));
joinFails += join('sentinel-count', scenarios.flatMap((s) => (s.sentinelCount === statsPaths.n_sentinel ? [] : [[s.id, s.sentinelCount, statsPaths.n_sentinel]])));
joinFails += join('general.war-int-vs-xls', genRows.slice(1).filter((g, i) => g.str !== Number(xlsGen.rows[i]?.[2]) || g.int !== Number(xlsGen.rows[i]?.[3])).map((g) => g.name));
joinFails += join('general.type-vs-xls', genRows.slice(1).filter((g, i) => g.type !== Number(xlsGen.rows[i]?.[59])).map((g) => g.name));
joinFails += join('general.face-files', genRows.filter((g) => !g.faceExists).map((g) => [g.id, g.face]));
joinFails += join('terrain.files', terrains.filter((t) => !t.filesOk).map((t) => [t.seq, t.missing]));
joinFails += join('magic.data-vs-ini', dataMagic.filter((d, i) => d.NAME !== magics[i]?.name || d.MP !== magics[i]?.mp || d.POWER !== magics[i]?.power || d.ATTACK !== magics[i]?.attack || d.SCRIPT !== magics[i]?.script || d.ACTIVE !== magics[i]?.active).map((d) => d.SEQUENCE));
joinFails += join('wise.data-vs-ini', dataWises.filter((d, i) => d.NAME !== wises[i]?.name || d.Execute !== wises[i]?.execute || d.WiseLevel !== wises[i]?.wiseLevel || d.Level !== wises[i]?.level || d.ACTIVE !== wises[i]?.activeMask).map((d) => d.SEQUENCE));
joinFails += join('general.data-vs-times', dataGenerals.filter((d, i) => d.NAME !== genRows[i]?.name || d.TYPE !== genRows[i]?.type || d.STR !== genRows[i]?.str || d.INT !== genRows[i]?.int || d.BaseHP !== genRows[i]?.maxHp || d.BaseEXP !== genRows[i]?.baseExp).map((d) => d.id));

// �� 竖屏必然巼�（check 里以 skip 呈现）─�������������������������������������
const vertical = [
  {
    id: 'vertical.map.letterbox',
    what: '地图 1280×960 塞进 750 宽竖屏：�?contain 缩放后上�?左右留黑边（fitBox contain），坐标机�不动',
    why: '竖屏基准 750×1334 与原�?640×480 的�高比不同，contain 必然留边；这昉�面决策，不是数据巼�',
    evidence: [EVID.verticalMap],
  },
  {
    id: 'vertical.battle.fov',
    what: '战场�纵深 12.6 �?/ 71 列（FIELD_H=900），原作 480/72�?.67 �?�?朽��?×1.9 视野',
    why: '竖屏把高度换成纵深，�行数必然变�；格子数 71×14 与原作一致，变�相机窗口更高',
    evidence: [EVID.verticalBattle],
  },
  {
    id: 'vertical.layout.design',
    what: '设�分辨�?750×1334（原�?640×480），HUD 100 + 战场 900 + 指令�?334',
    why: '见 project/192（R192 修复：原始证据串在编码事故中损坏，数值期望未变）',
    evidence: [EVID.verticalDesign],
  },
];

// �� [推测] 清单 ������������������������������������������������������������
const speculations = [
  { id: 'spec.qiPercent', what: '�力消耗比例＝clamp(MP,20,80)% × 120000', why: EVID.qiPercent },
  { id: 'spec.castKind', what: 'castKind �?ATTRIB/ATTACK 反推（heal/aoe/strike�?, why: EVID.castKind },
  { id: 'spec.activeMask', what: 'ACTIVE 世�串→数�掩�?, why: EVID.activeMask },
  { id: 'spec.wiseTarget', what: '军师�盠��?1/2/4/8 的�义标�?, why: EVID.wiseTarget },
  { id: 'spec.typeShape', what: 'TYPE 1..15 �?造型�?1..9,A..E,0', why: EVID.typeShape },
  { id: 'spec.fxTtl', what: '特效驻留 = clamp(round(帧数×2.2),24,132)，无帧时 30', why: EVID.fxTtl },
  { id: 'spec.marchSpeed', what: '行军 1/3 月每格（MARCH_PER_MONTH�?, why: EVID.marchSpeed },
  { id: 'spec.sfxCurated', what: '没有 dis 直证�?35 条技能音效取 map6 策展值（证级 A2/X，R148 �?C 已清零）', why: EVID.sfx },
];

// �� 源文件指�?�������������������������������������������������������������
const SOURCE_FILES = [
  'extract/json/magic.json', 'extract/json/sango.json', 'extract/json/xls_武将�.json',
  'extract/json/xls_军师�.json', 'extract/json/xls_兵�.json', 'extract/json/xls_城池.json',
  'extract/json/xls_跾�.json', 'extract/json/xls_群英2.json', 'extract/json/stats_paths.json',
  'extract/json/times1.json', 'extract/json/times2.json', 'extract/json/times3.json',
  'extract/json/times4.json', 'extract/json/times5.json',
  'work/sfx84/map6.json', 'work/dis_magicmap_skills.txt',
  'game/data/levels_by_scenario.json', 'game/data/magics.json', 'game/data/wises.json',
  'game/data/generals.json', 'game/data/troops.json', 'game/data/scenarios.json',
];
const sources = SOURCE_FILES.map((p) => {
  const buf = fs.readFileSync(path.join(ROOT, p));
  return { path: p, bytes: buf.length, sha1_16: sha16(buf) };
});

const expect = {
  schema: 1,
  generatedBy: 'work/fidelity/gen_expect.mjs',
  generatedAt: new Date().toISOString(),
  purpose: '把�和原作�致�变成可重放斨�：期望�只由原作材料生成，运�时实现由 check.mjs / game/tests/fidelity_net.test.ts 比�',
  origin: {
    tickHz: 60,
    actionIntervalFrames: 40, // 主将与士兵同�常量
    attackCooldownFrames: 40,
    gridW: 71,
    gridH: 14,
    mapW: 1280,
    mapH: 960,
    sentinelLength: SENTINEL,
    qiMax: 120000,
    qiStart: 60000,
    qiCostScale: 1200,
    expToReach: 'k>99 ? 9999999 : (((k-1)*137 - 34) * k) / 2 + 17',
    expTable,
    levelTable: LEVEL_TABLE,
    troopCap: 'max(1, min(level*5, 100))',
    cavalryCap: 'max(0, min((floor(level||20)-20)*5, 100))',
    evidence: {
      tick40: EVID.tick40, qiMax: EVID.qiMax, expFormula: EVID.expFormula,
      troopCap: EVID.troopCap, sentinel: EVID.sentinel,
    },
  },
  counts: {
    magics: magics.length, wises: wises.length, troops: troops.count, terrains: terrains.length,
    generals: generals.count, scenarios: scenarios.length,
    citiesPerScenario: scenarios[0].cityCount, pathsPerScenario: scenarios[0].pathCount,
    sentinelPerScenario: scenarios[0].sentinelCount,
    realPathsPerScenario: scenarios[0].realPathCount,
    xlsPathRows: xlsPath.rows.length,
    xlsNote: 'XLS 宝典为简体（118 �?PATH，��?2 条），TIMES �?cp950 繁体 116 条，按序号�齐后长度/跂��?0 巼�',
    items: sango.items.length,
    xlsGeneralRows: xlsGen.rows.length,
  },
  magics,
  wises,
  troops,
  terrains,
  generals,
  scenarios,
  vertical,
  speculations,
  selfCheck,
  sources,
};

fs.mkdirSync(HERE, { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(expect, null, 1), 'utf8');

const size = fs.statSync(OUT).size;
log(`�?${path.relative(ROOT, OUT)}  ${(size / 1024).toFixed(1)} KB`);
log(`  magics ${magics.length} · wises ${wises.length} · troops ${troops.count} · terrains ${terrains.length} · generals ${generals.count} · scenarios ${scenarios.length}`);
log(`  哨兵 ${scenarios[0].sentinelCount}/${scenarios[0].pathCount} · 叵� ${scenarios[0].realPathCount} · �?${scenarios[0].cityCount} · 君主 ${scenarios.reduce((a, s) => a + s.kings, 0)}`);
log(`  sfx: 直证 ${magics.filter((m) => m.sfx.direct).length}/110 · 证级 ${JSON.stringify(magics.reduce((a, m) => ((a[m.sfx.grade] = (a[m.sfx.grade] || 0) + 1), a), {}))}`);
log(`  selfCheck ${selfCheck.filter((s) => s.ok).length}/${selfCheck.length} ok · joinFails ${joinFails}`);
if (joinFails) {
  log('�?原作�?join 有差异，先查数据再谈实现');
  process.exit(1);
}

