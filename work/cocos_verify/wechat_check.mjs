// 微信小游戏包静态完整性断言（零依赖，node 直跑）
// 用法：node wechat_check.mjs
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'F:\\sanguo\\dist\\wechat-upload';
const results = [];
const notes = [];
function check(id, ok, detail) {
  results.push({ id, ok, detail });
  console.log((ok ? '✓' : '✗') + ' ' + id + ' :: ' + detail);
}
const R = (p) => path.join(ROOT, p);
const exists = (p) => fs.existsSync(R(p));
const readJson = (p) => JSON.parse(fs.readFileSync(R(p), 'utf8'));
function walk(dir, acc = []) {
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, d.name);
    if (d.isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}
function findOne(dir, re) {
  const names = fs.readdirSync(R(dir));
  const hit = names.filter((n) => re.test(n));
  return hit.length ? hit : null;
}

// ---------- M: game.json / 子包声明 ----------
let gameJson = null;
let gameJsonOk = true;
try { gameJson = readJson('game.json'); } catch (e) { gameJsonOk = false; check('M1 game.json 可解析', false, String(e)); }
if (gameJsonOk) {
  check('M1 game.json 可解析', true, JSON.stringify(Object.keys(gameJson)));
  check('M2 deviceOrientation=portrait', gameJson.deviceOrientation === 'portrait', 'deviceOrientation=' + gameJson.deviceOrientation);
  const subs = gameJson.subpackages || [];
  check('M3 声明 subpackages', subs.length > 0, 'count=' + subs.length + ' names=' + subs.map((s) => s.name).join(','));
  const badSlash = subs.filter((s) => /^\//.test(s.root) || /\/$/.test(s.root));
  check('M4 子包 root 无首尾斜杠', badSlash.length === 0,
    badSlash.length ? badSlash.map((s) => s.name + ' -> "' + s.root + '"').join(' ; ') + '  ← 微信要求 root 是纯目录名，尾斜杠有被判非法的风险' : subs.map((s) => s.root).join(','));
  for (const s of subs) {
    check('M5 子包目录存在 [' + s.name + ']', exists(s.root), s.root.replace(/\/$/, ''));
    const gjs = path.join(s.root.replace(/\/$/, ''), 'game.js');
    const hasGjs = exists(gjs);
    const size = hasGjs ? fs.statSync(R(gjs)).size : 0;
    check('M6 子包 entry [' + s.name + '/game.js]', hasGjs, hasGjs ? size + ' B :: ' + JSON.stringify(fs.readFileSync(R(gjs), 'utf8').slice(0, 60)) : 'MISSING');
  }
}

// ---------- S: settings ----------
const settingsNames = findOne('src', /^settings\..*\.json$/) || [];
const settingsName = settingsNames[0];
let settings = null;
if (settingsName) {
  try { settings = readJson('src/' + settingsName); check('S1 settings 可解析', true, settingsName + ' (' + fs.statSync(R('src/' + settingsName)).size + ' B)'); }
  catch (e) { check('S1 settings 可解析', false, String(e)); }
} else {
  check('S1 settings 可解析', false, 'src/settings.*.json 不存在');
}
const mainCfgName = (findOne('assets/main', /^config\..*\.json$/) || [])[0];
const mainCfg = mainCfgName ? readJson('assets/main/' + mainCfgName) : null;
if (settings && mainCfg) {
  const launch = settings.launch && settings.launch.launchScene;
  const scenePaths = Object.keys(mainCfg.scenes || {});
  check('S2 launchScene 在 main.scenes 内', scenePaths.includes(launch), 'launchScene=' + launch + ' | scenes=' + scenePaths.join(' '));
  // bundleVers vs 磁盘实际
  const bv = (settings.assets && settings.assets.bundleVers) || {};
  const pairs = [];
  const dirs = { internal: 'assets/internal', main: 'assets/main', res: 'subpackages/res' };
  for (const [name, dir] of Object.entries(dirs)) {
    const files = findOne(dir, /^config\..*\.json$/) || [];
    const disk = files.length ? files[0].split('.')[1] : null;
    pairs.push({ name, decl: bv[name] || null, disk });
  }
  check('S3 bundleVers 与磁盘 config 哈希一致', pairs.every((p) => p.disk && (!p.decl || p.decl === p.disk)),
    pairs.map((p) => p.name + ':decl=' + (p.decl || '-') + '/disk=' + (p.disk || 'MISSING')).join(' '));
  const pb = (settings.assets && settings.assets.projectBundles) || [];
  const pbMissing = pb.filter((b) => !exists(dirs[b] || ('assets/' + b)));
  check('S4 projectBundles 目录存在', pbMissing.length === 0, 'projectBundles=[ ' + pb.join(' ') + ' ] missing=[ ' + pbMissing.join(' ') + ' ]');
  const ss = ((settings.assets && settings.assets.subpackages) || []).map((s) => (typeof s === 'string' ? s : s.name));
  const gj = ((gameJson && gameJson.subpackages) || []).map((s) => s.name);
  check('S5 settings.assets.subpackages 与 game.json 一致', JSON.stringify(ss) === JSON.stringify(gj),
    'settings.names=' + JSON.stringify(ss) + ' game.json.names=' + JSON.stringify(gj) + ' | server=' + JSON.stringify(settings.assets.server) + ' remoteBundles=' + JSON.stringify(settings.assets.remoteBundles));
}

// ---------- G: game.js 的 require 目标 ----------
const gameJs = fs.readFileSync(R('game.js'), 'utf8');
const reqs = [...gameJs.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]).filter((r) => r.startsWith('.') || r.startsWith('src/'));
const reqRes = reqs.map((r) => {
  const clean = r.replace(/^\.\//, '');
  const cand = [clean, clean + '.js'];
  const hit = cand.find((c) => exists(c));
  return { r, hit: hit || null };
});
const reqMissing = reqRes.filter((x) => !x.hit);
check('G1 game.js 静态 require 目标全部存在', reqMissing.length === 0,
  reqRes.map((x) => x.r + (x.hit ? ' ✓' : ' ✗')).join(' | '));
check('G2 game.js 首行是 __initApp 且无 BOM', gameJs.charCodeAt(0) !== 0xfeff && /^\s*function __initApp/.test(gameJs), JSON.stringify(gameJs.split('\n')[0].slice(0, 40)));
const appJs = (findOne('.', /^application\..*\.js$/) || [])[0];
check('G3 application.*.js 存在且被 game.js 引用一致', !!appJs && gameJs.includes('./' + appJs), 'disk=' + appJs + ' | game.js 引用=' + (gameJs.match(/application\.[a-z0-9]+\.js/) || ['none'])[0]);
const ccJs = (findOne('cocos-js', /^cc\..*\.js$/) || [])[0];
check('G4 cocos-js 引擎存在', !!ccJs, ccJs ? ccJs + ' ' + fs.statSync(R('cocos-js/' + ccJs)).size + ' B' : 'MISSING');
check('G5 adapters 存在', exists('web-adapter.js') && exists('engine-adapter.js') && exists('first-screen.js'),
  ['web-adapter.js', 'engine-adapter.js', 'first-screen.js'].map((f) => f + '=' + (exists(f) ? fs.statSync(R(f)).size : 'MISSING')).join(' '));

// ---------- A: 每个 bundle 的资产完整性（versions 里的 hash 是否都能在磁盘找到）----------
function bundleIntegrity(label, dir) {
  const cfgName = (findOne(dir, /^config\..*\.json$/) || [])[0];
  if (!cfgName) { check('A ' + label, false, 'no config'); return {}; }
  const cfg = readJson(dir + '/' + cfgName);
  const ver = cfg.versions || { import: [], native: [] };
  const impHashes = new Set();
  const natHashes = new Set();
  for (const f of walk(R(dir + '/import'))) { const p = path.basename(f).split('.'); if (p.length >= 3) impHashes.add(p[p.length - 2].toLowerCase()); }
  if (fs.existsSync(R(dir + '/native'))) for (const f of walk(R(dir + '/native'))) { const p = path.basename(f).split('.'); if (p.length >= 3) natHashes.add(p[p.length - 2].toLowerCase()); }
  function scan(kind, declared, have) {
    const miss = [];
    for (let i = 0; i + 1 < declared.length; i += 2) {
      const idx = declared[i];
      const h = String(declared[i + 1]).toLowerCase();
      if (!have.has(h)) miss.push(idx + ':' + h);
    }
    return { declared: declared.length / 2, missing: miss, have: have.size };
  }
  const imp = scan('import', ver.import || [], impHashes);
  const nat = scan('native', ver.native || [], natHashes);
  const okImp = imp.missing.length === 0;
  const okNat = nat.missing.length === 0;
  check('A ' + label + ' import 全命中', okImp, 'declared=' + imp.declared + ' have=' + imp.have + ' missing=' + imp.missing.length + (imp.missing.length ? ' first=' + imp.missing.slice(0, 5).join(',') : ''));
  check('A ' + label + ' native 全命中', okNat, 'declared=' + nat.declared + ' have=' + nat.have + ' missing=' + nat.missing.length + (nat.missing.length ? ' first=' + nat.missing.slice(0, 5).join(',') : ''));
  // 缺失的 native 到底缺什么：用 config.paths 反查
  if (nat.missing.length) {
    const paths = cfg.paths || {};
    const rows = nat.missing.map((m) => {
      const idx = Number(String(m).split(':')[0]);
      const p = paths[String(idx)] || paths[idx] || null;
      return { idx, path: p ? String(p[0]) : '?', hash: String(m).split(':')[1] };
    });
    const audio = rows.filter((r) => /audio\//i.test(r.path));
    check('A ' + label + ' 缺失项归类', true, 'missing=' + rows.length + ' 其中 audio 路径=' + audio.length + ' | 样例: ' + rows.slice(0, 4).map((r) => r.idx + '=' + r.path).join(' , '));
    if (label.indexOf('res') >= 0) notes.push({ kind: 'missing-native', rows: rows.slice(0, 200) });
  }
  return { cfg, uuids: (cfg.uuids || []).length, imp, nat };
}
const bInternal = bundleIntegrity('internal', 'assets/internal');
const bMain = bundleIntegrity('main', 'assets/main');
const bRes = bundleIntegrity('res(子包)', 'subpackages/res');

// ---------- 场景 ----------
if (mainCfg) {
  const scenes = mainCfg.scenes || {};
  const names = Object.keys(scenes).map((p) => p.split('/').pop());
  check('S6 四个场景都在 main.scenes', names.length === 4, names.join(' '));
  // 每个 scene uuid 的 import 文件在不在（用 uuids 数组 + scenes 索引，仅检查数量对齐）
  check('S7 main uuids 数量 >= 场景数', (mainCfg.uuids || []).length >= names.length, 'uuids=' + (mainCfg.uuids || []).length + ' scenes=' + names.length);
}

// ---------- 音频：有没有引用已剔除的 res/audio ----------
const allFiles = walk(R('.'));
const jsonFiles = allFiles.filter((f) => f.endsWith('.json') && f.includes(path.sep + 'assets' + path.sep) || f.includes('subpackages' + path.sep + 'res' + path.sep + 'config'));
const audioRefs = [];
for (const f of allFiles) {
  if (!/\.(json|js)$/.test(f)) continue;
  let txt;
  try { txt = fs.readFileSync(f, 'utf8'); } catch { continue; }
  if (txt.includes('res/audio') || txt.includes('audio/')) {
    const n = (txt.match(/res\/audio|audio\//g) || []).length;
    audioRefs.push({ f: f.replace(ROOT, ''), n });
  }
}
check('A5 静图/配置中无 res/audio 悬挂引用', audioRefs.length === 0, audioRefs.length ? audioRefs.slice(0, 5).map((x) => x.f + '(' + x.n + ')').join(' ') + ' 共' + audioRefs.length + '个文件' : '扫描 ' + allFiles.length + ' 个文件，0 处');
const audioDirs = allFiles.filter((f) => /[\\/]audio[\\/]/.test(f));
check('A6 磁盘上是否存在 audio 目录文件', true, audioDirs.length + ' 个文件命中 /audio/');
if (exists('audio-manifest.json')) {
  let am = null;
  try { am = JSON.parse(fs.readFileSync(R('audio-manifest.json'), 'utf8')); } catch (e) { check('A7 audio-manifest 可解析', false, String(e)); }
  if (am) check('A7 audio-manifest 可解析', true, 'type=' + (Array.isArray(am) ? 'array[' + am.length + ']' : 'object keys=' + Object.keys(am).join(',')) + ' head=' + JSON.stringify(am).slice(0, 160));
} else check('A7 audio-manifest 可解析', false, 'audio-manifest.json 不存在');

// ---------- 体量 ----------
const total = allFiles.reduce((a, f) => a + fs.statSync(f).size, 0);
const mainPkg = allFiles.filter((f) => !f.includes(path.sep + 'subpackages' + path.sep));
const mainBytes = mainPkg.reduce((a, f) => a + fs.statSync(f).size, 0);
const subBytes = total - mainBytes;
check('Z1 总体量', true, 'files=' + allFiles.length + ' bytes=' + total + ' (' + (total / 1048576).toFixed(2) + ' MB) 主包=' +
  (mainBytes / 1048576).toFixed(2) + ' MB 子包=' + (subBytes / 1048576).toFixed(2) + ' MB');
check('Z2 子包体积（微信单分包 4 MB 上限）', subBytes / 1048576 <= 4,
  'subpackages/res = ' + (subBytes / 1048576).toFixed(2) + ' MB / ' + (subBytes / 1048576 > 4 ? '超限 ' + (subBytes / 1048576 / 4).toFixed(1) + '×' : 'OK') + '（图片已压缩，zip 后不会显著变小）');

const failed = results.filter((r) => !r.ok);
console.log('\n--- summary ---');
console.log('断言 ' + (results.length - failed.length) + '/' + results.length + ' 通过；失败：' + (failed.map((f) => f.id).join(', ') || '无'));
fs.writeFileSync(path.join('F:\\sanguo\\work\\cocos_verify', 'wechat_check.json'), JSON.stringify({ results, failed: failed.map((f) => f.id) }, null, 2), 'utf8');
