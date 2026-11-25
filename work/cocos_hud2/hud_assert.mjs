// 194 验收（判定端）：读 steps_hud_dump.mjs 采回来的 hud_dump.json，断言
//   · 两块主将卡各有 兵 / 體 两条 Label（且是 8px 条，几何与 web GENERAL_CARD_BARS 同源）；
//   · 四个裸数字存在，取值就是 疲 / 士 / 智 / 武 的内核值，13px；
//   · `技` 是 10px 小字，落在名字行（不占行位）；
//   · `行` 细条高度 ≤ 4（实测 3）；
//   · 敌方卡整块镜像（同名列的 x 序与左卡相反）；
//   · 招降面板每卡十欄两欄（拿不到的欄位渲染灰色「—」）。
//
//   node work\cocos_hud2\hud_assert.mjs            跑 CDP 采集 + 断言
//       · 页面默认用本目录自己那份构建（work\cocos_hud2\cocos-build），会自动起一个临时静态服务；
//         没有这份构建才退回 http://127.0.0.1:5173/cocos-build/web-mobile/index.html。
//       · 浏览器用独立实例（端口 9333 / profile work\.edgeprof_hud2），不跟别人的 9222 抢。
//       · 想指定页面：PAGE_URL=... MATCH=... node work\cocos_hud2\hud_assert.mjs
//   node work\cocos_hud2\hud_assert.mjs --no-run   只断言已有的 hud_dump.json（改断言时用这个，秒回）
//   HUD_CDP_MODE=attach                            复用已开着的浏览器（自己先 launch 过的那种）
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';

const OUT = 'F:\\sanguo\\work\\cocos_hud2';
const DUMP = path.join(OUT, 'hud_dump.json');
const CDP = 'F:\\sanguo\\work\\cocos_verify\\cdpweb.mjs';
const STEPS = path.join(OUT, 'steps_hud_dump.mjs');
const SERVE = path.join(OUT, 'serve.mjs');
const MY_BUILD_INDEX = path.join(OUT, 'cocos-build', 'web-mobile', 'index.html');
const NO_RUN = process.argv.includes('--no-run');

/* ------------------------------------------------------------------ */
/* 采集环境：优先用本目录自己那份构建（含 194 的改动），没有才退回 5173。   */
/* 原因：game/cocos-build/web-mobile 是多人共用的产物，常常落后于源码，     */
/* 直接拿 5173 验证会「测到别人的旧包」。                                  */
/* ------------------------------------------------------------------ */
let PAGE_URL = process.env.PAGE_URL || '';
let MATCH = process.env.MATCH || '';
let srv = null;

const portFree = (port) =>
  new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve(false));
    s.once('listening', () => s.close(() => resolve(true)));
    s.listen(port, '127.0.0.1');
  });
const waitHttp = async (url, ms) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const r = await fetch(url, { method: 'HEAD' });
      if (r.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
};

if (!NO_RUN && !PAGE_URL) {
  if (fs.existsSync(MY_BUILD_INDEX)) {
    let port = 0;
    for (let p = 5271; p < 5300 && !port; p += 1) if (await portFree(p)) port = p;
    if (port) {
      srv = spawn(process.execPath, [SERVE, OUT, String(port)], { stdio: 'ignore' });
      PAGE_URL = 'http://127.0.0.1:' + port + '/cocos-build/web-mobile/index.html';
      MATCH = String(port);
      const up = await waitHttp(PAGE_URL, 8000);
      console.log('自起静态服务 :' + port + '（root=' + OUT + '）' + (up ? ' OK' : ' 起不来'));
    }
  }
  if (!PAGE_URL) PAGE_URL = 'http://127.0.0.1:5173/cocos-build/web-mobile/index.html';
}
if (!MATCH) MATCH = process.env.MATCH || 'cocos-build';

/* ------------------------------------------------------------------ */
/* 采集                                                                 */
/* ------------------------------------------------------------------ */
if (!NO_RUN) {
  // 独立浏览器实例（端口/profile 都别跟别人的 9222 撞）
  const CDP_PORT = process.env.PORT || '9333';
  const PROFILE = process.env.PROFILE || 'F:\\sanguo\\work\\.edgeprof_hud2';
  const env = { ...process.env, OUTDIR: OUT, PAGE_URL, MATCH, PORT: CDP_PORT };
  // HUD_CDP_MODE: full（默认，自己 launch/close）| attach（复用已开着的浏览器）| keep（launch 后不关，便于连跑）
  const MODE = process.env.HUD_CDP_MODE || 'full';
  const run = (args, tag, extra = {}) => {
    console.log('\n=== cdp ' + tag + ' ===');
    const r = spawnSync(process.execPath, [CDP, ...args], { stdio: 'inherit', env: { ...env, ...extra } });
    if (r.status !== 0) console.log('(cdp ' + tag + ' exit ' + r.status + ' —— 已有浏览器时常非 0，继续)');
    return r.status === 0;
  };
  if (MODE !== 'attach') {
    // profile / 端口偶尔被上一个没退干净的实例占着，换一个再试一次
    if (!run(['launch'], 'launch')) {
      console.log('launch 失败，换 profile 重试一次…');
      run(['launch'], 'launch(retry)', { PROFILE: PROFILE + '_b' });
    }
  }
  run(['run', STEPS], 'run steps_hud_dump.mjs');
  if (MODE === 'full') run(['close'], 'close');
}
if (srv) srv.kill();
if (!fs.existsSync(DUMP)) {
  console.error('没有 dump：' + DUMP + '（先跑不带 --no-run 的一次）');
  process.exit(2);
}
const dump = JSON.parse(fs.readFileSync(DUMP, 'utf8'));

/* ------------------------------------------------------------------ */
/* 设计常量：与 BattleHud.ts / web layout.ts 同源，故意写死成字面量，       */
/* 这样一旦源码里挪了位置，断言就会红（而不是跟着源码一起漂）。            */
/* ------------------------------------------------------------------ */
const CARD_A = { x: 116, y: 1012, w: 250, h: 100 };
const CARD_B = { x: 366, y: 1012, w: 151, h: 100 };
const VITAL_W_A = 88; // web GENERAL_CARD_VITAL_W
const VITAL_W_B = 72; // web GENERAL_CARD_VITAL_W_B
const BAR_H = 8; // web GENERAL_CARD_BAR_H
const ROW = { name: 1025, mp: 1024, troop: 1040, hp: 1056, statA: 1070, statB: 1084, action: 1090 };
const ACTION_BAR = { x: 116, y: 1094, w: 238, h: 3 };
const FIELD = { top: 27, rowH: 16, keyW: 44, valW: 116, colX: [160, 330], cardY0: 240 };
const SUR_KEYS = ['等級', '士氣', '疲勞', '武力', '智力', '忠誠', '武器', '物品', '勝場數', '敗場數'];

/* ------------------------------------------------------------------ */
/* 断言器                                                               */
/* ------------------------------------------------------------------ */
let total = 0;
const failures = [];
const perSection = new Map();
let section = '';
const head = (t) => {
  section = t;
  perSection.set(t, { n: 0, fail: 0 });
  console.log('\n---- ' + t + ' ----');
};
function ok(label, cond, detail = '') {
  total += 1;
  const tally = perSection.get(section) || { n: 0, fail: 0 };
  tally.n += 1;
  if (cond) {
    console.log('  ok   ' + label + (detail ? '   [' + detail + ']' : ''));
  } else {
    tally.fail += 1;
    failures.push({ section, label, detail });
    console.log('  FAIL ' + label + (detail ? '   [' + detail + ']' : ''));
  }
  perSection.set(section, tally);
}
const eq = (label, actual, expected) =>
  ok(label, JSON.stringify(actual) === JSON.stringify(expected), 'got ' + JSON.stringify(actual) + ' want ' + JSON.stringify(expected));
const near = (label, actual, expected, tol = 0.51) =>
  ok(label, typeof actual === 'number' && Math.abs(actual - expected) <= tol, 'got ' + actual + ' want ' + expected + ' ±' + tol);
function re(label, actual, pattern) {
  ok(label, typeof actual === 'string' && pattern.test(actual), 'got ' + JSON.stringify(actual) + ' want ' + pattern);
}
const ceil = (v) => (Number.isFinite(v) ? Math.max(0, Math.ceil(v)) : 0);
// dump 里的颜色统一是小写 #rrggbb，这里大小写不敏感地比
const sameHex = (a, b) => typeof a === 'string' && a.toLowerCase() === b.toLowerCase();
const eqHex = (label, actual, expected) => ok(label, sameHex(actual, expected), 'got ' + actual + ' want ' + expected);

/* ------------------------------------------------------------------ */
/* 数据准备                                                             */
/* ------------------------------------------------------------------ */
// dump 结构：{ hud: { ok, scene, frames, hud: {nodeName,active,cardBars,actionBar,labels}, world:{tick,a,b} }, panel: {...} }
const hudWrap = dump.hud || {};
const hud = hudWrap.hud || {};
const labels = hud.labels || [];
const byName = new Map();
for (const l of labels) if (!byName.has(l.name)) byName.set(l.name, l);
const L = (name) => byName.get(name) || null;
const bars = hud.cardBars || [];
const barOf = (side, kind) => bars.find((b) => b.side === side && b.kind === kind) || null;
const w = hudWrap.world || {};
const ga = (w.a && w.a.general) || null;
const gb = (w.b && w.b.general) || null;
const actionBar = hud.actionBar || null;

/* ------------------------------------------------------------------ */
/* 0. dump 本身                                                         */
/* ------------------------------------------------------------------ */
head('0 dump 前提');
ok('dump 成功（页面里找到了 BattleRoot.hud）', hudWrap.ok === true, 'ok=' + hudWrap.ok + ' err=' + (hudWrap.error || '-'));
eq('场景是 Battle', hudWrap.scene, 'Battle');
ok('左右两边的主将都在 world 里', !!ga && !!gb, (ga && ga.name) + ' vs ' + (gb && gb.name));
eq('HUD 根节点名', hud.nodeName, 'BattleHud');
ok('HUD 是激活的（否则采到的是关掉的旧值）', hud.active === true);
ok('dump 里至少有 15 个卡内 Label', labels.length >= 15, 'labels=' + labels.length);

/* ------------------------------------------------------------------ */
/* 1. 四条 8px 兵/體 条                                                 */
/* ------------------------------------------------------------------ */
head('1 兵/體 两条 8px 条（几何照抄 web GENERAL_CARD_BARS）');
eq('条的数量 = 4（左兵/左體/右兵/右體）', bars.length, 4);
eq('条的组合 = A/troop,A/hp,B/troop,B/hp', bars.map((b) => b.side + '/' + b.kind), ['A/troop', 'A/hp', 'B/troop', 'B/hp']);
eq('左兵条矩形', barOf('A', 'troop').rect, { x: CARD_A.x + VITAL_W_A, y: 1034, w: CARD_A.w - VITAL_W_A - 4, h: BAR_H });
eq('左體条矩形', barOf('A', 'hp').rect, { x: CARD_A.x + VITAL_W_A, y: 1050, w: CARD_A.w - VITAL_W_A - 4, h: BAR_H });
eq('右兵条矩形（镜像：从卡左沿 +4 起画）', barOf('B', 'troop').rect, { x: CARD_B.x + 4, y: 1034, w: CARD_B.w - VITAL_W_B - 4, h: BAR_H });
eq('右體条矩形', barOf('B', 'hp').rect, { x: CARD_B.x + 4, y: 1050, w: CARD_B.w - VITAL_W_B - 4, h: BAR_H });
ok('四条都是 8px 高（web GENERAL_CARD_BAR_H）', bars.every((b) => b.rect.h === BAR_H), JSON.stringify(bars.map((b) => b.rect.h)));
ok('兵条压在體条上方（y 更小）', barOf('A', 'troop').rect.y < barOf('A', 'hp').rect.y, barOf('A', 'troop').rect.y + ' < ' + barOf('A', 'hp').rect.y);
eq('左兵条颜色 = oursLight', barOf('A', 'troop').color, '#9DB8FF');
eq('左體条颜色 = heal', barOf('A', 'hp').color, '#69C98A');
eq('右兵条颜色 = enemyLight', barOf('B', 'troop').color, '#FFA18E');
eq('右體条颜色 = heal', barOf('B', 'hp').color, '#69C98A');

/* ------------------------------------------------------------------ */
/* 2. 左卡 兵 / 體 两条 Label                                           */
/* ------------------------------------------------------------------ */
head('2 左卡「兵 x/y」「體 x/y」两条 Label');
const tA = L('CardTroopA');
const hA = L('CardHpA');
ok('CardTroopA 存在', !!tA);
ok('CardHpA 存在', !!hA);
re('「兵」文案形如 `兵 a/b`', tA && tA.text, /^兵 \d+\/\d+$/);
re('「體」文案形如 `體 a/b`', hA && hA.text, /^體 \d+\/\d+$/);
eq('「兵」= ceil(aliveCount)/ceil(start)（与 web vitalText 同口径）', tA && tA.text, '兵 ' + ceil(w.a.aliveCount) + '/' + ceil(w.a.start));
eq('「體」= ceil(hp)/ceil(maxHp)', hA && hA.text, '體 ' + ceil(ga.hp) + '/' + ceil(ga.maxHp));
ok('兵/體 是两条不同字段（不是同一串复制）', tA && hA && tA.text !== hA.text, (tA && tA.text) + ' | ' + (hA && hA.text));
eq('「兵」字号 16（web numSize = FONT.small）', tA && tA.size, 16);
eq('「體」字号 16', hA && hA.size, 16);
near('「兵」行中心 y = 1040（web troopText 1046 的竖版折算）', tA && tA.dy, ROW.troop);
near('「體」行中心 y = 1056（web hpText 1062）', hA && hA.dy, ROW.hp);
ok('體行在兵行下方', tA && hA && hA.dy > tA.dy, (tA && tA.dy) + ' → ' + (hA && hA.dy));
near('「兵」贴卡左沿（左对齐 88 宽 → 盒中心 116+44）', tA && tA.dx, CARD_A.x + VITAL_W_A / 2);
near('「體」同一左沿', hA && hA.dx, CARD_A.x + VITAL_W_A / 2);

/* ------------------------------------------------------------------ */
/* 3. 技 小字                                                           */
/* ------------------------------------------------------------------ */
head('3 名字行里的 `技` 10px 小字（不占行位）');
const sA = L('CardSkillA');
const sB = L('CardSkillB');
ok('CardSkillA 存在', !!sA);
re('「技」文案形如 `技 a/b`', sA && sA.text, /^技 \d+\/\d+$/);
eq('「技」= ceil(mp)/ceil(mpMax)', sA && sA.text, '技 ' + ceil(ga.mp) + '/' + ceil(ga.mpMax));
eq('「技」字号 10（web 这里是 10px）', sA && sA.size, 10);
near('「技」落在名字行（y ≈ 1024 / 名字 1025）', sA && sA.dy, ROW.mp, 1.51);
ok('「技」不占兵/體的行位（不在 1040/1056 上）', sA && Math.abs(sA.dy - ROW.troop) > 8 && Math.abs(sA.dy - ROW.hp) > 8, 'dy=' + (sA && sA.dy));
ok('敌方卡也有「技」小字', !!sB && /^技 \d+\/\d+$/.test(sB.text), sB && sB.text);
eq('敌方「技」同样 10px', sB && sB.size, 10);

/* ------------------------------------------------------------------ */
/* 4. 四个裸数字                                                        */
/* ------------------------------------------------------------------ */
head('4 四个裸数字（疲 / 士 / 智 / 武，13px，两列）');
const nA = [0, 1, 2, 3].map((i) => L('CardNumA' + i));
const nB = [0, 1, 2, 3].map((i) => L('CardNumB' + i));
ok('CardNumA0..3 四个都在', nA.every(Boolean), nA.map((x) => (x ? x.name : 'missing')).join(','));
eq('CardNumA0 = 疲 <tire>', nA[0] && nA[0].text, '疲 ' + Math.max(0, Math.round(ga.tire ?? 0)));
eq('CardNumA1 = 士 <morale>', nA[1] && nA[1].text, '士 ' + Math.max(0, Math.round(ga.morale ?? w.a.morale)));
eq('CardNumA2 = 智 <int>', nA[2] && nA[2].text, '智 ' + ga.int);
eq('CardNumA3 = 武 <str>', nA[3] && nA[3].text, '武 ' + ga.str);
ok('四个裸数字字号都是 13（web 13px）', nA.every((x) => x && x.size === 13), nA.map((x) => (x && x.size)).join(','));
ok('四个裸数字颜色都是 textDim', nA.every((x) => x && sameHex(x.color, '#9AA3AE')), nA.map((x) => (x && x.color)).join(','));
ok('上排是 疲/士（y=1070）', nA[0] && nA[1] && nA[0].dy === ROW.statA && nA[1].dy === ROW.statA, nA[0] && nA[0].dy + ' / ' + (nA[1] && nA[1].dy));
ok('下排是 智/武（y=1084）', nA[2] && nA[3] && nA[2].dy === ROW.statB && nA[3].dy === ROW.statB, nA[2] && nA[2].dy + ' / ' + (nA[3] && nA[3].dy));
near('左卡外侧列（疲/智）盒中心 116+55=171', nA[0] && nA[0].dx, CARD_A.x + 55);
near('左卡内侧列（士/武）盒中心 240+55=295', nA[1] && nA[1].dx, CARD_A.x + 124 + 55);
ok('左卡外侧列在内侧列左边（疲 在 士 左）', nA[0] && nA[1] && nA[0].dx < nA[1].dx, nA[0] && nA[0].dx + ' < ' + (nA[1] && nA[1].dx));
ok('四个数字都不带描边（裸数字）', nA.every((x) => x && !x.bold), '');

/* ------------------------------------------------------------------ */
/* 5. 行 细条                                                           */
/* ------------------------------------------------------------------ */
head('5 「行」3px 细条（height ≤ 4）');
const gauge = hud.actionBar;
const gLab = L('CardGaugeLabel');
ok('cardActionBar 几何存在（公开字段）', !!gauge, JSON.stringify(gauge));
ok('「行」条高度 ≤ 4', !!gauge && gauge.h <= 4, 'h=' + (gauge && gauge.h));
eq('「行」条高度 = 3（web bar(...,3,...)）', gauge && gauge.h, 3);
eq('「行」条宽度 = 卡宽 − 12', gauge && gauge.w, CARD_A.w - 12);
eq('「行」条左沿 = 卡左沿', gauge && gauge.x, CARD_A.x);
eq('「行」条 y = 1094', gauge && gauge.y, 1094);
ok('「行」条落在卡框内（1012..1112）', !!gauge && gauge.y >= CARD_A.y && gauge.y + gauge.h <= CARD_A.y + CARD_A.h, (gauge && gauge.y) + '+' + (gauge && gauge.h));
eq('「行」字文案', gLab && gLab.text, '行');
ok('「行」字是角标级小字（≤12px）', gLab && gLab.size <= 12, 'size=' + (gLab && gLab.size));
near('「行」字右对齐在卡右沿（盒中心 366−12）', gLab && gLab.dx, CARD_A.x + CARD_A.w - 12);
near('「行」字与条同一行（y ≈ 1090）', gLab && gLab.dy, ROW.action);

/* ------------------------------------------------------------------ */
/* 6. 敌方卡镜像                                                        */
/* ------------------------------------------------------------------ */
head('6 敌方卡整块镜像（x 序与左卡相反）');
const tB = L('CardTroopB');
const hB = L('CardHpB');
re('敌方「兵」文案', tB && tB.text, /^兵 \d+\/\d+$/);
re('敌方「體」文案', hB && hB.text, /^體 \d+\/\d+$/);
eq('敌方「兵」= ceil(b.aliveCount)/ceil(b.start)', tB && tB.text, '兵 ' + ceil(w.b.aliveCount) + '/' + ceil(w.b.start));
eq('敌方「體」= ceil(foe.hp)/ceil(foe.maxHp)', hB && hB.text, '體 ' + ceil(gb.hp) + '/' + ceil(gb.maxHp));
eq('敌方「兵」13px（web mirror 侧 numSize=13）', tB && tB.size, 13);
near('敌方「兵」右对齐贴着卡右沿 517', tB && tB.dx, CARD_B.x + CARD_B.w - VITAL_W_B / 2);
near('敌方「兵」在 1040 行', tB && tB.dy, ROW.troop);
near('敌方「體」在 1056 行', hB && hB.dy, ROW.hp);
ok('敌方卡四裸数字都在', nB.every(Boolean), nB.map((x) => (x ? x.name : 'missing')).join(','));
eq('敌方「疲」取 foe.tire', nB[0] && nB[0].text, '疲 ' + Math.max(0, Math.round(gb.tire ?? 0)));
eq('敌方「士」取 foe.morale', nB[1] && nB[1].text, '士 ' + Math.max(0, Math.round(gb.morale ?? w.b.morale)));
eq('敌方「智」取 foe.int', nB[2] && nB[2].text, '智 ' + gb.int);
eq('敌方「武」取 foe.str', nB[3] && nB[3].text, '武 ' + gb.str);
near('敌方外侧列（疲/智）盒中心 517−38=479', nB[0] && nB[0].dx, CARD_B.x + CARD_B.w - 38);
near('敌方内侧列（士/武）盒中心 370+76/2=408', nB[1] && nB[1].dx, CARD_B.x + 4 + 76 / 2);
ok('敌方外侧列在内侧列右边（镜像 x 序反转）', nB[0] && nB[1] && nB[0].dx > nB[1].dx, (nB[0] && nB[0].dx) + ' > ' + (nB[1] && nB[1].dx));
ok('左卡「疲 vs 士」与右卡「疲 vs 士」的 x 序相反（整块镜像的判据）', nA[0].dx < nA[1].dx && nB[0].dx > nB[1].dx, 'A ' + nA[0].dx + '/' + nA[1].dx + '  B ' + nB[0].dx + '/' + nB[1].dx);
const nameB = L('CardNameB');
eq('敌方卡名字 = foe.name', nameB && nameB.text, gb.name);
ok('敌方卡状态字是「敵將 / 陣亡」', !!L('CardStateB') && ['敵將', '陣亡'].includes(L('CardStateB').text), L('CardStateB') && L('CardStateB').text);
ok('右卡整体在 750 宽设计区内', CARD_B.x + CARD_B.w <= 750, 'right=' + (CARD_B.x + CARD_B.w));

/* ------------------------------------------------------------------ */
/* 7. 招降面板 十欄                                                     */
/* ------------------------------------------------------------------ */
head('7 招降面板十欄（web surFields 同序，拿不到的灰「—」）');
const panel = dump.panel || {};
ok('面板类找到并打开成功', panel.ok === true, panel.ok ? 'class=' + JSON.stringify(panel.classNames) : JSON.stringify(panel));
const pdbg = panel.debug || {};
const fields = pdbg.fields || [];
eq('可见卡数 = 4（假 state 的 4 人）', fields.length, 4);
const f0 = fields[0] || '';
ok('十欄鍵名齐全且顺序与 web 一致', SUR_KEYS.every((k, i) => f0.split(' · ')[i] && f0.split(' · ')[i].startsWith(k + ' ')), f0);
ok('等级/士氣/疲勞/武器/物品/勝場/敗場 = 灰色「—」', ['等級', '士氣', '疲勞', '武器', '物品', '勝場數', '敗場數'].every((k) => f0.includes(k + ' —')), f0);
ok('武力/智力/忠誠 = 真值（91 / 78 / 44）', f0.includes('武力 91') && f0.includes('智力 78') && f0.includes('忠誠 44'), f0);
const pl = panel.labels || [];
const pName = new Map();
for (const l of pl) if (!pName.has(l.name)) pName.set(l.name, l);
const P = (n) => pName.get(n) || null;
ok('每卡 10 个欄位鍵 Label（SurFieldK0_0..9）', [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].every((k) => !!P('SurFieldK0_' + k)), '');
ok('每卡 10 个欄位值 Label（SurFieldV0_0..9）', [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].every((k) => !!P('SurFieldV0_' + k)), '');
ok('旧的单行 stat Label 已拆掉（没有 SurStat0）', !P('SurStat0'), P('SurStat0') ? '仍有 ' + P('SurStat0').text : '');
eq('欄位鍵文案逐格 = web SUR_FIELD_KEYS', [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => P('SurFieldK0_' + k).text), SUR_KEYS);
eq('欄位值：缺的欄位画「—」', [0, 1, 2, 6, 7, 8, 9].map((k) => P('SurFieldV0_' + k).text), ['—', '—', '—', '—', '—', '—', '—']);
eq('欄位值：有的欄位画数值', [3, 4, 5].map((k) => P('SurFieldV0_' + k).text), ['91', '78', '44']);
eqHex('欄位鍵颜色 = textDim', P('SurFieldK0_0').color, '#9AA3AE');
eqHex('缺值「—」颜色 = textFaint（灰）', P('SurFieldV0_0').color, '#65707C');
eqHex('真值颜色 = text（亮）', P('SurFieldV0_3').color, '#E9E4D8');
ok('两欄版式：第 0/1 格同一行，第 0 格在左欄', P('SurFieldK0_0').dy === P('SurFieldK0_1').dy && P('SurFieldK0_0').dx < P('SurFieldK0_1').dx, P('SurFieldK0_0').dx + ' vs ' + P('SurFieldK0_1').dx);
ok('5 行间距 = 16px（web grid 1fr 1fr 的等效）', P('SurFieldK0_2').dy - P('SurFieldK0_0').dy === FIELD.rowH, P('SurFieldK0_2').dy - P('SurFieldK0_0').dy);
near('第 0 行 y = cardY+27+8 = 275', P('SurFieldK0_0').dy, FIELD.cardY0 + FIELD.top + FIELD.rowH / 2);
near('左欄鍵盒中心 = 160+22', P('SurFieldK0_0').dx, FIELD.colX[0] + FIELD.keyW / 2);
near('右欄鍵盒中心 = 330+22', P('SurFieldK0_1').dx, FIELD.colX[1] + FIELD.keyW / 2);
ok('值跟在鍵右邊（同一格内）', P('SurFieldV0_0').dx > P('SurFieldK0_0').dx + 20, P('SurFieldK0_0').dx + ' → ' + P('SurFieldV0_0').dx);
ok('招降卡有 3 颗按钮（招/斬/釋）', ['0', '1', '2'].every((i) => !!P('SurBtn0_' + i)), ['0', '1', '2'].map((i) => P('SurBtn0_' + i) && P('SurBtn0_' + i).text).join('/'));
eq('按钮文案 = ACTION_TEXT（招 降 / 斬 首 / 釋 放）', ['0', '1', '2'].map((i) => P('SurBtn0_' + i).text), ['招 降', '斬 首', '釋 放']);
const hits = (panel.hits || []).map((x) => x.label);
ok('拒降卡（第 3 张）的「招降」不可点（命中表只剩斬首/釋放）', !hits.includes('card:2:recruit') && hits.includes('card:2:kill') && hits.includes('card:2:release'), hits.filter((l) => l.startsWith('card:2')).join(','));
ok('君主卡（第 4 张）出「逃 走」徽標、三颗按钮全隐藏', !!P('SurPick3') && P('SurPick3').text === '逃 走' && P('SurPick3').active === true && ['0', '1', '2'].every((i) => P('SurBtn3_' + i) && P('SurBtn3_' + i).active === false), (P('SurPick3') && P('SurPick3').text) + ' btn0.active=' + (P('SurBtn3_0') && P('SurBtn3_0').active));

/* ------------------------------------------------------------------ */
/* 打印实测 dump                                                        */
/* ------------------------------------------------------------------ */
/* ------------------------------------------------------------------ */
/* 8. 头像真肖像（R207：face/full 铺在金框下面，缺图才退回「將」）        */
/* ------------------------------------------------------------------ */
head('8 头像真肖像（cover 90×108 + 右下角 Lv 徽章）');
// 头像框几何与 web/Cocos 共用同一份：`game/src/view/layout.ts:126 PORTRAIT`
const PORTRAIT = { x: 18, y: 1012, w: 86, h: 108 };
const face = hud.face || null;
const glyphLab = L('PortraitGlyph');
const lvMid = L('PortraitLevel');
const badge = hud.badge || {};
const badgeLv = L('PortraitBadgeLv');
ok('dump 里找到 HudFace（页面里有这块节点）', !!face, JSON.stringify(face));
ok('HudFace 挂在 HudConsole 下、是 0 号子节点（先渲染 = 压在金框下面）', !!face && face.parentName === 'HudConsole' && face.index === 0, 'parent=' + (face && face.parentName) + ' index=' + (face && face.index));
ok('HudFace 已激活且拿到了 frame（真肖像，不是占位）', !!face && face.active === true && face.hasFrame === true, JSON.stringify(face));
eq('cover 后高 = 108（等比放大到盖满框高）', face && face.h, 108);
eq('cover 后宽 = 90（100×120 的 FACE 盖 86×108 的框）', face && face.w, 90);
near('脸的设计中心 x = 头像框中心 61（18 + 86/2，左右各溢 2px）', face && face.dx, PORTRAIT.x + PORTRAIT.w / 2);
near('脸的设计中心 y = 头像框中心 1066（1012 + 108/2）', face && face.dy, PORTRAIT.y + PORTRAIT.h / 2);
ok('有肖像时「將」占位隐藏', !!glyphLab && glyphLab.active === false, glyphLab ? 'active=' + glyphLab.active : 'missing');
ok('有肖像时居中 Lv 隐藏（让位给右下角徽章）', !!lvMid && lvMid.active === false, lvMid ? 'active=' + lvMid.active : 'missing');
ok('右下角 Lv 徽章出现（底板 + 字都在）', badge.plateActive === true && badge.lvActive === true, JSON.stringify(badge));
eq('徽章字 = Lv.<等级>', badgeLv && badgeLv.text, 'Lv.' + (ga && ga.level));
eq('徽章字 12px（web 徽章 12px）', badgeLv && badgeLv.size, 12);
near('徽章字 x = 徽章中心（84）', badgeLv && badgeLv.dx, PORTRAIT.x + PORTRAIT.w - 20);
near('徽章字 y = 徽章中心（1110）', badgeLv && badgeLv.dy, PORTRAIT.y + PORTRAIT.h - 10);

console.log('\n================ 实测 Label dump（HUD 卡 + 面板） ================');
console.log('HUD 卡（' + labels.length + ' 个 Label，按 y 再按 x 排）：');
const cardLabels = labels
  .filter((l) => /^(Card|General)/.test(l.name))
  .sort((a, b) => (a.dy - b.dy) || (a.dx - b.dx));
for (const l of cardLabels) {
  console.log(
    '  ' + l.name.padEnd(16) + ' "' + l.text + '"'.padEnd(20) +
    ' size=' + String(l.size).padStart(2) +
    ' x=' + String(l.dx).padStart(6) + ' y=' + String(l.dy).padStart(6) +
    ' box=' + l.w + 'x' + l.h + '  ' + l.color + (l.bold ? ' bold' : ''),
  );
}
console.log('\n条（4 条 8px + 1 条 3px 行动条）：');
for (const b of bars) console.log('  ' + (b.side + '/' + b.kind).padEnd(9) + ' ' + JSON.stringify(b.rect) + ' ' + b.color);
console.log('  action   ' + JSON.stringify(gauge));
console.log('\n招降面板（' + pl.length + ' 个 Label，前 26 个）：');
for (const l of pl.slice(0, 26)) {
  console.log('  ' + l.name.padEnd(15) + ' "' + l.text + '"'.padEnd(18) + ' size=' + String(l.size).padStart(2) + ' x=' + String(l.dx).padStart(6) + ' y=' + String(l.dy).padStart(6) + '  ' + l.color);
}
console.log('\n每卡十欄（surFieldCells 输出）：');
fields.forEach((f, i) => console.log('  #' + i + ' ' + f));

/* ------------------------------------------------------------------ */
/* 汇总                                                                 */
/* ------------------------------------------------------------------ */
console.log('\n' + '-'.repeat(72));
console.log('分组统计：');
let sum = 0;
for (const [name, tally] of perSection) {
  sum += tally.n;
  console.log('  ' + name.padEnd(18) + String(tally.n).padStart(3) + ' 条' + (tally.fail ? '  （失败 ' + tally.fail + '）' : ''));
}
console.log('断言总数 ' + total + ' · 通过 ' + (total - failures.length) + ' · 失败 ' + failures.length + (sum === total ? '（分组合计一致）' : '（分组合计 ' + sum + ' 不一致！）'));
if (failures.length) {
  console.log('\n失败明细：');
  for (const f of failures) console.log('  [' + f.section + '] ' + f.label + '  ' + f.detail);
  process.exit(1);
}
console.log('全部通过 ✔');
