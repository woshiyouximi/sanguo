?#!/usr/bin/env node
/**
 * ����У��?�� ����ֵ��������һ�������ɣ�����?check.mjs / fidelity_net.test.ts �ȶ�? *
 * ����ȫ��?*ԭ��?*���ϣ�����ʱʵ��һ�в�����
 *   extract/json/magic.json            MAGIC.INI��cp950������������� + ����
 *   extract/json/sango.json            SANGO.INI [TERRAIN] 12 ? *   extract/json/times1..5.json        TIMES1..5.INI?0 ?/ 116 ?/ 15 ���� / 401 ? *   extract/json/xls_*.json            XLS ����?10 �� / 67 ��ʦ�� / 13 ���� / 60 ?/ 116 ?/ 400 ? *   extract/json/stats_paths.json      116 ·�� 39 ?30000 �ڱ���ͳ? *   work/sfx84/map6.json               110 ������?��ЧĿ¼֤�ݣ��� A/A2/C/X ֤��?via? *   work/dis_magicmap_skills.txt       110 ������ࣨ75 ����ֱ֤��Ч����
 *   docs/*.md                          ��ʽ?VA �������� EVID? *   extract/pak/SHAPE/**               ԭ��������Դ�Ƿ���ڣ�FACE / BG / MAJOR\BODY? *
 * ֻд work/fidelity/fidelity_expect.json����?game/**? * �÷���node work/fidelity/gen_expect.mjs [--quiet]
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

// ���� ֤�ݲ���ÿ������ file:line ?VA ������������������������������������������������������������������������������������
const EVID = {
  tick40: 'docs/04b3_��������.md:71-89��u->+0x34 = 0x28; // ��ͨ��40 ֡��?x2e = 46 ֡���� 0x4000 ״̬��work/dis_battle_units.txt:1624?043B5DE mov dword ptr [ecx+0x34], 0x28?,
  tickHz60: 'project/190_������ʿ���ٶȲþ�.md��p5?0x34 ��λ = ���� tick��¼��ʵ?66?9 Hz? project/192_�������60Hz.md + game/src/core/battle.ts TICK_HZ=60��R192 ȡ���һ��������ԭ����ֵ��',
  qiMax: 'docs/04b3_��������.md:259��if (u->+0x4C > 0x1D4C0) u->+0x4C = 0x1D4C0; // ���� 120000��?381��unit+0x4C = ��������?0x1D4C0?20000��?,
  expFormula: 'docs/04b_ս��ϵͳ.md:217-223?x409EE0(n) ���� n �������ۼƾ��项?x409F73(g) �ɾ��鷴�Ƶȼ���?666?(n-1)*137-34)*n/2+17?,
  troopCap: 'docs/00_��Ŀ�������ĵ���?md:166?0x42 := 0x409FB6()?x40F294��? min(�ȼ���5,100)��levels_by_scenario.json loader?x42D38B (BaseEXP -> gen+0x2A) / 0x42D391 call 0x409F73?,
  sentinel: 'docs/00_��Ŀ�������ĵ���?md:32?16 ?PATH ?39 ���� Length=30000 �Ĳ���ͨ���ڱ���ʵ�ʿ�?77 ������docs/03b_XLS������ֵ��?md:874,881���޳�����ʵ���� 37?60?0 ?1 ����ͨ����?,
  magicIni: 'extract/json/magic.json entries[kind=magic]��MAGIC.INI cp950 ���ֶΣ�?extract/json/xls_�佫��.json 110 ����ֵ�����/��?����/����?���ô���? ����',
  magicCategory: 'extract/json/magic.json entries[].category / category_rule����?Attribute+�������ж���',
  wiseIni: 'extract/json/magic.json entries[kind=wise]����?[WISE]���� extract/json/xls_��ʦ��.json 67 �У����/ִ�д���/��ʦ���ȼ�/�ȼ�/Ŀ��? ���죻docs/03b_XLS������ֵ��?md:499-507��INI [WISE] 67 ���� XLS �����ȶ� 0 ����һ��?,
  wiseTarget: 'docs/03b_XLS������ֵ��?md:477-486��Ŀ?target ?4 ֵ��ɢ�� 1/2/4/8������������λ���뵫�з�������ѡ��?8���ƽ��о�=1�������Ŷ���/��?,
  sfx: 'work/sfx84/map6.json ?seq {dir,dirs,snd,grade,via,deep,A,C,B,all}��work/dis_magicmap_skills.txt 75 �Ρ���Ч�ַ���:��ֱ֤��docs/05c_MAGIC��Чӳ��.md:66-67?18058 PUSHS "m016snd01" / SYSCALL 0x301����:411 ָ��÷����',
  troopMatrix: 'extract/json/xls_����.json 13��13��header ����Ϊ���У�?game/data/troops.json.matrix 0 ����',
  terrain: 'extract/json/sango.json terrain[12]��SANGO.INI [TERRAIN]����?Sequence/Name/SoundTrack/Floor/Foreground/Midground/Background������Դ?extract/pak/SHAPE/BG/',
  generalTimes: 'extract/json/times1..5.json GENERAL �θ� 401 ����name/face/str/int/max_hp/max_mp/base_exp/loyal/spirit/constancy/type/skills/wise_skills/pos�������� extract/json/xls_ȺӢ2.json 400 ����?0 ����',
  typeShape: 'project/48_�佫С��װ��.md:19��generals.json.TYPE?..15���� ���ͷ��� 1..9,A..E,0 ?400/400 100% ���ǡ�[�Ʋ�-ǿ�Ӿ�֤��]?217-223��docs/03b_XLS������ֵ��?md:215��BODY 3601 ?.SHP?1 ��?20?5 ���͡�8 ���򣩡���docs/05b_����������Ŀ¼.md:84��MAJOR\\BODY 600?59 �������� 15 ���͡�4 ������2 ��Ӫ?,
  faces: 'extract/pak/SHAPE/FACE/FACE001.SHP..FACE400.SHP��times*.json cross_checks.face_miss = 0?,
  cities: 'extract/json/times1..5.json cities[60] ?extract/json/xls_�ǳ�.json 60 �У����/����/����/�ȼ�/����? ����',
  paths: 'extract/json/times1..5.json paths[116] ?extract/json/xls_·��.json 116 �У�??����/·��? ����',
  qiPercent: '[�Ʋ�] POWER �ֶ�?100��extract/json/magic.json stats.power ?100��xls��������������ȫ 100����?VA ˵���������ı������������� MP ���ٷֱȣ�battle.ts qiPowerPercentOf��clamp(MP,20,80)?,
  castKind: '[�ƶ�] ��ԭ�����෴�ƣ�ATTRIB �����aѪ���� heal��ATTACK?0 ?aoe����?strike��category ?kind ����һһ��Ӧ����?�������� 6 ���� 3 ?aoe������ֻ���ع��?,
  activeMask: '[�Ʋ�] MAGIC.INI ?ACTIVE �����Ĵ����ҷ���?����ʿ����������ֵ�����ɵ�������?docs/03b:477-486 ?4 ֵ���Ƶ������Ŷ�??,
  fxTtl: '[��] ������ǽ�Ӷ�?FX_TICK_PER_FRAME = TICK_HZ/13.6��clamp(0.8s, 4.4s) ?60Hz ?clamp(48,264)����֡ʱ?60��battle.ts����ԭ��ֻ�С�֡ͣ�� tick ������docs/05b:3����������ʱ��֤?,
  marchSpeed: '[�Ʋ�] MARCH_PER_MONTH=1/3��march.ts:21 ע�����������?,
  formationNote: '��Ӫ���β��ڱ���У�鷶Χ��game/data/formations.json names 9 / matrix 11���� 2 ���������',
  verticalMap: 'project/01_����UI�뽻����?md:815����?750��1334��scale=min(W/750,H/1334)�������С����ڱߡ���docs/02-������Դ���?md:44,233��CHINAMAP.SHP 1280��960��MSK 640��480(1:2)?,
  verticalBattle: 'project/00_����?md:64��һ?14 ���� �� 12.6 �С���project/02_ս���ع����.md:48?2.6/71=17.8% vs 8.75/71=12.3%��?174��ԭ?480/72=6.67/71=9.4% ?��1.9?,
  verticalDesign: 'project/01_����UI�뽻����?md:815 ��׼ 750��1334��ԭ?640��480?,
};

// ���� ԭ������ ��������������������������������������������������������������������������������������������������������������������������������
const magicIni = J('extract/json/magic.json');
const sango = J('extract/json/sango.json');
const xlsMagic = J('extract/json/xls_�佫��.json');
const xlsWise = J('extract/json/xls_��ʦ��.json');
const xlsTroop = J('extract/json/xls_����.json');
const xlsCity = J('extract/json/xls_�ǳ�.json');
const xlsPath = J('extract/json/xls_·��.json');
const xlsGen = J('extract/json/xls_ȺӢ2.json');
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
  const m = /��Ч�ַ�?\s*([^\r\n]*)/.exec(block);
  if (m) disSfx.set(seq, m[1].split(',').map((s) => s.trim()).filter(Boolean));
}

// ���� ��ʽ��ԭ���࣬����������ʱʵ�֣�������������������������������������������������������������������������������������
const expToReach = (k) => (k > 99 ? 9999999 : (((k - 1) * 137 - 34) * k) / 2 + 17);
const levelFromExpOrig = (exp) => {
  for (let i = 0; i < 99; i++) if (exp < expToReach(i)) return i - 1;
  return 99;
};
const LEVEL_TABLE = { '200': levelFromExpOrig(200), '9999': levelFromExpOrig(9999) };

// ���� ��Ч������dis ֱ֤���ȣ���?map6 �Ĳ�չ?��������������������������������������������������������������
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
    via: row.via || (direct.length ? 'dis ֱ֤' : ''),
    direct: direct.length > 0,
    gradeRaw: row.grade || '',
  };
}

// ���� 110 �� ����������������������������������������������������������������������������������������������������������������������������������
const magicEntries = magicIni.entries.filter((e) => e.kind === 'magic');
const xlsMagicBySeq = new Map(xlsMagic.rows.map((r) => [Number(r[0]), r]));
const magics = magicEntries.map((e) => {
  const x = xlsMagicBySeq.get(e.sequence) || [];
  const attrib = e.attrib || '';
  const castKind = /�aѪ|�a��/.test(attrib)
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
    castKindGrade: '[�ƶ�]',
    qiPercent,
    qiPercentGrade: '[�Ʋ�]',
    fx: { dir: (map6.find((m) => m.seq === e.sequence) || {}).dir, dirs: (map6.find((m) => m.seq === e.sequence) || {}).dirs, func: (map6.find((m) => m.seq === e.sequence) || {}).func },
    sfx: sfxOf(e.sequence),
    evidence: [EVID.magicIni, EVID.sfx, EVID.qiPercent],
  };
});

// ���� 67 ��ʦ�� ������������������������������������������������������������������������������������������������������������������������������
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
    targetGrade: '[�Ʋ�]',
    xls: { seq: Number(x[0]), execute: Number(x[1]), wiseLevel: Number(x[2]), level: Number(x[5]), target: Number(x[6]) },
    evidence: [EVID.wiseIni, EVID.wiseTarget],
  };
});

// ���� 13 ���� ��������������������������������������������������������������������������������������������������������������������������������
const troopNames = xlsTroop.header.slice(1);
const troops = {
  count: troopNames.length,
  names: troopNames,
  matrix: xlsTroop.rows.map((r) => r.slice(1).map(Number)),
  matrixSource: 'extract/json/xls_����.json rows[i][1..13]',
  attackIntervalFrames: 40,
  attackIntervalGrade: 'A',
  tickHz: 60,
  perTroopSpeedField: false,
  note: 'ԭ�� 13 ����û�и��ԵĹ�?�ƶ��ֶΣ��������ͳһ?unit+0x34=0x28?0 ֡���������ٶ�?MOVE_PER_TICK ȫ��ϵ������',
  evidence: [EVID.tick40, EVID.tickHz60, EVID.troopMatrix],
};

// ���� 12 ���� ��������������������������������������������������������������������������������������������������������������������������������
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

// ���� 401 ?����������������������������������������������������������������������������������������������������������������������������������
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
  shapeOfTypeGrade: '��Ŀ/48 ��1 ?[�Ʋ�-ǿ�Ӿ�֤��]',
  shapeFamilies: Object.fromEntries(SHAPE_OF_TYPE.map((s) => [s, shapeFamily(s)])),
  xlsWarInt: xlsGen.rows.map((r) => [Number(r[0]), Number(r[2]), Number(r[3])]),
  typeHistogram: genRows.reduce((a, g) => ((a[g.type] = (a[g.type] || 0) + 1), a), {}),
  rows: genRows,
  evidence: [EVID.generalTimes, EVID.typeShape, EVID.faces],
};

// ���� 5 �籾 �� 60 ?�� 116 ?��������������������������������������������������������������������������������������������������
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

// ���� �ȼ�����ԭ����ʽ�������������������������������������������������������������������������������������������������������
const expTable = Array.from({ length: 99 }, (_, i) => expToReach(i + 1));

// ���� �Լ죺����ֵ�ڲ���ԭ��?join ���� 0 ���� ����������������������������������������������������������������
const selfCheck = [];
function join(id, bad, sample) {
  selfCheck.push({ id, ok: bad.length === 0, diffs: bad.length, sample: bad.slice(0, 3) });
  if (bad.length) log(`  ?join ${id}: ${bad.length} ����??${JSON.stringify(bad.slice(0, 2))}`);
  return bad.length;
}
let joinFails = 0;
joinFails += join('magic.ini-vs-xls', magics.filter((m) => m.xls.seq !== m.seq || m.xls.mp !== m.mp || m.xls.power !== m.power || m.xls.attack !== m.attack || m.xls.script !== m.script).map((m) => m.seq));
joinFails += join('wise.ini-vs-xls', wises.filter((w) => w.xls.seq !== w.seq || w.xls.execute !== w.execute || w.xls.wiseLevel !== w.wiseLevel || w.xls.level !== w.level || w.xls.target !== w.activeMask).map((w) => w.seq));
joinFails += join('troop.xls-header', troopNames.length === 13 && dataMagic.length === 110 ? [] : ['count']);
joinFails += join('city.xls-vs-times', times[0].cities.filter((c, i) => Number(xlsCity.rows[i]?.[2]) !== c.pos[0] || Number(xlsCity.rows[i]?.[3]) !== c.pos[1]).map((c) => c.name));
// XLS �����Ǽ��塢TIMES ?cp950 ���壻XLS ��� 2 �У�118 ?vs TIMES 116 ������������š���?const xlsPathBySeq = new Map(xlsPath.rows.filter((r) => r && r[0] != null).map((r) => [Number(r[0]), r]));
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

// ���� ������Ȼ���죨check ���� skip ���֣�����������������������������������������������������������������������������
const vertical = [
  {
    id: 'vertical.map.letterbox',
    what: '��ͼ 1280��960 ���� 750 ��������?contain ���ź���?�������ڱߣ�fitBox contain�������걾������',
    why: '������׼ 750��1334 ��ԭ?640��480 �Ŀ��߱Ȳ�ͬ��contain ��Ȼ���ߣ����ǰ�����ߣ��������ݲ���',
    evidence: [EVID.verticalMap],
  },
  {
    id: 'vertical.battle.fov',
    what: 'ս���������� 12.6 ?/ 71 �У�FIELD_H=900����ԭ�� 480/72?.67 ??����?��1.9 ��Ұ',
    why: '�����Ѹ߶Ȼ�������ɼ�������Ȼ��ࣻ������ 71��14 ��ԭ��һ�£�ֻ��������ڸ���',
    evidence: [EVID.verticalBattle],
  },
  {
    id: 'vertical.layout.design',
    what: '��Ʒֱ�?750��1334��ԭ?640��480����HUD 100 + ս�� 900 + ָ��?334',
    why: '���� UI ��׼���������ư��棻��Ӱ���κ�ԭ����?,
    evidence: [EVID.verticalDesign],
  },
];

// ���� [�Ʋ�] �嵥 ������������������������������������������������������������������������������������������������������������������������
const speculations = [
  { id: 'spec.qiPercent', what: '�������ı�����clamp(MP,20,80)% �� 120000', why: EVID.qiPercent },
  { id: 'spec.castKind', what: 'castKind ?ATTRIB/ATTACK ���ƣ�heal/aoe/strike?, why: EVID.castKind },
  { id: 'spec.activeMask', what: 'ACTIVE ���Ĵ�����ֵ��?, why: EVID.activeMask },
  { id: 'spec.wiseTarget', what: '��ʦ��Ŀ��?1/2/4/8 �������?, why: EVID.wiseTarget },
  { id: 'spec.typeShape', what: 'TYPE 1..15 ?����?1..9,A..E,0', why: EVID.typeShape },
  { id: 'spec.fxTtl', what: '��Чפ�� = clamp(round(֡����2.2),24,132)����֡ʱ 30', why: EVID.fxTtl },
  { id: 'spec.marchSpeed', what: '�о� 1/3 ��ÿ��MARCH_PER_MONTH?, why: EVID.marchSpeed },
  { id: 'spec.sfxCurated', what: 'û�� dis ֱ֤?35 ��������Чȡ map6 ��չֵ��֤�� A2/X��R148 ?C �����㣩', why: EVID.sfx },
];

// ���� Դ�ļ�ָ?��������������������������������������������������������������������������������������������������������������������������
const SOURCE_FILES = [
  'extract/json/magic.json', 'extract/json/sango.json', 'extract/json/xls_�佫��.json',
  'extract/json/xls_��ʦ��.json', 'extract/json/xls_����.json', 'extract/json/xls_�ǳ�.json',
  'extract/json/xls_·��.json', 'extract/json/xls_ȺӢ2.json', 'extract/json/stats_paths.json',
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
  purpose: '�ѡ���ԭ��һ�¡���ɿ��طŶ��ԣ�����ֵֻ��ԭ���������ɣ�����ʱʵ���� check.mjs / game/tests/fidelity_net.test.ts �ȶ�',
  origin: {
    tickHz: 60,
    actionIntervalFrames: 40, // ������ʿ��ͬһ����
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
    xlsNote: 'XLS ����Ϊ���壨118 ?PATH����?2 ������TIMES ?cp950 ���� 116 ��������Ŷ���󳤶�/·��?0 ����',
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
log(`?${path.relative(ROOT, OUT)}  ${(size / 1024).toFixed(1)} KB`);
log(`  magics ${magics.length} �� wises ${wises.length} �� troops ${troops.count} �� terrains ${terrains.length} �� generals ${generals.count} �� scenarios ${scenarios.length}`);
log(`  �ڱ� ${scenarios[0].sentinelCount}/${scenarios[0].pathCount} �� ���� ${scenarios[0].realPathCount} �� ?${scenarios[0].cityCount} �� ���� ${scenarios.reduce((a, s) => a + s.kings, 0)}`);
log(`  sfx: ֱ֤ ${magics.filter((m) => m.sfx.direct).length}/110 �� ֤�� ${JSON.stringify(magics.reduce((a, m) => ((a[m.sfx.grade] = (a[m.sfx.grade] || 0) + 1), a), {}))}`);
log(`  selfCheck ${selfCheck.filter((s) => s.ok).length}/${selfCheck.length} ok �� joinFails ${joinFails}`);
if (joinFails) {
  log('?ԭ��?join �в��죬�Ȳ�������̸ʵ��');
  process.exit(1);
}

