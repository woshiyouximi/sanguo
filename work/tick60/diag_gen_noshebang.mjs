/**
 * 淇濈湡鏍￠獙缃?路 鏈熸湜鍊肩敓鎴愬櫒锛堜竴娆℃€х敓鎴愶紝钀界洏缁?check.mjs / fidelity_net.test.ts 姣斿锛? *
 * 杈撳叆鍏ㄩ儴鏄?*鍘熶綔渚?*鏉愭枡锛岃繍琛屾椂瀹炵幇涓€琛屼笉璇伙細
 *   extract/json/magic.json            MAGIC.INI锛坈p950锛夐€愭潯瑙ｆ瀽缁撴灉 + 鍒嗙被
 *   extract/json/sango.json            SANGO.INI [TERRAIN] 12 鏉? *   extract/json/times1..5.json        TIMES1..5.INI锛?0 鍩?/ 116 璺?/ 15 鍚涗富 / 401 灏? *   extract/json/xls_*.json            XLS 瀹濆吀锛?10 鎶€ / 67 鍐涘笀鎶€ / 13 鍏电 / 60 鍩?/ 116 璺?/ 400 灏? *   extract/json/stats_paths.json      116 璺噷 39 鏉?30000 鍝ㄥ叺鐨勭粺璁? *   work/sfx84/map6.json               110 鎶€鐨勯煶鏁?鐗规晥鐩綍璇佹嵁锛堝惈 A/A2/C/X 璇佺骇涓?via锛? *   work/dis_magicmap_skills.txt       110 鎶€鍙嶆眹缂栵紙75 娈垫湁鐩磋瘉闊虫晥涓诧級
 *   docs/*.md                          鍏紡涓?VA 鍑哄锛堣 EVID锛? *   extract/pak/SHAPE/**               鍘熶綔缇庢湳璧勬簮鏄惁瀛樺湪锛團ACE / BG / MAJOR\BODY锛? *
 * 鍙啓 work/fidelity/fidelity_expect.json锛屼笉纰?game/**銆? * 鐢ㄦ硶锛歯ode work/fidelity/gen_expect.mjs [--quiet]
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

// 鈹€鈹€ 璇佹嵁绨匡細姣忔潯閮藉甫 file:line 鎴?VA 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
const EVID = {
  tick40: 'docs/04b3_鍗曟寫娴佺▼.md:71-89銆寀->+0x34 = 0x28; // 鏅€氾細40 甯с€嶃€?x2e = 46 甯с€嶄粎 0x4000 鐘舵€侊紱work/dis_battle_units.txt:1624銆?043B5DE mov dword ptr [ecx+0x34], 0x28銆?,
  tickHz60: 'project/190_涓诲皢涓庡＋鍏甸€熷害瑁佸喅.md锛坧5锛?0x34 鍗曚綅 = 寮曟搸 tick锛涘綍鍍忓疄娴?66鈥?9 Hz锛? project/192_寮曟搸鑺傛媿60Hz.md + game/src/core/battle.ts TICK_HZ=60锛圧192 鍙栨渶淇濆畧涓€妗ｏ紝涓嶆槸鍘熶綔鐪熷€硷級',
  qiMax: 'docs/04b3_鍗曟寫娴佺▼.md:259銆宨f (u->+0x4C > 0x1D4C0) u->+0x4C = 0x1D4C0; // 涓婇檺 120000銆嶃€?381銆寀nit+0x4C = 姘斿姏鈥︿笂闄?0x1D4C0锛?20000锛夈€?,
  expFormula: 'docs/04b_鎴樻枟绯荤粺.md:217-223銆?x409EE0(n) 鍗囧埌 n 绾ф墍闇€绱缁忛獙銆嶃€?x409F73(g) 鐢辩粡楠屽弽鎺ㄧ瓑绾с€嶃€?666銆?(n-1)*137-34)*n/2+17銆?,
  troopCap: 'docs/00_椤圭洰鎬昏涓庢枃妗ｇ储寮?md:166銆?0x42 := 0x409FB6()锛?x40F294锛夈€? min(绛夌骇脳5,100)锛沴evels_by_scenario.json loader銆?x42D38B (BaseEXP -> gen+0x2A) / 0x42D391 call 0x409F73銆?,
  sentinel: 'docs/00_椤圭洰鎬昏涓庢枃妗ｇ储寮?md:32銆?16 鏉?PATH 閲?39 鏉℃槸 Length=30000 鐨勪笉鍙€氳鍝ㄥ叺锛屽疄闄呭彲璧?77 鏉°€嶏紱docs/03b_XLS瀹濆吀鏁板€煎垎鏋?md:874,881銆屽墧闄ゅ悗鐪熷疄闀垮害 37鈥?60锛?0 鍩?1 涓繛閫氬垎閲忋€?,
  magicIni: 'extract/json/magic.json entries[kind=magic]锛圡AGIC.INI cp950 閫愬瓧娈碉級涓?extract/json/xls_姝﹀皢鎶€.json 110 琛屾暟鍊硷紙搴忓彿/鎶€鍔?鑳介噺/鏀诲嚮鍔?璋冪敤浠ｇ爜锛? 宸紓',
  magicCategory: 'extract/json/magic.json entries[].category / category_rule锛堟鍐?Attribute+鏀诲嚮鍔涘垽瀹氾級',
  wiseIni: 'extract/json/magic.json entries[kind=wise]锛堟鍚?[WISE]锛変笌 extract/json/xls_鍐涘笀鎶€.json 67 琛岋紙搴忓彿/鎵ц浠ｇ爜/鍐涘笀鎶€绛夌骇/绛夌骇/鐩爣锛? 宸紓锛沝ocs/03b_XLS瀹濆吀鏁板€煎垎鏋?md:499-507銆孖NI [WISE] 67 鏉′笌 XLS 閫愭潯姣斿 0 澶勪笉涓€鑷淬€?,
  wiseTarget: 'docs/03b_XLS瀹濆吀鏁板€煎垎鏋?md:477-486銆岀洰鏍?target 鏄?4 鍊肩鏁ｇ爜 1/2/4/8鈥︾枒浼间綔鐢ㄥ煙浣嶆帺鐮佷絾鏈夊弽渚嬶紙鍚庨€夊嚭闃?8銆侀€艰繎鏁屽啗=1锛夛紝缃俊搴︿腑/寮便€?,
  sfx: 'work/sfx84/map6.json 閫?seq {dir,dirs,snd,grade,via,deep,A,C,B,all}锛泈ork/dis_magicmap_skills.txt 75 娈点€岄煶鏁堝瓧绗︿覆:銆嶇洿璇侊紱docs/05c_MAGIC鐗规晥鏄犲皠.md:66-67銆?18058 PUSHS "m016snd01" / SYSCALL 0x301銆嶏紝:411 鎸囧悜璇ュ弽姹囩紪',
  troopMatrix: 'extract/json/xls_鍏电.json 13脳13锛坔eader 棣栧垪涓虹┖鍒楋級涓?game/data/troops.json.matrix 0 宸紓',
  terrain: 'extract/json/sango.json terrain[12]锛圫ANGO.INI [TERRAIN]锛屽瓧娈?Sequence/Name/SoundTrack/Floor/Foreground/Midground/Background锛夛紱璧勬簮鍦?extract/pak/SHAPE/BG/',
  generalTimes: 'extract/json/times1..5.json GENERAL 娈靛悇 401 鏉★紙name/face/str/int/max_hp/max_mp/base_exp/loyal/spirit/constancy/type/skills/wise_skills/pos鈥︼級锛涗笌 extract/json/xls_缇よ嫳2.json 400 琛屾鏅?0 宸紓',
  typeShape: 'project/48_姝﹀皢灏忎汉瑁呴厤.md:19銆実enerals.json.TYPE锛?..15锛夆啋 閫犲瀷绗﹀彿 1..9,A..E,0 鈥?400/400 100% 瑕嗙洊銆峓鎺ㄦ祴-寮鸿瑙夎瘉鎹甝銆?217-223锛沝ocs/03b_XLS瀹濆吀鏁板€煎垎鏋?md:215銆孊ODY 3601 涓?.SHP锛?1 缁劽?20锛?5 浣撳瀷脳8 鏂瑰悜锛夈€嶏紱docs/05b_鍔ㄧ敾涓庨€犲瀷鐩綍.md:84銆孧AJOR\\BODY 600鈥?59 涓诲皢韬綋 15 閫犲瀷脳4 姝﹀櫒脳2 闃佃惀銆?,
  faces: 'extract/pak/SHAPE/FACE/FACE001.SHP..FACE400.SHP锛坱imes*.json cross_checks.face_miss = 0锛?,
  cities: 'extract/json/times1..5.json cities[60] 涓?extract/json/xls_鍩庢睜.json 60 琛岋紙搴忓彿/鍚嶇О/鍧愭爣/绛夌骇/鏃楀笢锛? 宸紓',
  paths: 'extract/json/times1..5.json paths[116] 涓?extract/json/xls_璺緞.json 116 琛岋紙璧?姝?闀垮害/璺偣锛? 宸紓',
  qiPercent: '[鎺ㄦ祴] POWER 瀛楁鍏?100锛坋xtract/json/magic.json stats.power 鎭?100銆亁ls銆岃兘閲忥紙姘旓級銆嶅叏 100锛夛紝鏃?VA 璇存槑鎶€鍔涙秷鑰楁瘮渚嬶紝鏈綔鏀圭敤 MP 褰撶櫨鍒嗘瘮锛歜attle.ts qiPowerPercentOf锛坈lamp(MP,20,80)锛?,
  castKind: '[鎺ㄦ柇] 鐢卞師浣滃垎绫诲弽鎺細ATTRIB 鍚€岃琛€銆嶁啋 heal銆丄TTACK鈮?0 鈫?aoe銆佸叾浣?strike銆俢ategory 涓?kind 骞堕潪涓€涓€瀵瑰簲锛堜激瀹?鍗曚綋涓诲皢 6 鏉￠噷 3 鏉?aoe锛夛紝鏁呭彧浣滃洖褰掑彛寰?,
  activeMask: '[鎺ㄦ祴] MAGIC.INI 鐨?ACTIVE 鏄腑鏂囦覆锛堟垜鏂逛富灏?鏁垫柟澹叺鈥︼級锛屾暟鍊兼帺鐮佺敱瀵煎嚭宸ュ叿鎸?docs/03b:477-486 鐨?4 鍊肩爜鎺ㄥ锛岀疆淇″害涓?寮?,
  fxTtl: '[閽塢 鏈綔鎸夊閽熷畾涔?FX_TICK_PER_FRAME = TICK_HZ/13.6銆乧lamp(0.8s, 4.4s) 鈬?60Hz 涓?clamp(48,264)銆佹棤甯ф椂鍥?60锛坆attle.ts锛夛紱鍘熶綔鍙湁銆屽抚鍋滅暀 tick 鏁般€嶏紙docs/05b:3锛夛紝鏃犻€愭妧鎬绘椂闀胯瘉鎹?,
  marchSpeed: '[鎺ㄦ祴] MARCH_PER_MONTH=1/3锛坢arch.ts:21 娉級锛涙湰浣滆璁″€?,
  formationNote: '闃佃惀闃靛舰涓嶅湪鏈鏍￠獙鑼冨洿锛坓ame/data/formations.json names 9 / matrix 11锛屽惈 2 涓潪鐜╁闃碉級',
  verticalMap: 'project/01_绔栧睆UI涓庝氦浜掓柟妗?md:815銆屽熀鍑?750脳1334锛宻cale=min(W/750,H/1334)鈥︿笉瑁佸垏銆佷笉榛戣竟銆嶏紱docs/02-缇庢湳璧勬簮涓庢牸寮?md:44,233銆孋HINAMAP.SHP 1280脳960锛孧SK 640脳480(1:2)銆?,
  verticalBattle: 'project/00_绔嬮」涔?md:64銆屼竴灞?14 杞﹂亾 脳 12.6 琛屻€嶏紱project/02_鎴樻枟閲嶆瀯璁捐.md:48銆?2.6/71=17.8% vs 8.75/71=12.3%銆嶃€?174銆屽師浣?480/72=6.67/71=9.4% 鈫?脳1.9銆?,
  verticalDesign: 'project/01_绔栧睆UI涓庝氦浜掓柟妗?md:815 鍩哄噯 750脳1334锛堝師浣?640脳480锛?,
};

// 鈹€鈹€ 鍘熶綔鏉愭枡 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
const magicIni = J('extract/json/magic.json');
const sango = J('extract/json/sango.json');
const xlsMagic = J('extract/json/xls_姝﹀皢鎶€.json');
const xlsWise = J('extract/json/xls_鍐涘笀鎶€.json');
const xlsTroop = J('extract/json/xls_鍏电.json');
const xlsCity = J('extract/json/xls_鍩庢睜.json');
const xlsPath = J('extract/json/xls_璺緞.json');
const xlsGen = J('extract/json/xls_缇よ嫳2.json');
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
  const m = /闊虫晥瀛楃涓?\s*([^\r\n]*)/.exec(block);
  if (m) disSfx.set(seq, m[1].split(',').map((s) => s.trim()).filter(Boolean));
}

// 鈹€鈹€ 鍏紡锛堝師浣滀晶锛岀嫭绔嬩簬杩愯鏃跺疄鐜帮級鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
const expToReach = (k) => (k > 99 ? 9999999 : (((k - 1) * 137 - 34) * k) / 2 + 17);
const levelFromExpOrig = (exp) => {
  for (let i = 0; i < 99; i++) if (exp < expToReach(i)) return i - 1;
  return 99;
};
const LEVEL_TABLE = { '200': levelFromExpOrig(200), '9999': levelFromExpOrig(9999) };

// 鈹€鈹€ 闊虫晥鏈熸湜锛歞is 鐩磋瘉浼樺厛锛屽叾娆?map6 鐨勭瓥灞曞€?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
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
    via: row.via || (direct.length ? 'dis 鐩磋瘉' : ''),
    direct: direct.length > 0,
    gradeRaw: row.grade || '',
  };
}

// 鈹€鈹€ 110 鎶€ 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
const magicEntries = magicIni.entries.filter((e) => e.kind === 'magic');
const xlsMagicBySeq = new Map(xlsMagic.rows.map((r) => [Number(r[0]), r]));
const magics = magicEntries.map((e) => {
  const x = xlsMagicBySeq.get(e.sequence) || [];
  const attrib = e.attrib || '';
  const castKind = /瑁滆|瑁滃叺/.test(attrib)
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
    castKindGrade: '[鎺ㄦ柇]',
    qiPercent,
    qiPercentGrade: '[鎺ㄦ祴]',
    fx: { dir: (map6.find((m) => m.seq === e.sequence) || {}).dir, dirs: (map6.find((m) => m.seq === e.sequence) || {}).dirs, func: (map6.find((m) => m.seq === e.sequence) || {}).func },
    sfx: sfxOf(e.sequence),
    evidence: [EVID.magicIni, EVID.sfx, EVID.qiPercent],
  };
});

// 鈹€鈹€ 67 鍐涘笀鎶€ 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
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
    targetGrade: '[鎺ㄦ祴]',
    xls: { seq: Number(x[0]), execute: Number(x[1]), wiseLevel: Number(x[2]), level: Number(x[5]), target: Number(x[6]) },
    evidence: [EVID.wiseIni, EVID.wiseTarget],
  };
});

// 鈹€鈹€ 13 鍏电 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
const troopNames = xlsTroop.header.slice(1);
const troops = {
  count: troopNames.length,
  names: troopNames,
  matrix: xlsTroop.rows.map((r) => r.slice(1).map(Number)),
  matrixSource: 'extract/json/xls_鍏电.json rows[i][1..13]',
  attackIntervalFrames: 40,
  attackIntervalGrade: 'A',
  tickHz: 60,
  perTroopSpeedField: false,
  note: '鍘熶綔 13 鍏电娌℃湁鍚勮嚜鐨勬敾閫?绉诲姩瀛楁锛氭敾鍑婚棿闅旂粺涓€鐢?unit+0x34=0x28锛?0 甯э級鍐冲畾锛涢€熷害鐢?MOVE_PER_TICK 鍏ㄥ眬绯绘暟鍐冲畾',
  evidence: [EVID.tick40, EVID.tickHz60, EVID.troopMatrix],
};

// 鈹€鈹€ 12 鍦板舰 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
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

// 鈹€鈹€ 401 灏?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
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
  shapeOfTypeGrade: '椤圭洰/48 搂1 鏍?[鎺ㄦ祴-寮鸿瑙夎瘉鎹甝',
  shapeFamilies: Object.fromEntries(SHAPE_OF_TYPE.map((s) => [s, shapeFamily(s)])),
  xlsWarInt: xlsGen.rows.map((r) => [Number(r[0]), Number(r[2]), Number(r[3])]),
  typeHistogram: genRows.reduce((a, g) => ((a[g.type] = (a[g.type] || 0) + 1), a), {}),
  rows: genRows,
  evidence: [EVID.generalTimes, EVID.typeShape, EVID.faces],
};

// 鈹€鈹€ 5 鍓ф湰 脳 60 鍩?脳 116 璺?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
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

// 鈹€鈹€ 绛夌骇琛紙鍘熶綔鍏紡锛岀嫭绔嬬畻鍑猴級鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
const expTable = Array.from({ length: 99 }, (_, i) => expToReach(i + 1));

// 鈹€鈹€ 鑷锛氭湡鏈涘€煎唴閮ㄧ殑鍘熶綔渚?join 蹇呴』 0 宸紓 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
const selfCheck = [];
function join(id, bad, sample) {
  selfCheck.push({ id, ok: bad.length === 0, diffs: bad.length, sample: bad.slice(0, 3) });
  if (bad.length) log(`  鉁?join ${id}: ${bad.length} 澶勫樊寮?渚?${JSON.stringify(bad.slice(0, 2))}`);
  return bad.length;
}
let joinFails = 0;
joinFails += join('magic.ini-vs-xls', magics.filter((m) => m.xls.seq !== m.seq || m.xls.mp !== m.mp || m.xls.power !== m.power || m.xls.attack !== m.attack || m.xls.script !== m.script).map((m) => m.seq));
joinFails += join('wise.ini-vs-xls', wises.filter((w) => w.xls.seq !== w.seq || w.xls.execute !== w.execute || w.xls.wiseLevel !== w.wiseLevel || w.xls.level !== w.level || w.xls.target !== w.activeMask).map((w) => w.seq));
joinFails += join('troop.xls-header', troopNames.length === 13 && dataMagic.length === 110 ? [] : ['count']);
joinFails += join('city.xls-vs-times', times[0].cities.filter((c, i) => Number(xlsCity.rows[i]?.[2]) !== c.pos[0] || Number(xlsCity.rows[i]?.[3]) !== c.pos[1]).map((c) => c.name));
// XLS 瀹濆吀鏄畝浣撱€乀IMES 鏄?cp950 绻佷綋锛沊LS 澶氬嚭 2 琛岋紙118 鏉?vs TIMES 116 鏉★級锛屾寜銆屽簭鍙枫€嶅榻?const xlsPathBySeq = new Map(xlsPath.rows.filter((r) => r && r[0] != null).map((r) => [Number(r[0]), r]));
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

// 鈹€鈹€ 绔栧睆蹇呯劧宸紓锛坈heck 閲屼互 skip 鍛堢幇锛夆攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
const vertical = [
  {
    id: 'vertical.map.letterbox',
    what: '鍦板浘 1280脳960 濉炶繘 750 瀹界珫灞忥細鎸?contain 缂╂斁鍚庝笂涓?宸﹀彸鐣欓粦杈癸紙fitBox contain锛夛紝鍧愭爣鏈韩涓嶅姩',
    why: '绔栧睆鍩哄噯 750脳1334 涓庡師浣?640脳480 鐨勫楂樻瘮涓嶅悓锛宑ontain 蹇呯劧鐣欒竟锛涜繖鏄増闈㈠喅绛栵紝涓嶆槸鏁版嵁宸紓',
    evidence: [EVID.verticalMap],
  },
  {
    id: 'vertical.battle.fov',
    what: '鎴樺満鍙绾垫繁 12.6 琛?/ 71 鍒楋紙FIELD_H=900锛夛紝鍘熶綔 480/72鈮?.67 琛?鈫?鏈綔绾?脳1.9 瑙嗛噹',
    why: '绔栧睆鎶婇珮搴︽崲鎴愮旱娣憋紝鍙琛屾暟蹇呯劧鍙樺锛涙牸瀛愭暟 71脳14 涓庡師浣滀竴鑷达紝鍙槸鐩告満绐楀彛鏇撮珮',
    evidence: [EVID.verticalBattle],
  },
  {
    id: 'vertical.layout.design',
    what: '璁捐鍒嗚鲸鐜?750脳1334锛堝師浣?640脳480锛夛紝HUD 100 + 鎴樺満 900 + 鎸囦护鍖?334',
    why: '绔栧睆 UI 鍩哄噯锛屽睘浜庨噸鍒剁増闈紱涓嶅奖鍝嶄换浣曞師浣滄暟鍊?,
    evidence: [EVID.verticalDesign],
  },
];

// 鈹€鈹€ [鎺ㄦ祴] 娓呭崟 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
const speculations = [
  { id: 'spec.qiPercent', what: '鎶€鍔涙秷鑰楁瘮渚嬶紳clamp(MP,20,80)% 脳 120000', why: EVID.qiPercent },
  { id: 'spec.castKind', what: 'castKind 鐢?ATTRIB/ATTACK 鍙嶆帹锛坔eal/aoe/strike锛?, why: EVID.castKind },
  { id: 'spec.activeMask', what: 'ACTIVE 涓枃涓测啋鏁板€兼帺鐮?, why: EVID.activeMask },
  { id: 'spec.wiseTarget', what: '鍐涘笀鎶€鐩爣鐮?1/2/4/8 鐨勮涔夋爣绛?, why: EVID.wiseTarget },
  { id: 'spec.typeShape', what: 'TYPE 1..15 鈫?閫犲瀷绗?1..9,A..E,0', why: EVID.typeShape },
  { id: 'spec.fxTtl', what: '鐗规晥椹荤暀 = clamp(round(甯ф暟脳2.2),24,132)锛屾棤甯ф椂 30', why: EVID.fxTtl },
  { id: 'spec.marchSpeed', what: '琛屽啗 1/3 鏈堟瘡鏍硷紙MARCH_PER_MONTH锛?, why: EVID.marchSpeed },
  { id: 'spec.sfxCurated', what: '娌℃湁 dis 鐩磋瘉鐨?35 鏉℃妧鑳介煶鏁堝彇 map6 绛栧睍鍊硷紙璇佺骇 A2/X锛孯148 鍚?C 宸叉竻闆讹級', why: EVID.sfx },
];

// 鈹€鈹€ 婧愭枃浠舵寚绾?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
const SOURCE_FILES = [
  'extract/json/magic.json', 'extract/json/sango.json', 'extract/json/xls_姝﹀皢鎶€.json',
  'extract/json/xls_鍐涘笀鎶€.json', 'extract/json/xls_鍏电.json', 'extract/json/xls_鍩庢睜.json',
  'extract/json/xls_璺緞.json', 'extract/json/xls_缇よ嫳2.json', 'extract/json/stats_paths.json',
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
  purpose: '鎶娿€屽拰鍘熶綔涓€鑷淬€嶅彉鎴愬彲閲嶆斁鏂█锛氭湡鏈涘€煎彧鐢卞師浣滄潗鏂欑敓鎴愶紝杩愯鏃跺疄鐜扮敱 check.mjs / game/tests/fidelity_net.test.ts 姣斿',
  origin: {
    tickHz: 60,
    actionIntervalFrames: 40, // 涓诲皢涓庡＋鍏靛悓涓€甯搁噺
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
    xlsNote: 'XLS 瀹濆吀涓虹畝浣擄紙118 鏉?PATH锛屽鍑?2 鏉★級锛孴IMES 涓?cp950 绻佷綋 116 鏉★紝鎸夊簭鍙峰榻愬悗闀垮害/璺偣鏁?0 宸紓',
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
log(`鉁?${path.relative(ROOT, OUT)}  ${(size / 1024).toFixed(1)} KB`);
log(`  magics ${magics.length} 路 wises ${wises.length} 路 troops ${troops.count} 路 terrains ${terrains.length} 路 generals ${generals.count} 路 scenarios ${scenarios.length}`);
log(`  鍝ㄥ叺 ${scenarios[0].sentinelCount}/${scenarios[0].pathCount} 路 鍙蛋 ${scenarios[0].realPathCount} 路 鍩?${scenarios[0].cityCount} 路 鍚涗富 ${scenarios.reduce((a, s) => a + s.kings, 0)}`);
log(`  sfx: 鐩磋瘉 ${magics.filter((m) => m.sfx.direct).length}/110 路 璇佺骇 ${JSON.stringify(magics.reduce((a, m) => ((a[m.sfx.grade] = (a[m.sfx.grade] || 0) + 1), a), {}))}`);
log(`  selfCheck ${selfCheck.filter((s) => s.ok).length}/${selfCheck.length} ok 路 joinFails ${joinFails}`);
if (joinFails) {
  log('鉁?鍘熶綔渚?join 鏈夊樊寮傦紝鍏堟煡鏁版嵁鍐嶈皥瀹炵幇');
  process.exit(1);
}

