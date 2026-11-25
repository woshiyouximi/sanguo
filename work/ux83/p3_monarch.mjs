// 问题 3 探针：君主「自己继位」——用真存档里的势力/君主重演 campaign.kingFell 的调用，
// 同时把「改前的旧算法」内联重算一遍作对照（旧算法 = 只排除死者、不校验死者是不是现任君主）。
import fs from 'node:fs';
import * as MM from 'file:///F:/sanguo/game/web/monarch_model.js';

const FULL = JSON.parse(fs.readFileSync('F:\\sanguo\\work\\ux83\\state\\save_full.json', 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));
const out = {};

// ---- 场景：嚴白虎（势力 id = 开国君主名 = 现任君主），失守城的「静态太守」= 鄒丹
const officers = [
  { name: '嚴白虎', loyal: 100, str: 68, int: 44, status: '登' },
  { name: '嚴輿', loyal: 88, str: 61, int: 40, status: '登', blood: 2 },
  { name: '王晟', loyal: 64, str: 58, int: 55, status: '登' },
];
const mk = () => {
  const s = clone(FULL);
  s.forces = s.forces || {};
  s.forces['嚴白虎'] = { ...(s.forces['嚴白虎'] || {}), id: '嚴白虎', king: '嚴白虎', alive: true, cities: ['吳'] };
  s.monarch = '張角';
  return s;
};

// 改前（旧算法，逐行照抄改前的 monarch_model.js kingDeath / successionList）
function oldKingDeath(save, forceId, opts) {
  const id = forceId;
  const dead = String(opts.dead || '').trim() || id;
  const remaining = Number.isFinite(Number(opts.remaining)) ? Number(opts.remaining) : null;
  const list = (opts.officers || []).filter((o) => o && o.name !== dead && o.name !== '盜賊')
    .map((o) => ({ ...o, score: (Number(o.blood) === 2 ? 2 : 0) * 10000 + Number(o.loyal || 0) * 100 + Number(o.str || 0) + Number(o.int || 0) }))
    .sort((a, b) => b.score - a.score);
  const heir = remaining === 0 ? '' : (list[0] ? list[0].name : '');
  if (!heir) return { dead: true, heir: '', reason: 'extinct' };
  save.forces[id].king = heir;
  return { dead: true, heir, reason: 'inherit', kingAfter: save.forces[id].king };
}

// 场景 A：失守城的太守（鄒丹）死了 —— 现任君主嚴白虎根本没死
const a1 = mk();
out.A_old = oldKingDeath(a1, '嚴白虎', { dead: '鄒丹', remaining: 1, officers });
out.A_old.kingAfterOld = a1.forces['嚴白虎'].king;
out.A_old.log = `${'嚴白虎'} 君 主 陣 亡：${out.A_old.heir} 繼 位`;   // campaign.html:2843 的模板
const a2 = mk();
out.A_new = MM.kingDeath(a2, '嚴白虎', { month: 4, dead: '鄒丹', remaining: 1, officers });
out.A_new.kingAfterNew = a2.forces['嚴白虎'].king;

// 场景 A2：阵容里「君主本人」就是最高分（只有君主 + 弱将）——89 报告里的原文
// 「嚴白虎 君主陣亡：嚴白虎 繼位」就是这条路径：死人不是君主，于是活着的君主被选成继任者。
const officersA2 = [
  { name: '嚴白虎', loyal: 100, str: 68, int: 44, status: '登' },
  { name: '王晟', loyal: 64, str: 58, int: 55, status: '登' },
];
const a3 = mk();
out.A2_old = oldKingDeath(a3, '嚴白虎', { dead: '鄒丹', remaining: 1, officers: officersA2 });
out.A2_old.kingAfter = a3.forces['嚴白虎'].king;
out.A2_old.log = `嚴白虎 君 主 陣 亡：${out.A2_old.heir} 繼 位`;
const a4 = mk();
out.A2_new = MM.kingDeath(a4, '嚴白虎', { month: 4, dead: '鄒丹', remaining: 1, officers: officersA2 });
out.A2_new.kingAfter = a4.forces['嚴白虎'].king;

// 场景 B：现任君主真的死了（dead === king）——继承必须照旧，且继任者不能是本人
const b1 = mk();
out.B_old = oldKingDeath(b1, '嚴白虎', { dead: '嚴白虎', remaining: 1, officers });
out.B_old.kingAfter = b1.forces['嚴白虎'].king;
const b2 = mk();
out.B_new = MM.kingDeath(b2, '嚴白虎', { month: 4, dead: '嚴白虎', remaining: 1, officers });
out.B_new.kingAfter = b2.forces['嚴白虎'].king;
out.B_new.log = `嚴白虎 君 主 陣 亡：${out.B_new.heir} 繼 位`;

// 场景 C：remaining=0（最后一座城也丢了）——灭亡分支不受影响
const c1 = mk();
out.C_new = MM.kingDeath(c1, '嚴白虎', { month: 4, dead: '嚴白虎', remaining: 0, officers });
out.C_new.alive = c1.forces['嚴白虎'].alive;

// 场景 D：老存档里 monarch 是玩家（張角）；AI 势力（公孫瓚，king 已传给公孫越）丢城、太守死
const d1 = mk();
d1.forces['公孫瓚'] = { ...(d1.forces['公孫瓚'] || {}), id: '公孫瓚', king: '公孫越', alive: true, cities: ['北平'] };
const dz = [{ name: '公孫越', loyal: 92, str: 72, int: 60, status: '登' }, { name: '公孫瓚', loyal: 90, str: 86, int: 70, status: '登' }];
out.D_new = MM.kingDeath(d1, '公孫瓚', { month: 4, dead: '公孫續', remaining: 1, officers: dz });
out.D_new.kingAfter = d1.forces['公孫瓚'].king;

console.log(JSON.stringify(out, null, 1));
fs.writeFileSync('F:\\sanguo\\work\\ux83\\state\\p3_monarch.json', JSON.stringify(out, null, 1), 'utf8');
