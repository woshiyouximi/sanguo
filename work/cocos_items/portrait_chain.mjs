/**
 * portrait_chain.mjs —— Portrait.ts 的三件事的證據：
 *   1. FACE_MAP 與 web `game/web/face_map.js` 的 FULL 表逐條一致（400 條，雙向）；
 *   2. 降級鏈真的是 `full → thumb → hero/<名> → 隱藏`（用打樁 loader 模擬各級缺失）；
 *   3. 三級路徑在 bundle 裡都存在（`res/face/full|thumb/NNN.webp`、`res/hero/<名>.webp`）。
 *
 * 跑法：cd F:\sanguo\work\cocos_items && node portrait_chain.mjs
 */
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { FACE_MAP, faceNumberOf, facePath, heroPaths, portraitChain, portraitUrl, loadPortrait } =
  require('./_sim/Portrait.js');

const BUNDLE = 'F:/sanguo/game/cocos/assets/bundles/res/';
const FACE_SRC = 'F:/sanguo/game/web/face_map.js';

let total = 0;
const failures = [];
function ok(label, cond, extra = '') {
  total += 1;
  if (!cond) failures.push(`${label}${extra ? ` — ${extra}` : ''}`);
  return cond;
}
function same(label, a, b) {
  total += 1;
  const sa = JSON.stringify(a);
  const sb = JSON.stringify(b);
  if (sa !== sb) failures.push(`${label}\n  web/預期 = ${sa}\n  Portrait = ${sb}`);
  return sa === sb;
}

/* ---------- 1. 與 face_map.js 的 FULL 表對拍 ---------- */
const src = readFileSync(FACE_SRC, 'utf8');
const tableMatch = src.match(/(?:const|var|let)\s+FULL\s*=\s*\{([\s\S]*?)\n\s*\};/);
if (!tableMatch) throw new Error('face_map.js 裡找不到 FULL 表（格式變了？）');
const webTable = {};
// face_map.js 的表用雙引號："丁原": "002",（gen_portrait.py 是同一個口徑）
for (const m of tableMatch[1].matchAll(/["']([^"']+)["']\s*:\s*["'](\d+)["']/g)) webTable[m[1]] = m[2];
same('FULL 表條數（web vs Portrait）', Object.keys(webTable).length, Object.keys(FACE_MAP).length);
ok('face_map.js FULL 表 = 400 條', Object.keys(webTable).length === 400, Object.keys(webTable).length);
ok('Portrait.FACE_MAP = 400 條', Object.keys(FACE_MAP).length === 400, Object.keys(FACE_MAP).length);
for (const [name, no] of Object.entries(webTable)) same(`FACE_MAP['${name}']`, no, FACE_MAP[name]);
const missingInPortrait = Object.keys(webTable).filter((n) => !(n in FACE_MAP));
const extraInPortrait = Object.keys(FACE_MAP).filter((n) => !(n in webTable));
same('只有 web 有的名字', [], missingInPortrait);
same('只有 Portrait 有的名字', [], extraInPortrait);

/* ---------- 2. portraitUrl 與 web 口徑一致（抽 40 位 + 邊界） ---------- */
const sample = Object.keys(webTable).slice(0, 40);
for (const name of sample) {
  const no = webTable[name];
  same(`portraitUrl('${name}','full')`, `assets/face/full/${no}.webp`, portraitUrl(name, 'full'));
  same(`portraitUrl('${name}','thumb')`, `assets/face/thumb/${no}.webp`, portraitUrl(name, 'thumb'));
  same(`facePath('${name}','full')`, `face/full/${no}`, facePath(name, 'full'));
  same(`facePath('${name}','thumb')`, `face/thumb/${no}`, facePath(name, 'thumb'));
}
// 沒有映射的名字（盜賊）→ web 回 hero；Cocos 的 facePath 回 null、chain 只剩 hero
same(`portraitUrl('盜賊') 走 hero`, 'assets/hero/%E7%9B%9C%E8%B3%8A.webp', portraitUrl('盜賊', 'full'));
same(`facePath('盜賊') = null`, null, facePath('盜賊'));
same(`faceNumberOf('盜賊') = null`, null, faceNumberOf('盜賊'));
same(`portraitChain('盜賊')`, [{ via: 'hero', path: 'hero/盜賊' }, { via: 'hero', path: 'hero/%E7%9B%9C%E8%B3%8A' }], portraitChain('盜賊'));
same(`portraitChain('不存在的人') 也走 hero`, [{ via: 'hero', path: 'hero/不存在的人' }, { via: 'hero', path: 'hero/%E4%B8%8D%E5%AD%98%E5%9C%A8%E7%9A%84%E4%BA%BA' }], portraitChain('不存在的人'));

/* ---------- 3. 降級鏈結構 ---------- */
same(`portraitChain('關羽')`, [
  { via: 'full', path: 'face/full/385' },
  { via: 'thumb', path: 'face/thumb/385' },
  { via: 'hero', path: 'hero/關羽' },
  { via: 'hero', path: 'hero/%E9%97%9C%E7%BE%BD' },
], portraitChain('關羽'));
same(`portraitChain('關羽','thumb')`, [
  { via: 'thumb', path: 'face/thumb/385' },
  { via: 'hero', path: 'hero/關羽' },
  { via: 'hero', path: 'hero/%E9%97%9C%E7%BE%BD' },
], portraitChain('關羽', 'thumb'));
same(`portraitChain('關羽', hero=false)`, [
  { via: 'full', path: 'face/full/385' },
  { via: 'thumb', path: 'face/thumb/385' },
], portraitChain('關羽', 'full', false));

/* ---------- 4. 打樁 loader 跑四種缺失情形 ---------- */
function makeTarget() {
  const state = { frame: null, calls: [] };
  return {
    state,
    apply(frame) {
      state.frame = frame;
      state.calls.push(frame ? `ok:${frame.path}` : 'hide');
      return true;
    },
  };
}
/** present(path) 決定這個 bundle key 是否存在；回傳 {load, log}。 */
function stubLoader(present) {
  const log = [];
  const load = (path, cb) => {
    log.push(path);
    const hit = present(path);
    if (hit) cb({ path, _frame: true });
    else cb(null);
  };
  return { load, log };
}

function runCase(label, present, name, variant = 'full') {
  const target = makeTarget();
  const { load, log } = stubLoader(present);
  let result = null;
  loadPortrait(target, name, variant, load, (r) => {
    result = r;
  });
  return { label, target, log, result };
}

// (a) 三級都在 → 命中 full，只載一次
{
  const c = runCase('全部存在', () => true, '關羽');
  same(`${c.label} via`, 'full', c.result.via);
  same(`${c.label} path`, 'face/full/385', c.result.path);
  same(`${c.label} 只試一級`, ['face/full/385'], c.log);
  ok(`${c.label} 套上 frame`, c.target.state.frame !== null && c.target.state.frame.path === 'face/full/385');
}
// (b) full 缺 → thumb
{
  const c = runCase('full 缺', (p) => !p.startsWith('face/full/'), '關羽');
  same(`${c.label} via`, 'thumb', c.result.via);
  same(`${c.label} path`, 'face/thumb/385', c.result.path);
  same(`${c.label} 試過的路徑`, ['face/full/385', 'face/thumb/385'], c.log);
}
// (c) full + thumb 都缺 → hero（原名）
{
  const c = runCase('full+thumb 缺', (p) => p.startsWith('hero/') && !p.includes('%'), '關羽');
  same(`${c.label} via`, 'hero', c.result.via);
  same(`${c.label} path`, 'hero/關羽', c.result.path);
  same(`${c.label} 試過的路徑`, ['face/full/385', 'face/thumb/385', 'hero/關羽'], c.log);
}
// (d) 只有 encodeURIComponent 形式在 bundle 裡 → 第四級命中
{
  const c = runCase('只有 encodeURIComponent 形式', (p) => p.includes('%E9%97%9C'), '關羽');
  same(`${c.label} via`, 'hero', c.result.via);
  same(`${c.label} path`, 'hero/%E9%97%9C%E7%BE%BD', c.result.path);
  same(`${c.label} 試過的路徑`, ['face/full/385', 'face/thumb/385', 'hero/關羽', 'hero/%E9%97%9C%E7%BE%BD'], c.log);
}
// (e) 全缺 → 隱藏（apply(null)）
{
  const c = runCase('全缺', () => false, '關羽');
  same(`${c.label} via`, 'none', c.result.via);
  same(`${c.label} path`, null, c.result.path);
  ok(`${c.label} 最後呼叫 apply(null)`, c.target.state.calls[c.target.state.calls.length - 1] === 'hide');
  ok(`${c.label} frame 為 null`, c.target.state.frame === null);
}
// (f) 沒有 FACE 的名字（盜賊）→ 直接 hero，不試 face
{
  const c = runCase('盜賊（無 FACE）', (p) => p === 'hero/盜賊', '盜賊');
  same(`${c.label} via`, 'hero', c.result.via);
  same(`${c.label} 沒試 face`, false, c.log.some((p) => p.startsWith('face/')));
}
// (g) thumb 變體第一級就是 thumb
{
  const c = runCase('thumb 變體', (p) => !p.startsWith('face/thumb/'), '關羽', 'thumb');
  same(`${c.label} via`, 'hero', c.result.via);
  same(`${c.label} 第一級就是 thumb`, 'face/thumb/385', c.log[0]);
}

/* ---------- 5. bundle 裡三級資源真的在（800 檔 face + 400 檔 hero） ---------- */
let faceFull = 0;
let faceThumb = 0;
let hero = 0;
const absent = [];
for (const [name, no] of Object.entries(webTable)) {
  const full = `F:/sanguo/game/cocos/assets/bundles/res/face/full/${no}.webp`;
  const thumb = `F:/sanguo/game/cocos/assets/bundles/res/face/thumb/${no}.webp`;
  const heroFile = `F:/sanguo/game/cocos/assets/bundles/res/hero/${name}.webp`;
  if (existsSync(full)) faceFull += 1;
  else absent.push(full);
  if (existsSync(thumb)) faceThumb += 1;
  else absent.push(thumb);
  if (existsSync(heroFile)) hero += 1;
}
same('face/full 命中 400', 400, faceFull);
same('face/thumb 命中 400', 400, faceThumb);
same('hero 命中 400', 400, hero);
same('缺檔清單為空', [], absent.slice(0, 5));

console.log('=== Portrait 降級鏈 ===');
console.log(`FACE_MAP        : ${Object.keys(FACE_MAP).length} 條（與 face_map.js FULL 表逐條一致）`);
console.log(`portraitChain   : full → thumb → hero/<名> → hero/<encoded> → 隱藏`);
console.log(`bundle 實檔     : face/full ${faceFull}/400 · face/thumb ${faceThumb}/400 · hero ${hero}/400`);
console.log(`斷言總數        : ${total}`);
console.log(`失敗            : ${failures.length}`);
if (failures.length) {
  console.log('\n--- 差異 ---');
  for (const line of failures) console.log(line);
  process.exitCode = 1;
} else {
  console.log('結果            : ALL PASS');
}
