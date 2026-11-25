import { readFileSync, writeFileSync } from 'node:fs';

const p = new URL('../game/web/city_model.js', import.meta.url);
let src = readFileSync(p, 'utf8');

const a = src.indexOf("  const kind = pickWeightedKey(weights, rng());");
const b = src.indexOf('/** 本城歷史搜索次數');
if (a < 0 || b < 0 || b <= a) throw new Error('markers not found ' + a + ' ' + b);

const body = `  const kind = pickWeightedKey(weights, rng());
  save.gold = Math.max(0, num(save.gold) - SEARCH.COST);

  let out;
  if (kind === 'talent') {
    const g = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
    addToRoster(save, city, g.NAME);
    out = { ok: true, cost: SEARCH.COST, kind, general: g, seed, text: \`\${g.NAME}將軍加入我方。\` };
  } else if (kind === 'treasure' || kind === 'talisman') {
    const it = pickWeightedItem(pools[kind], rng());
    out = it
      ? { ok: true, cost: SEARCH.COST, kind, seq: num(it.Sequence), item: it, seed, text: \`找到物品\${it.Name}。\` }
      : { ok: true, cost: SEARCH.COST, kind: 'none', seed, text: '搜索一無所獲。' };
  } else {
    out = { ok: true, cost: SEARCH.COST, kind: 'none', seed, text: '搜索一無所獲。' };
  }
  // 本函式自己記日誌：count = 本城歷史搜索次數，必須隨每次搜索遞增，否則種子固定、
  // 每次都是同一個結果。頁面因此**不要**再為「搜索」補一條日誌。
  logAdd(save, { city, cmd: '搜索', kind: out.kind, text: out.text, m: save.month });
  out.logged = true;
  return out;
}

`;

src = src.slice(0, a) + body + src.slice(b);
writeFileSync(p, src, 'utf8');
console.log('patched', a, b, 'len', src.length);
