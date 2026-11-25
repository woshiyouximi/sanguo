// 生成 magic_sfx_evidence.csv：110 条武将技音效证据表。
// 数据源：audit.json（逐条静态证据链）+ magic_so.symbols.json（函数地址）+
//         本文件里的 MANUAL（R148 手工取证并升级为 A2 的 24 条链）。
// 用法：node work/sfx_evidence/mkcsv.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = 'F:/sanguo';
const audit = JSON.parse(readFileSync(`${ROOT}/work/sfx_evidence/audit.json`, 'utf8'));
const sym = JSON.parse(readFileSync(`${ROOT}/game/data/magic_so.symbols.json`, 'utf8'));
const fns = Array.isArray(sym) ? sym : (sym.functions ?? Object.values(sym));
const addr = new Map();
for (const f of fns) {
  if (f && f.name) addr.set(f.name, '0x' + Number(f.off).toString(16).toUpperCase());
}

const C6 = 'ArrowSupport>ProduceArrowSoldier>AddSoldierRight/Left>obj16001/16002(!6003/!6004)>FlyArrowLU';
const manual = {
  '004': [C6, '0xB22C', 'L5789', '脚本→物件→!回调链：obj16001/16002 Wait 动画串内 !6003/!6004=FlyArrowLU/FlyArrowRU 播 "arrow"（原作无 M006* 音）'],
  '015': [C6, '0xB22C', 'L5789', '脚本→物件→!回调链：obj16001/16002 Wait 动画串内 !6003/!6004=FlyArrowLU/FlyArrowRU 播 "arrow"（原作无 M006* 音）'],
  '030': [C6, '0xB22C', 'L5789', '脚本→物件→!回调链：obj16001/16002 Wait 动画串内 !6003/!6004=FlyArrowLU/FlyArrowRU 播 "arrow"（原作无 M006* 音）'],
  '045': [C6, '0xB22C', 'L5789', '脚本→物件→!回调链：obj16001/16002 Wait 动画串内 !6003/!6004=FlyArrowLU/FlyArrowRU 播 "arrow"（原作无 M006* 音）'],
  '072': [C6, '0xB22C', 'L5789', '脚本→物件→!回调链：obj16001/16002 Wait 动画串内 !6003/!6004=FlyArrowLU/FlyArrowRU 播 "arrow"（原作无 M006* 音）'],
  '087': [C6, '0xB22C', 'L5789', '脚本→物件→!回调链：obj16001/16002 Wait 动画串内 !6003/!6004=FlyArrowLU/FlyArrowRU 播 "arrow"（原作无 M006* 音）'],
  '009': ['Thunder>obj15010($m005snd02)', '0x8DCC', 'L5362', '脚本 depth1 CreateXXX 内 PUSHI 15010 → THINGS 动画 $m005snd02（L5366/5367 另有 15001/15003，同 $）'],
  '014': ['Thunder>obj15010($m005snd02)', '0x8DCC', 'L5362', '脚本 depth1 CreateXXX 内 PUSHI 15010 → THINGS 动画 $m005snd02（L5366/5367 另有 15001/15003，同 $）'],
  '022': ['Thunder>obj15010($m005snd02)', '0x8DCC', 'L5362', '脚本 depth1 CreateXXX 内 PUSHI 15010 → THINGS 动画 $m005snd02（L5366/5367 另有 15001/15003，同 $）'],
  '028': ['Thunder>obj15010($m005snd02)', '0x8DCC', 'L5362', '脚本 depth1 CreateXXX 内 PUSHI 15010 → THINGS 动画 $m005snd02（L5366/5367 另有 15001/15003，同 $）'],
  '039': ['Thunder>obj15010($m005snd02)', '0x8DCC', 'L5362', '脚本 depth1 CreateXXX 内 PUSHI 15010 → THINGS 动画 $m005snd02（L5366/5367 另有 15001/15003，同 $）'],
  '047': ['ConvexStone>obj20001($m010snd01)', '0x10D68', 'L9728', '脚本 depth1 CreateXXX 内 PUSHI 20001 → THINGS 动画 $m010snd01（20002 同 $）'],
  '055': ['ConvexStone>obj20001($m010snd01)', '0x10D68', 'L9728', '脚本 depth1 CreateXXX 内 PUSHI 20001 → THINGS 动画 $m010snd01（20002 同 $）'],
  '064': ['ConvexStone>obj20001($m010snd01)', '0x10D68', 'L9728', '脚本 depth1 CreateXXX 内 PUSHI 20001 → THINGS 动画 $m010snd01（20002 同 $）'],
  '048': ['StoneEmitter>ProduceStoneEmitter>obj17002($m007snd01)', '0xDF2C', 'L7381', '脚本 depth2 CreateXXX 内 PUSHI 17002 → THINGS 投石車 $m007snd01 !7005'],
  '091': ['StoneEmitter>ProduceStoneEmitter>obj17002($m007snd01)', '0xDF2C', 'L7381', '脚本 depth2 CreateXXX 内 PUSHI 17002 → THINGS 投石車 $m007snd01 !7005'],
  '105': ['StoneEmitter>ProduceStoneEmitter>obj17002($m007snd01)', '0xDF2C', 'L7381', '脚本 depth2 CreateXXX 内 PUSHI 17002 → THINGS 投石車 $m007snd01 !7005'],
  '065': ['RushCart>obj14001($m004snd01)', '0x7288', 'L4317', '脚本 CALL RushCart 内 PUSHI 14001 → THINGS 衝車 $m004snd01'],
  '082': ['RushCart>obj14001($m004snd01)', '0x7288', 'L4317', '脚本 CALL RushCart 内 PUSHI 14001 → THINGS 衝車 $m004snd01'],
  '104': ['DemonDancing>obj14001($m004snd01)', '0x14DE8', 'L12169', '脚本 depth1 DemonDancing 内 PUSHI 14001 → THINGS 衝車 $m004snd01（另有通用音 att07/yell01）'],
  '069': ['FireWork>ProduceCannonEmitter>obj43001/43005(!33002)>ShootCannon>obj43002($m033snd01)', '0x2BD3C', 'L24877/L24593', '脚本→物件→!回调链：43001/43005 !33002=ShootCannon 发 43002 砲彈 $m033snd01'],
  '074': ['FireWork>ProduceCannonEmitter>obj43001/43005(!33002)>ShootCannon>obj43002($m033snd01)', '0x2BD3C', 'L24877/L24593', '脚本→物件→!回调链：43001/43005 !33002=ShootCannon 发 43002 砲彈 $m033snd01'],
  '090': ['FireWork>ProduceCannonEmitter>obj43001/43005(!33002)>ShootCannon>obj43002($m033snd01)', '0x2BD3C', 'L24877/L24593', '脚本→物件→!回调链：43001/43005 !33002=ShootCannon 发 43002 砲彈 $m033snd01'],
  '044': ['FinalX1>XCallDragon>Xsc3603>obj28012(!42002)>Xsc3604', '0x36310', 'L29811/L29512', '脚本→物件→!回调链：XCallDragon 调 Xsc3603 生成 28012 火柱，!42002=Xsc3604 播 m018snd03（同链另有 snd01/02）'],
};

const grades = new Map();
for (const line of readFileSync(`${ROOT}/game/src/core/audio_bus.ts`, 'utf8').split('\n')) {
  for (const m of line.matchAll(/'(\d{3})':'([^']+)'/g)) grades.set(m[1], m[2]);
}

const rows = [];
for (const a of audit) {
  const k = a.k;
  const g = grades.get(k);
  if (!g) throw new Error('no grade for ' + k);
  let srcFn, srcVa, line, verdict;
  if (manual[k]) {
    [srcFn, srcVa, line, verdict] = manual[k];
  } else if (a.scriptSnd.length) {
    const s = a.scriptSnd[0];
    const m = /@d(\d+)<([^>]+)>(.*?)>L(\d+)$/.exec(s);
    if (!m) throw new Error('bad scriptSnd ' + s);
    const chain = m[3].split('>').filter(Boolean);
    srcFn = chain.join('>');
    srcVa = addr.get(chain[chain.length - 1]) ?? '';
    line = 'L' + m[4];
    verdict = m[1] === '1'
      ? '直证：技能特效函数 depth1 内 PUSHS+SYSCALL(0x301)'
      : g === 'A'
        ? `特效函数链 depth=${m[1]} 内播，R113 逐字节取证升 A`
        : `间接链 depth=${m[1]}：CreateXXX 内播，音效号==fx_dir`;
  } else if (a.thingSnd.length) {
    srcFn = a.thingSnd[0];
    srcVa = '';
    line = '';
    verdict = '物件层 $ 播放点';
  } else {
    throw new Error('no evidence for ' + k);
  }
  rows.push([k, a.name, a.cur, g, srcFn, srcVa, line, verdict]);
}

const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
const head = ['seq', 'name', 'sfx', 'grade', 'source_fn', 'source_va', 'dis_line', 'verdict'];
const csv = [head.join(','), ...rows.map((r) => r.map(esc).join(','))].join('\r\n') + '\r\n';
writeFileSync(`${ROOT}/work/sfx_evidence/magic_sfx_evidence.csv`, csv, 'utf8');

const cnt = {};
for (const r of rows) cnt[r[3]] = (cnt[r[3]] ?? 0) + 1;
console.log('rows', rows.length, JSON.stringify(cnt));
console.log(rows.filter((r) => ['004', '044', '065', '069'].includes(r[0])).map((r) => r.join(' | ')).join('\n'));
