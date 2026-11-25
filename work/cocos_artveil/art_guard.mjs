#!/usr/bin/env node
/**
 * art_guard.mjs —— Cocos 渲染层静态守卫（r89）
 *
 * 配套修复：`ArtLayer.addVeil()` 的「设计坐标 → 本地坐标」双倍位移 bug
 * （r88 报告 `project/118_Cocos版式对齐.md` §5；修法与对拍见 `work/cocos_artveil/veil_math.mjs`）。
 *
 * 三条规则（任务书 §二.3）：
 *   ① `bg/env` 彻底清账：scripts 源码里不出现 `bg/env`；bundle 里不存在该目录；
 *      31 档归档在 `game/cocos-park/res/bg/env`（可逆）。
 *   ② 不出现双倍偏移特征：`2*x + w/2 - 375` / `2*y + h/2 - 667` 及其反向写法；
 *      另做结构性检查：ArtLayer 里凡是调用 `placeNode()` 的函数体，
 *      不得再自己算 HALF_W/HALF_H/375/667（那就是第二次换算）。
 *   ③ `placeDesign` 系列锚点约定统一：placeNode 与 placeDesign 的 setPosition 公式逐字一致；
 *      addVeil 只在局部坐标画以原点为中心的矩形；所有调用点传的是设计坐标
 *      （不得预位移 HALF_W/HALF_H/375/667）；全仓设计基准只允许 750×1334。
 *
 * 失败一律打印 `文件:行号`，退出码 1；成功打印扫描文件数与断言数。
 *
 * 用法：node work\cocos_artveil\art_guard.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const HERE = import.meta.dirname;
const ROOT = path.resolve(HERE, '..', '..');
const SCRIPTS = path.join(ROOT, 'game', 'cocos', 'assets', 'scripts');
const BUNDLE_BG_ENV = path.join(ROOT, 'game', 'cocos', 'assets', 'bundles', 'res', 'bg', 'env');
const PARKED_BG_ENV = path.join(ROOT, 'game', 'cocos-park', 'res', 'bg', 'env');

const DESIGN_W = 750;
const DESIGN_H = 1334;
const PARKED_MIN_FILES = 31;
const PARKED_MIN_BYTES = 2716537;

/* ============================================================ 断言框架 */
let pass = 0;
const fails = [];
let group = '';
const groupStats = new Map();

function setGroup(name) {
  group = name;
  if (!groupStats.has(name)) groupStats.set(name, { pass: 0, fails: 0 });
}

/** @param {boolean} cond @param {string} label @param {string|null} loc `文件:行号` @param {string} [detail] */
function ok(cond, label, loc, detail) {
  const g = groupStats.get(group);
  if (cond) {
    pass += 1;
    g.pass += 1;
    return true;
  }
  g.fails += 1;
  fails.push({ group, label, loc: loc || '(全仓)', detail: detail ? String(detail).slice(0, 220) : '' });
  return false;
}

/* ============================================================ 文本工具 */
/** 把注释替换成等长空白（保留换行），返回与原文等长的字符串 ⇒ 下标可直接算行号。 */
function blankComments(src) {
  const out = src.split('');
  const n = src.length;
  let i = 0;
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '*') {
      let j = i + 2;
      while (j < n && !(src[j] === '*' && src[j + 1] === '/')) j += 1;
      const end = Math.min(j + 2, n);
      for (let k = i; k < end; k += 1) if (out[k] !== '\n') out[k] = ' ';
      i = end;
    } else if (c === '/' && src[i + 1] === '/') {
      // `https://` 这种协议头不算行注释
      let prev = i - 1;
      while (prev >= 0 && (src[prev] === ' ' || src[prev] === '\t')) prev -= 1;
      if (prev >= 0 && src[prev] === ':') {
        i += 2;
        continue;
      }
      let j = i;
      while (j < n && src[j] !== '\n') j += 1;
      for (let k = i; k < j; k += 1) out[k] = ' ';
      i = j;
    } else if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      while (j < n && src[j] !== c) {
        if (src[j] === '\\') j += 1;
        j += 1;
      }
      i = j + 1;
    } else {
      i += 1;
    }
  }
  return out.join('');
}

const squash = (s) => s.replace(/\s+/g, '');

/** 去掉空白但保留「压缩下标 → 原文下标」映射，供失败时定位行号。 */
function squashWithMap(code) {
  let s = '';
  const map = [];
  for (let i = 0; i < code.length; i += 1) {
    const c = code[i];
    if (c !== ' ' && c !== '\t' && c !== '\n' && c !== '\r') {
      s += c;
      map.push(i);
    }
  }
  return { s, map };
}

/** 行号（1 基）。code 与 src 等长，所以直接用 code 的坐标。 */
function lineOf(code, idx) {
  let line = 1;
  for (let i = 0; i < idx && i < code.length; i += 1) if (code[i] === '\n') line += 1;
  return line;
}

/** 从参数表左括号开始配平，返回函数/方法体源码（跳过 TS 返回类型注解那个 `{...}` 块）。 */
function bodyAfterParen(src, parenAt) {
  let depth = 0;
  let afterParams = -1;
  for (let j = parenAt; j < src.length; j += 1) {
    if (src[j] === '(') depth += 1;
    else if (src[j] === ')') {
      depth -= 1;
      if (depth === 0) {
        afterParams = j + 1;
        break;
      }
    }
  }
  if (afterParams < 0) return null;
  const block = (from) => {
    const i = src.indexOf('{', from);
    if (i < 0) return null;
    let d = 0;
    for (let j = i; j < src.length; j += 1) {
      if (src[j] === '{') d += 1;
      else if (src[j] === '}') {
        d -= 1;
        if (d === 0) return { start: i, end: j };
      }
    }
    return null;
  };
  const first = block(afterParams);
  if (!first) return null;
  let k = first.end + 1;
  while (k < src.length && /\s/.test(src[k])) k += 1;
  if (src[k] === '{') {
    const body = block(k);
    return body ? src.slice(body.start + 1, body.end) : null;
  }
  return src.slice(first.start + 1, first.end);
}

/** 取 `函数头正则` 匹配到的函数体。 */
function bodyOf(src, headRe) {
  const re = new RegExp(headRe.source, headRe.flags.includes('g') ? headRe.flags : `${headRe.flags}g`);
  const m = re.exec(src);
  if (!m) return null;
  const parenAt = src.indexOf('(', m.index + m[0].length - 1);
  if (parenAt < 0) return null;
  return bodyAfterParen(src, parenAt);
}

/** 解析一段实参列表：`(a, {x:1,y:2}, f(1,2), 'x,y')` → 顶层逗号切分。 */
function splitArgs(argText) {
  const args = [];
  let depth = 0;
  let quote = '';
  let cur = '';
  for (let i = 0; i < argText.length; i += 1) {
    const c = argText[i];
    if (quote) {
      cur += c;
      if (c === '\\') {
        cur += argText[i + 1] ?? '';
        i += 1;
      } else if (c === quote) quote = '';
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      quote = c;
      cur += c;
      continue;
    }
    if (c === '(' || c === '[' || c === '{') depth += 1;
    else if (c === ')' || c === ']' || c === '}') depth -= 1;
    if (c === ',' && depth === 0) {
      args.push(cur.trim());
      cur = '';
      continue;
    }
    cur += c;
  }
  if (cur.trim() || args.length) args.push(cur.trim());
  return args;
}

/** 从 `(` 出发取到配平 `)` 的实参文本，返回 { args, end }。 */
function argsAt(code, parenAt) {
  let depth = 0;
  for (let j = parenAt; j < code.length; j += 1) {
    if (code[j] === '(') depth += 1;
    else if (code[j] === ')') {
      depth -= 1;
      if (depth === 0) return { args: splitArgs(code.slice(parenAt + 1, j)), end: j };
    }
  }
  return { args: [], end: -1 };
}

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.isFile() && e.name.endsWith('.ts')) out.push(p);
  }
  return out;
}

/* ============================================================ 读入全部脚本 */
const files = walk(SCRIPTS).map((file) => {
  const src = fs.readFileSync(file, 'utf8');
  const code = blankComments(src);
  const rel = path.relative(ROOT, file);
  return {
    file,
    rel,
    src,
    code,
    loc: (idx) => `${rel}:${lineOf(code, idx)}`,
  };
});
const totalBytes = files.reduce((sum, f) => sum + Buffer.byteLength(f.src, 'utf8'), 0);
const byName = new Map(files.map((f) => [path.basename(f.file), f]));

/* ============================================================ ① bg/env 清账 */
setGroup('① bg/env 清账');

ok(!fs.existsSync(BUNDLE_BG_ENV), '① assets/bundles/res/bg/env 不存在（31 档从未进包）', 'game\\cocos\\assets\\bundles\\res\\bg\\env');

const parkedAll = fs.existsSync(PARKED_BG_ENV)
  ? fs
      .readdirSync(PARKED_BG_ENV, { withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => {
        const p = path.join(PARKED_BG_ENV, e.name);
        return { name: e.name, size: fs.statSync(p).size };
      })
  : [];
const parkedRes = parkedAll.filter((f) => !f.name.endsWith('.meta'));
const parkedMeta = parkedAll.filter((f) => f.name.endsWith('.meta'));
const parkedBytes = parkedRes.reduce((sum, f) => sum + f.size, 0);
const parkedMetaBytes = parkedMeta.reduce((sum, f) => sum + f.size, 0);
const parkedExt = new Map();
for (const f of parkedRes) {
  const ext = path.extname(f.name).toLowerCase();
  const cur = parkedExt.get(ext) || { n: 0, bytes: 0 };
  parkedExt.set(ext, { n: cur.n + 1, bytes: cur.bytes + f.size });
}

ok(fs.existsSync(PARKED_BG_ENV), '① 归档目录 game/cocos-park/res/bg/env 存在（移动可逆）', 'game\\cocos-park\\res\\bg\\env');
ok(
  parkedRes.length >= PARKED_MIN_FILES,
  `① 归档资源 ≥ ${PARKED_MIN_FILES} 档（实际 ${parkedRes.length} 档）`,
  'game\\cocos-park\\res\\bg\\env',
);
ok(
  parkedBytes >= PARKED_MIN_BYTES,
  `① 归档字节 ≥ ${PARKED_MIN_BYTES.toLocaleString('en-US')} B（实际 ${parkedBytes.toLocaleString('en-US')} B）`,
  'game\\cocos-park\\res\\bg\\env',
);
ok(
  [...parkedExt.keys()].every((ext) => ext === '.jpg' || ext === '.png'),
  `① 归档只含 jpg/png（实际 ${[...parkedExt.entries()].map(([e, v]) => `${e}×${v.n}`).join(' + ')}）`,
  'game\\cocos-park\\res\\bg\\env',
);
ok(
  parkedMeta.length >= parkedRes.length,
  `① 归档 .meta 齐全（资源 ${parkedRes.length} / meta ${parkedMeta.length}）`,
  'game\\cocos-park\\res\\bg\\env',
);

let bgEnvCommentHits = [];
for (const f of files) {
  const hits = [];
  for (let i = f.code.indexOf('bg/env'); i >= 0; i = f.code.indexOf('bg/env', i + 1)) hits.push(i);
  ok(hits.length === 0, `① ${f.rel} 源码（去注释后）无 'bg/env' 引用`, hits.length ? f.loc(hits[0]) : null, hits.length ? `命中 ${hits.length} 处，首处 ${f.code.slice(hits[0] - 30, hits[0] + 30)}` : '');
  for (let i = f.src.indexOf('bg/env'); i >= 0; i = f.src.indexOf('bg/env', i + 1)) bgEnvCommentHits.push(f.loc(i));
}

const cityModel = byName.get('CityModel.ts');
ok(!!cityModel, '① CityModel.ts 存在', 'game\\cocos\\assets\\scripts\\CityModel.ts');
if (cityModel) {
  const pathIdx = cityModel.code.indexOf('assets/bg/policy/palais_0');
  ok(pathIdx >= 0, '① CityModel.hallImageOf() 指向 bg/policy/palais_0N', pathIdx >= 0 ? cityModel.loc(pathIdx) : 'game\\cocos\\assets\\scripts\\CityModel.ts');
  const hallIdx = cityModel.code.indexOf('hall_0');
  ok(hallIdx < 0, '① CityModel 源码不再拼 hall_0N 路径（注释里的历史说明不算）', hallIdx >= 0 ? cityModel.loc(hallIdx) : null);
  const clampIdx = squash(cityModel.code).indexOf('Math.max(1,Math.min(5,hallIndexOf(');
  ok(clampIdx >= 0, '① hallImageOf 把 6 档 clamp 回 1..5（POLICY 只有 5 张）', clampIdx >= 0 ? null : 'game\\cocos\\assets\\scripts\\CityModel.ts');
}

/* ============================================================ ② 双倍偏移特征 */
setGroup('② 无双倍偏移特征');

// 「设计坐标 → 本地坐标」算两次的闭合特征：2x + w/2 − 375（y 同理）。反向写法 375 − 2x 一并拦。
const DOUBLE_SHIFT = [
  { name: 'x 方向 2*x + w/2 − 375', re: /2\*[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\+[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\/2-375\b/ },
  { name: 'x 方向 2*x + w/2 − HALF_W', re: /2\*[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\+[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\/2-HALF_W\b/ },
  { name: 'y 方向 2*y + h/2 − 667', re: /2\*[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\+[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\/2-667\b/ },
  { name: 'y 方向 2*y + h/2 − HALF_H', re: /2\*[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\+[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\/2-HALF_H\b/ },
  { name: '反向 375 − 2*x', re: /(?:^|[^\w$.])375-2\*/ },
  { name: '反向 HALF_W − 2*x', re: /HALF_W-2\*/ },
  { name: '反向 667 − 2*y', re: /(?:^|[^\w$.])667-2\*/ },
  { name: '反向 HALF_H − 2*y', re: /HALF_H-2\*/ },
];

for (const f of files) {
  const { s, map } = squashWithMap(f.code);
  for (const p of DOUBLE_SHIFT) {
    const m = p.re.exec(s);
    ok(
      !m,
      `② ${f.rel} 无「${p.name}」`,
      m ? f.loc(map[m.index]) : null,
      m ? `命中 …${s.slice(Math.max(0, m.index - 20), m.index + 60)}…` : '',
    );
  }
}

// 结构性检查：ArtLayer 里凡是调用 placeNode()（已经做过一次换算）的函数，
// 体内不得再出现 HALF_W/HALF_H/375/667 —— 老 addVeil 正是这样把位移做了第二次。
const artLayer = byName.get('ArtLayer.ts');
let addVeilBody = null;
ok(!!artLayer, '② ArtLayer.ts 存在', 'game\\cocos\\assets\\scripts\\ArtLayer.ts');
if (artLayer) {
  const FN_HEAD = /(?:\bfunction\s+([A-Za-z_$][\w$]*)|(\bconstructor))\s*\(/g;
  let m;
  let fnIndex = 0;
  while ((m = FN_HEAD.exec(artLayer.code))) {
    fnIndex += 1;
    const name = m[1] || `constructor#${fnIndex}`;
    const parenAt = artLayer.code.indexOf('(', m.index + m[0].length - 1);
    const body = bodyAfterParen(artLayer.code, parenAt);
    if (!body) continue;
    const sb = squash(body);
    const label = name === 'placeNode' ? 'placeNode()' : name.startsWith('constructor') ? `${name}（${artLayer.loc(m.index)}）` : `${name}()`;
    if (name === 'placeNode') {
      ok(
        sb.includes('transform.setAnchorPoint(0.5,0.5);') && sb.includes('node.setPosition(r.x+r.w/2-HALF_W,HALF_H-(r.y+r.h/2),0);'),
        '② placeNode() 是唯一一次换算：锚点 (0.5,0.5) + setPosition(x+w/2−HALF_W, HALF_H−(y+h/2))',
        artLayer.loc(m.index),
        sb,
      );
      continue;
    }
    if (!sb.includes('placeNode(')) continue;
    const bad = /HALF_W|HALF_H|\b375\b|\b667\b/.exec(sb);
    ok(
      !bad,
      `② ${label} 调用 placeNode() 后不再自算 HALF_W/HALF_H（无第二次位移）`,
      bad ? artLayer.loc(m.index + body.indexOf(bad[0])) : null,
      bad ? `体内出现 ${bad[0]}` : '',
    );
  }

  /** 老的 `g.rect(rect.x - HALF_W, HALF_H - rect.y - rect.h, …)` 写法在 addVeil 里绝迹。 */
  addVeilBody = bodyOf(artLayer.code, /export\s+function\s+addVeil\s*\(/);
  ok(!!addVeilBody, '② ArtLayer.addVeil() 存在', 'game\\cocos\\assets\\scripts\\ArtLayer.ts');
  if (addVeilBody) {
    const sa = squash(addVeilBody);
    ok(!/rect\.[xy]-HALF_[WH]|HALF_[WH]-rect\.[xy]/.test(sa), '② addVeil() 体内无 rect.x−HALF_W / HALF_H−rect.y 老写法', 'game\\cocos\\assets\\scripts\\ArtLayer.ts', sa);
    ok(!/g\.rect\(rect\.|g\.roundRect\(rect\./.test(sa), '② addVeil() 画图用局部坐标 local.*，不直接吃设计坐标 rect.*', 'game\\cocos\\assets\\scripts\\ArtLayer.ts', sa);
  }
}

/* ============================================================ ③ 锚点约定统一 */
setGroup('③ placeDesign 系列锚点约定');

const EXPECTED_SET_POSITION = 'x+w/2-HALF_W,HALF_H-(y+h/2),0';
/** `node.setPosition(...)` 的实参（压缩后），恰好一处；返回 null 表示不是一处。 */
function setPositionArgs(body) {
  if (!body) return null;
  const s = squash(body);
  const n = s.split('node.setPosition(').length - 1;
  if (n !== 1) return { count: n, args: null };
  const at = s.indexOf('node.setPosition(');
  const parsed = argsAt(s, at + 'node.setPosition'.length);
  return { count: 1, args: parsed.args.map(squash).join(',') };
}

const placeNodeBody = artLayer ? bodyOf(artLayer.code, /function\s+placeNode\s*\(/) : null;
const pn = setPositionArgs(placeNodeBody);
ok(!!placeNodeBody && pn && pn.count === 1, '③ placeNode() 体内恰好一处 node.setPosition', 'game\\cocos\\assets\\scripts\\ArtLayer.ts', pn ? `setPosition 出现 ${pn.count} 次` : '');
if (pn && pn.args) {
  const normalized = pn.args.replace(/\br\./g, '');
  ok(
    normalized === EXPECTED_SET_POSITION,
    `③ placeNode() 摆位公式 = (${EXPECTED_SET_POSITION})`,
    'game\\cocos\\assets\\scripts\\ArtLayer.ts',
    normalized,
  );
}

const uiSkin = byName.get('UiSkin.ts');
const placeDesignBody = uiSkin ? bodyOf(uiSkin.code, /export\s+function\s+placeDesign\s*\(/) : null;
const pd = setPositionArgs(placeDesignBody);
ok(!!placeDesignBody && pd && pd.count === 1, '③ UiSkin.placeDesign() 体内恰好一处 node.setPosition', 'game\\cocos\\assets\\scripts\\UiSkin.ts', pd ? `setPosition 出现 ${pd.count} 次` : '');
if (pd && pd.args) {
  ok(
    pd.args === EXPECTED_SET_POSITION,
    `③ placeDesign() 与 placeNode() 的摆位公式逐字一致（去掉 r. 前缀后同串）`,
    'game\\cocos\\assets\\scripts\\UiSkin.ts',
    pd.args,
  );
}

// addVeil 只画「以节点原点为中心」的局部矩形：local = { -w/2, -h/2, w, h }。
if (addVeilBody) {
  const sa = squash(addVeilBody);
  ok(sa.includes('constlocal=veilLocalRect(rect);'), '③ addVeil() 用 veilLocalRect(rect) 取局部矩形', 'game\\cocos\\assets\\scripts\\ArtLayer.ts', sa);
  ok(
    sa.includes('g.roundRect(local.x,local.y,local.w,local.h,radius);') && sa.includes('g.rect(local.x,local.y,local.w,local.h);'),
    '③ addVeil() 两种画法（roundRect / rect）都吃 local.*',
    'game\\cocos\\assets\\scripts\\ArtLayer.ts',
    sa,
  );
}
const veilLocal = artLayer ? bodyOf(artLayer.code, /export\s+function\s+veilLocalRect\s*\(/) : null;
ok(!!veilLocal, '③ ArtLayer.veilLocalRect() 存在（bug 根治点）', 'game\\cocos\\assets\\scripts\\ArtLayer.ts');
if (veilLocal) {
  ok(
    squash(veilLocal).includes('return{x:-rect.w/2,y:-rect.h/2,w:rect.w,h:rect.h};'),
    '③ veilLocalRect() = { −w/2, −h/2, w, h }（锚点在矩形中心）',
    'game\\cocos\\assets\\scripts\\ArtLayer.ts',
    squash(veilLocal),
  );
}

// 调用点必须传设计坐标：addVeil / new ArtBg / new ArtSprite / placeDesign 的实参里
// 不得预先出现 HALF_W/HALF_H/375/667（那意味着调用端在替 bug 做 workaround）。
const CALL_SITES = [
  { name: 'addVeil', re: /\baddVeil\s*\(/g, min: 4, max: 5 },
  { name: 'new ArtBg', re: /\bnew\s+ArtBg\s*\(/g, min: 3, max: 4 },
  { name: 'new ArtSprite', re: /\bnew\s+ArtSprite\s*\(/g, min: 3, max: 4 },
  { name: 'placeDesign', re: /\bplaceDesign\s*\(/g, min: 5, max: 5 },
];

let callSiteCount = 0;
for (const f of files) {
  for (const site of CALL_SITES) {
    const re = new RegExp(site.re.source, 'g');
    let m;
    while ((m = re.exec(f.code))) {
      const before = f.code.slice(Math.max(0, m.index - 24), m.index);
      if (/\bfunction\s+$/.test(before)) continue; // 定义处，不是调用点
      const parenAt = f.code.indexOf('(', m.index + m[0].length - 1);
      const { args } = argsAt(f.code, parenAt);
      callSiteCount += 1;
      const argText = args.join(',');
      const loc = f.loc(m.index);
      ok(
        args.length >= site.min && args.length <= site.max,
        `③ ${f.rel} 的 ${site.name} 调用实参数 ${site.min}–${site.max}（实际 ${args.length}）`,
        loc,
        args.join(' | '),
      );
      const bad = /HALF_W|HALF_H|\b375\b|\b667\b/.exec(argText);
      ok(
        !bad,
        `③ ${f.rel} 的 ${site.name} 调用传设计坐标（实参无 HALF_W/HALF_H/375/667 预位移）`,
        bad ? loc : null,
        bad ? `实参出现 ${bad[0]}：${argText.slice(0, 120)}` : '',
      );
    }
  }
}

// CampaignRoot 的地图蒙版必须直传（r89 兼容语义，反解常量已删）。
const campaign = byName.get('CampaignRoot.ts');
ok(!!campaign, '③ CampaignRoot.ts 存在', 'game\\cocos\\assets\\scripts\\CampaignRoot.ts');
const veilOnMapBody = campaign ? bodyOf(campaign.code, /private\s+veilRectOnMap\s*\(/) : null;
ok(!!veilOnMapBody, '③ CampaignRoot.veilRectOnMap() 存在', 'game\\cocos\\assets\\scripts\\CampaignRoot.ts');
if (veilOnMapBody) {
  const sv = squash(veilOnMapBody);
  ok(sv.includes('return{x:target.x,y:target.y,w:target.w,h:target.h};'), '③ veilRectOnMap() 按地图矩形直传（不再反解）', 'game\\cocos\\assets\\scripts\\CampaignRoot.ts', sv);
  ok(!sv.includes('/2'), '③ veilRectOnMap() 体内无 /2 反解', 'game\\cocos\\assets\\scripts\\CampaignRoot.ts', sv);
  ok(!/HALF_W|HALF_H/.test(sv), '③ veilRectOnMap() 不再引用 HALF_W/HALF_H', 'game\\cocos\\assets\\scripts\\CampaignRoot.ts', sv);
}
if (campaign) {
  const callIdx = campaign.code.indexOf("addVeil(this.node, 'CampaignVeil', this.veilRectOnMap(rect)");
  ok(callIdx >= 0, '③ CampaignVeil 用 veilRectOnMap(rect) 直传地图矩形', callIdx >= 0 ? null : 'game\\cocos\\assets\\scripts\\CampaignRoot.ts');
}

// 设计基准全仓唯一：750×1334，HALF = 375/667（或 DESIGN/2）。
const DESIGN_DECL = /(?:export\s+)?const\s+(DESIGN_W|DESIGN_H|HALF_W|HALF_H)\s*=\s*([^;\n]+);/g;
const EXPECT_DECL = {
  DESIGN_W: ['750'],
  DESIGN_H: ['1334'],
  HALF_W: ['375', 'DESIGN_W/2'],
  HALF_H: ['667', 'DESIGN_H/2'],
};
let declCount = 0;
for (const f of files) {
  const re = new RegExp(DESIGN_DECL.source, 'g');
  let m;
  while ((m = re.exec(f.code))) {
    declCount += 1;
    const name = m[1];
    const value = squash(m[2]);
    ok(
      EXPECT_DECL[name].includes(value),
      `③ ${f.rel} 的 ${name} = ${EXPECT_DECL[name].join(' 或 ')}（实际 ${value}）`,
      f.loc(m.index),
      value,
    );
  }
}
ok(declCount > 0, '③ 全仓设计基准声明被扫到（≥1 处）', null, `共 ${declCount} 处`);

/* ============================================================ ④ 守卫自检 */
// 守卫不能只对着「已经修好的代码」通关：拿修前备份做回归，证明它真的会红。
setGroup('④ 守卫自检（对修前备份做回归）');

const legacyPath = path.join(HERE, 'backup', 'ArtLayer.ts.orig');
ok(fs.existsSync(legacyPath), '④ 修前备份 work/cocos_artveil/backup/ArtLayer.ts.orig 存在', 'work\\cocos_artveil\\backup\\ArtLayer.ts.orig');
if (fs.existsSync(legacyPath)) {
  const legacySrc = fs.readFileSync(legacyPath, 'utf8');
  const legacyCode = blankComments(legacySrc);
  const legacyBody = bodyOf(legacyCode, /export\s+function\s+addVeil\s*\(/);
  const sl = legacyBody ? squash(legacyBody) : '';
  ok(!!legacyBody, '④ 修前备份里能取到 addVeil() 函数体', 'work\\cocos_artveil\\backup\\ArtLayer.ts.orig');
  ok(sl.includes('rect.x-HALF_W') && sl.includes('HALF_H-rect.y-rect.h'), '④ 守卫能识别修前 addVeil 的 rect.x−HALF_W / HALF_H−rect.y 写法（会红）', 'work\\cocos_artveil\\backup\\ArtLayer.ts.orig', sl.slice(0, 160));
  ok(
    /HALF_W|HALF_H|\b375\b|\b667\b/.test(sl),
    '④ ②的结构性规则（调用 placeNode 后不得自算 HALF_*）本可拦住修前代码',
    'work\\cocos_artveil\\backup\\ArtLayer.ts.orig',
  );
  ok(!sl.includes('veilLocalRect('), '④ 修前 addVeil 没有 veilLocalRect()（修复点唯一）', 'work\\cocos_artveil\\backup\\ArtLayer.ts.orig');
  ok(
    !/constlocal=veilLocalRect\(rect\)/.test(sl),
    '④ 修前 addVeil 不满足 ③ 的「用 veilLocalRect(rect) 取局部矩形」断言',
    'work\\cocos_artveil\\backup\\ArtLayer.ts.orig',
  );
}

// 注释剥离器：必须等长（行号靠它）、必须剥掉注释里的 bg/env、必须保留字符串里的 bg/env。
if (artLayer) {
  const blanked = blankComments(artLayer.src);
  ok(blanked.length === artLayer.src.length, '④ blankComments 输出与原文等长（行号可直接映射）', 'game\\cocos\\assets\\scripts\\ArtLayer.ts');
  const probe = blankComments("// bg/env 注释\nconst p = 'bg/env/x';\n");
  ok(probe.split('bg/env').length - 1 === 1, '④ blankComments 剥注释、留字符串字面量', null, JSON.stringify(probe));
}

// 双倍偏移检测器冒烟：修前闭合式命中，修后局部矩形写法不命中。
const detectDoubleShift = (s) => DOUBLE_SHIFT.findIndex((p) => p.re.test(s));
ok(detectDoubleShift('2*rect.x+rect.w/2-375') === 0, '④ 检测器命中 2*x + w/2 − 375（x 方向）', null);
ok(detectDoubleShift('2*rect.y+rect.h/2-667') === 2, '④ 检测器命中 2*y + h/2 − 667（y 方向）', null);
ok(detectDoubleShift('2*rect.x+rect.w/2-HALF_W') === 1, '④ 检测器命中 2*x + w/2 − HALF_W', null);
ok(detectDoubleShift('375-2*x') === 4, '④ 检测器命中反向 375 − 2*x', null);
ok(detectDoubleShift('HALF_H-2*y') === 7, '④ 检测器命中反向 HALF_H − 2*y', null);
ok(detectDoubleShift('g.rect(local.x,local.y,local.w,local.h)') === -1, '④ 检测器不误报修后的局部矩形写法', null);
ok(detectDoubleShift('constHALF_W=375;constHALF_H=667;') === -1, '④ 检测器不误报 HALF_W/HALF_H 常量声明', null);
ok(detectDoubleShift('g.circle(p.x-HALF_W,HALF_H-p.y,radius)') === -1, '④ 检测器不误报全屏 Graphics 的正确写法 p.x−HALF_W', null);
ok(lineOf('a\nb\nc', 4) === 3, '④ lineOf 行号映射正确（0 基下标 → 1 基行号）', null);

/* ============================================================ 输出 */
const line = '─'.repeat(78);
console.log('art_guard —— Cocos 渲染层静态守卫（r89）');
console.log(`根目录 ${ROOT}`);
console.log(`扫描 ${path.relative(ROOT, SCRIPTS)} 下的 *.ts：${files.length} 个文件，${totalBytes.toLocaleString('en-US')} B`);
console.log(line);
console.log('① bg/env 清账');
console.log(`  bundle 内 bg/env            ${fs.existsSync(BUNDLE_BG_ENV) ? '仍存在 ✗' : '已不存在 ✓'}`);
console.log(
  `  cocos-park 归档             ${parkedRes.length} 档 / ${parkedBytes.toLocaleString('en-US')} B` +
    `（${[...parkedExt.entries()].map(([e, v]) => `${e.slice(1)} ${v.n} 档 ${v.bytes.toLocaleString('en-US')} B`).join(' + ')}）` +
    ` + ${parkedMeta.length} 个 .meta ${parkedMetaBytes.toLocaleString('en-US')} B = ${parkedAll.length} 条目 ${(parkedBytes + parkedMetaBytes).toLocaleString('en-US')} B`,
);
console.log(`  源码注释残留 'bg/env'       ${bgEnvCommentHits.length} 处（已剥注释后判 0 命中${bgEnvCommentHits.length ? '：' + bgEnvCommentHits.join('、') : ''}）`);
console.log(line);
console.log('② 无双倍偏移特征');
console.log(`  闭合特征 ${DOUBLE_SHIFT.length} 条 × ${files.length} 文件 = ${DOUBLE_SHIFT.length * files.length} 断言（期望 0 命中）`);
console.log(`  结构性检查：ArtLayer 里调用 placeNode() 的函数体内不得再出现 HALF_W/HALF_H/375/667`);
console.log(line);
console.log('③ placeDesign 系列锚点约定');
console.log(`  placeNode / placeDesign 公式  setPosition(${EXPECTED_SET_POSITION})`);
console.log(`  调用点（addVeil / ArtBg / ArtSprite / placeDesign） ${callSiteCount} 处，全部传设计坐标`);
console.log(`  设计基准声明 ${declCount} 处，全部 750×1334 / 375 / 667`);
console.log(line);

if (fails.length) {
  console.error(`FAIL ${fails.length} 条：`);
  for (const f of fails) {
    console.error(`  ✗ [${f.group}] ${f.label}`);
    console.error(`      @ ${f.loc}${f.detail ? `\n      ${f.detail}` : ''}`);
  }
  console.error(`\n断言 ${pass} 通过 / ${fails.length} 失败（共 ${pass + fails.length}）；扫描 ${files.length} 文件`);
  process.exit(1);
}

console.log(`OK 断言 ${pass} 条全过（0 失败）；扫描 ${files.length} 个文件 / ${totalBytes.toLocaleString('en-US')} B`);
for (const [name, st] of groupStats) console.log(`  ${name}  ${st.pass} 条`);
