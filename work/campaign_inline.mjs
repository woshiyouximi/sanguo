
const KEY = 'sanguo_campaign_v1';
const stage = document.getElementById('stage');
const $ = (id) => document.getElementById(id);
function fit() {
  const s = Math.min(window.innerWidth / 750, window.innerHeight / 1334);
  stage.style.transform = `scale(${s})`;
  document.body.style.width = 750 * s + 'px';
  document.body.style.height = 1334 * s + 'px';
  resizeCanvas();
}
window.addEventListener('resize', fit);

const qs = new URLSearchParams(location.search);
// ?seed=N：把 Math.random 换成可复现的 mulberry32（只用于调试/截图，正式流程仍用 Math.random）
const seedParam = Number.parseInt(qs.get('seed') ?? '', 10);
if (Number.isFinite(seedParam) && seedParam > 0) {
  let s = seedParam >>> 0;
  Math.random = () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const data = await (await fetch('../data/scenarios.json')).json();
const scenario = data[0];
const ALL = scenario.cities || [];
const cities = ALL;   // 全部 60 城都进列表与地图
const generals = await (await fetch('../data/generals.json')).json();

let save;
try { save = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { save = {}; }
save.owned = save.owned || [];
save.cities = save.cities || {};
save.month = save.month || 1;
save.gold = save.gold || 1200;
save.wins = save.wins || 0;
save.losses = save.losses || 0;
save.defWins = save.defWins || 0;   // 守城成功次数（v6）
save.log = save.log || [];          // AI 出兵/守城战报，最近 8 条（v6）

if (!save.seeded) {
  for (const c of cities.slice(0, 3)) if (!save.owned.includes(c.NAME)) save.owned.push(c.NAME);
  save.seeded = true;
  persist();
}
function persist() { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch {} }

// 每城运行时状态（兵/民/金），首次见到用剧本数据初始化
for (const c of ALL) {
  if (!save.cities[c.NAME]) {
    save.cities[c.NAME] = {
      troops: Math.min(Math.floor((c.POPULATION || 0) / 2500) + 110, 600),
      pop: c.POPULATION || 0,
      money: c.MONEY || 0,
    };
  }
}
persist();

const mine = (n) => save.owned.includes(n);

// 道路图：只收非哨兵路径（Length < 30000），这是原作"可走"的那 77 条
const adj = new Map();
for (const c of ALL) adj.set(c.NAME, new Set());
for (const p of scenario.paths || []) {
  if ((p.Length || 0) >= 30000) continue;
  if (!adj.has(p.Start) || !adj.has(p.End)) continue;
  adj.get(p.Start).add(p.End);
  adj.get(p.End).add(p.Start);
}
// 从"我方任一城"出发的最少道路数
function distFromOwned(target) {
  const seen = new Set(save.owned);
  let frontier = save.owned.slice();
  let d = 0;
  while (frontier.length && d < 30) {
    if (frontier.includes(target)) return d;
    const next = [];
    for (const n of frontier) {
      for (const m of adj.get(n) || []) if (!seen.has(m)) { seen.add(m); next.push(m); }
    }
    frontier = next; d++;
  }
  return 99;
}
let selected = qs.get('sel') && ALL.some((c) => c.NAME === qs.get('sel')) ? qs.get('sel') : null;

function commander() {
  const pool = generals.filter((g) => g.NAME !== '盜賊' && mine(g.CITY));
  if (!pool.length) return null;
  return pool.sort((a, b) => (b.STR + b.INT) - (a.STR + a.INT))[0];
}

// ---------------------------------------------------------------- 地图绘制
const MAP = { x0: 88, x1: 1138, y0: 84, y1: 860 };  // 剧本坐标范围
let view = { w: 750, h: 900, pad: 40 };
function resizeCanvas() {
  const cv = $('map');
  const box = $('mapwrap');
  if (!box || box.style.display === 'none') return;
  const w = box.clientWidth || 750, h = box.clientHeight || 900;
  cv.width = w; cv.height = h;
  view.w = w; view.h = h;
  drawMap();
}
function toScreen(x, y) {
  const sx = view.w / (MAP.x1 - MAP.x0), sy = view.h / (MAP.y1 - MAP.y0);
  const s = Math.min(sx, sy) * 0.92;
  const ox = (view.w - (MAP.x1 - MAP.x0) * s) / 2;
  const oy = (view.h - (MAP.y1 - MAP.y0) * s) / 2;
  return [ox + (x - MAP.x0) * s, oy + (y - MAP.y0) * s];
}
function drawMap() {
  const cv = $('map'); if (!cv) return;
  const g = cv.getContext('2d');
  if (!g) return;
  g.clearRect(0, 0, cv.width, cv.height);
  // 底纹
  const grd = g.createLinearGradient(0, 0, 0, cv.height);
  grd.addColorStop(0, '#11161D'); grd.addColorStop(1, '#0B0E12');
  g.fillStyle = grd; g.fillRect(0, 0, cv.width, cv.height);

  const byName = new Map(ALL.map((c) => [c.NAME, c]));
  // 路径：Length>=30000 是"画了线但不可走"的哨兵，画淡一点
  g.lineWidth = 2;
  for (const p of scenario.paths || []) {
    const a = byName.get(p.Start), b = byName.get(p.End);
    if (!a || !b) continue;
    const sentinel = (p.Length || 0) >= 30000;
    g.strokeStyle = sentinel ? 'rgba(120,130,145,.16)' : 'rgba(216,179,106,.24)';
    g.beginPath();
    const pts = (p.points && p.points.length) ? p.points : [a.pos_xy, b.pos_xy];
    pts.forEach(([x, y], i) => {
      const [sx, sy] = toScreen(x, y);
      if (i === 0) g.moveTo(sx, sy); else g.lineTo(sx, sy);
    });
    g.stroke();
  }
  // 城
  let li = 0;
  for (const c of ALL) {
    const [sx, sy] = toScreen(c.pos_xy[0], c.pos_xy[1]);
    li++;
    const own = mine(c.NAME);
    const sel = selected === c.NAME;
    const r = sel ? 15 : 11;
    g.beginPath(); g.arc(sx, sy, r + 3, 0, Math.PI * 2);
    g.fillStyle = own ? 'rgba(79,126,108,.35)' : 'rgba(184,69,47,.22)';
    g.fill();
    g.beginPath(); g.arc(sx, sy, r, 0, Math.PI * 2);
    g.fillStyle = own ? '#5E9C85' : '#8E5A4E';
    g.fill();
    if (sel) { g.lineWidth = 3; g.strokeStyle = '#F3E0B4'; g.stroke(); }
    g.fillStyle = 'rgba(233,228,214,.92)';
    g.font = '600 17px "Noto Sans SC",sans-serif';
    g.textAlign = 'center';
    // 标签一上一下错开，缓解中原一带的拥挤
    g.fillText(c.NAME, sx, li % 2 ? sy - r - 8 : sy + r + 19);
  }
  // 图例
  g.textAlign = 'left'; g.font = '15px "Noto Sans SC",sans-serif';
  g.fillStyle = 'rgba(233,228,214,.55)';
  g.fillText('● 我方', 16, cv.height - 34);
  g.fillStyle = 'rgba(184,69,47,.85)'; g.fillText('● 敵方', 84, cv.height - 34);
  g.fillStyle = 'rgba(233,228,214,.35)'; g.fillText('細線＝不可通行（原作哨兵路徑）', 152, cv.height - 34);
}

$('map').addEventListener('click', (ev) => {
  const r = ev.target.getBoundingClientRect();
  const px = (ev.clientX - r.left) * (view.w / r.width);
  const py = (ev.clientY - r.top) * (view.h / r.height);
  let best = null, bd = 1e9;
  let li = 0;
  for (const c of ALL) {
    const [sx, sy] = toScreen(c.pos_xy[0], c.pos_xy[1]);
    li++;
    const d = (sx - px) ** 2 + (sy - py) ** 2;
    if (d < bd) { bd = d; best = c; }
  }
  if (best && bd < 40 * 40) { selected = best.NAME; render(); }
});

// ---------------------------------------------------------------- 渲染
function troopsOf(name) { return save.cities[name]?.troops ?? 0; }

function render() {
  $('ym').textContent = `${Math.floor((save.month - 1) / 12) + 1} 年 ${((save.month - 1) % 12) + 1} 月`;
  $('gold').textContent = save.gold.toLocaleString();
  $('ct').textContent = save.owned.length;
  $('rec').textContent = `${save.wins} 勝 ${save.losses} 敗` + (save.defWins ? ` · 守 ${save.defWins}` : '');

  $('list').innerHTML = cities.map((c) => {
    const st = save.cities[c.NAME];
    const cls = ['city', mine(c.NAME) ? 'mine' : '', selected === c.NAME ? 'target' : ''].join(' ').trim();
    return `<div class="${cls}" data-name="${c.NAME}">
      <div class="n">${c.NAME}<span>${mine(c.NAME) ? '我方' : (c.KING || '無主')}</span></div>
      <div class="s"><b>${st.troops}</b> 兵 · 防 ${c.DEFENSE ?? '—'}</div>
      <div></div><div class="s">${st.pop.toLocaleString()} 人 · $${st.money.toLocaleString()}</div>
    </div>`;
  }).join('');

  const acts = [];
  const isMine = selected && mine(selected);
  if (selected && isMine) {
    acts.push(`<div class="btn" data-act="recruit"><span>徵 兵</span><small>金 500 → 兵 +40</small></div>`);
    acts.push(`<div class="btn" data-act="develop"><span>開 發</span><small>金 400 → 民 +3000</small></div>`);
  } else if (selected) {
    const g = commander();
    const d = distFromOwned(selected);
    const ok = d === 1;
    acts.push(`<div class="btn primary" data-act="march" ${ok ? '' : 'disabled'}>` +
      `<span>出 征</span><small>${ok
        ? `目標 ${selected}${g ? ' · 主將 ' + g.NAME : ''}`
        : (d >= 99 ? '與我方領土不接壤' : `需 ${d} 段路，先打近的`)}</small></div>`);
  }
  const income = save.owned.reduce((s, n) => s + Math.floor((save.cities[n]?.pop || 0) / 5000) * 4, 0);
  acts.push(`<div class="btn" data-act="advance"><span>推進一月</span><small>稅收 +${income}</small></div>`);
  $('actions').innerHTML = acts.join('');

  $('hint').textContent = selected
    ? (isMine
      ? `內政：${selected} 兵 ${troopsOf(selected)} · 民 ${save.cities[selected].pop.toLocaleString()} · 金 ${save.cities[selected].money.toLocaleString()}`
      : `出征 ${selected}：守軍約 ${troopsOf(selected)} 兵（守將屬性按防御值代理）`)
    : '點城選中；自己的城可內政，別人的城可出征。';

  if ($('mapwrap').style.display !== 'none') drawMap();
  renderLog();
}

// 戰報面板：最近 8 條，新的在上
function renderLog() {
  const box = $('logrows');
  if (!box) return;
  const rows = (save.log || []).slice(-8).reverse();
  box.innerHTML = rows.length
    ? rows.map((r) => `<div class="logrow ${r.k || ''}"><span class="m">${r.t}</span><span>${r.s}</span></div>`).join('')
    : '<div class="logrow"><span class="m">—</span><span>尚無戰事。推進一月，等敵軍上門。</span></div>';
}

function toast(msg) {
  $('hint').textContent = msg;
  $('hint').style.color = '#F3E0B4';
  setTimeout(() => { $('hint').style.color = ''; render(); }, 1200);
}

$('list').addEventListener('click', (e) => {
  const el = e.target.closest('.city'); if (!el) return;
  selected = el.dataset.name; render();
});

$('actions').addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const act = el.dataset.act;
  if (act === 'advance') { advanceMonth(1); return; }
  if (!selected) return;
  const st = save.cities[selected];
  if (act === 'recruit') {
    if (save.gold < 500) return toast('國庫不足：徵兵要 500 金。');
    save.gold -= 500; st.troops = Math.min(600, st.troops + 40); persist(); render(); return;
  }
  if (act === 'develop') {
    if (save.gold < 400) return toast('國庫不足：開發要 400 金。');
    save.gold -= 400; st.pop += 3000; persist(); render(); return;
  }
  if (act === 'march') {
    if (distFromOwned(selected) !== 1) return toast('不接壤：只能打與我方相鄰的城。');
    location.href = './deploy.html?city=' + encodeURIComponent(selected);
    return;
  }
  if (act === 'march_direct') {
    const c = ALL.find((x) => x.NAME === selected);
    const troops = st.troops;
    const str = Math.min(100, 50 + Math.floor((c.DEFENSE || 0) / 8));
    const q = new URLSearchParams({
      city: selected, from: 'campaign',
      soldiers: '100',
      bsoldiers: String(Math.max(60, Math.min(100, Math.round(troops / 6)))),
      bstr: String(str), bint: String(Math.max(30, 140 - str)),
    });
    const g = commander(); if (g) q.set('gen', g.NAME);
    location.href = './index.html?' + q.toString();
  }
});

// ---------------------------------------------------------------- 戰報 / AI 出兵（v6）
function stamp(month) {
  const m = month ?? save.month;
  return `${Math.floor((m - 1) / 12) + 1}年${((m - 1) % 12) + 1}月`;
}

function pushLog(text, kind) {
  save.log = save.log || [];
  save.log.push({ t: stamp(), s: text, k: kind || 'info' });
  if (save.log.length > 8) save.log = save.log.slice(-8);
}

// 敌城出兵候选：只看"与某座我方城相邻"的敌城。
// 目标 = 相邻我方城里守军最少的那座；敌兵 < 守军 + 30 就不出兵；
// 概率 = min(0.6, (敌 − 我) / 200)：差得越多越敢来，但封顶 60%。
function aiCandidates() {
  const out = [];
  for (const c of ALL) {
    if (mine(c.NAME)) continue;
    const st = save.cities[c.NAME];
    if (!st) continue;
    const mineNb = [...(adj.get(c.NAME) || [])].filter((n) => mine(n));
    if (!mineNb.length) continue;
    // 同兵时按名字排序，保证 ?seed= 下可复现
    mineNb.sort((a, b) => (troopsOf(a) - troopsOf(b)) || a.localeCompare(b));
    const to = mineNb[0];
    const gt = troopsOf(to);
    if (st.troops < gt + 30) continue;
    out.push({
      from: c.NAME, to,
      et: st.troops, gt,
      p: Math.min(0.6, (st.troops - gt) / 200),
      def: c.DEFENSE || 0,
    });
  }
  out.sort((a, b) => (b.p - a.p) || ((b.et - b.gt) - (a.et - a.gt)) || a.from.localeCompare(b.from));
  return out;
}

// 每月最多 1 次：按"最想打"的顺序逐个掷骰，第一个成功的就是本月的进攻。
// ?forceatk=1 只跳过掷骰，不跳过"敌 ≥ 我 + 30"的兵力门槛。
function rollAI(force) {
  for (const c of aiCandidates()) {
    if (force || Math.random() < c.p) return c;
  }
  return null;
}

// 守将：优先本城驻将，没有就退回最高统帅（与出征编成同一口径）
function defenderOf(cityName) {
  const pool = generals.filter((g) => g.NAME !== '盜賊' && g.CITY === cityName);
  if (pool.length) return pool.sort((a, b) => (b.STR + b.INT) - (a.STR + a.INT))[0];
  return commander();
}

// 守城战入场 URL：防守方永远是 index.html 的 A 方（我方，背视），
// 敌军数值放 B 方；守军/敌军都压在 100 以内（战场上最多摆 100 个兵）。
function defendUrl(atk) {
  const g = defenderOf(atk.to);
  const str = Math.min(100, 50 + Math.floor(atk.def / 8));
  const q = new URLSearchParams({
    defend: '1', city: atk.to, from: 'campaign',
    soldiers: String(Math.max(1, Math.min(100, atk.gt))),
    bsoldiers: String(Math.max(1, Math.min(100, atk.et))),
    bstr: String(str),
    bint: String(Math.max(30, 140 - str)),
  });
  if (g) q.set('gen', g.NAME);
  return './index.html?' + q.toString();
}

// 批量推进（?adv=N）时不跳转，就地判定，好让 12 个月的战报一次性看到。
// 规则与真打一致的方向：守军越多、敌军越少越可能守住。
function resolveDefense(atk) {
  const my = Math.max(1, atk.gt);
  const en = Math.max(1, atk.et);
  const pw = Math.min(0.9, Math.pow(my / (my + en), 0.85) * 1.25);   // 守城方有城防加成
  const held = Math.random() < pw;
  const lost = held
    ? Math.min(my - 1, Math.round(my * (0.18 + Math.random() * 0.22)))
    : my;
  if (held) {
    save.cities[atk.to].troops = Math.max(10, my - lost);
    save.wins += 1;
    save.defWins = (save.defWins || 0) + 1;
    pushLog(`守 住 ${atk.to}（我 ${my} 兵 對 敵 ${en} 兵，損 ${lost}）`, 'hold');
  } else {
    save.owned = save.owned.filter((n) => n !== atk.to);
    save.cities[atk.to].troops = Math.max(30, Math.round(en * 0.6));
    save.losses += 1;
    pushLog(`${atk.to} 失 守（我 ${my} 兵 對 敵 ${en} 兵）`, 'lost');
  }
}

function advanceMonth(n) {
  const batch = n > 1 || qs.get('auto') === '1';   // ?adv=N：批量推进，不跳转
  const force = qs.get('forceatk') === '1';
  for (let i = 0; i < n; i++) {
    save.month += 1;
    let income = 0;
    for (const name of save.owned) {
      const st = save.cities[name];
      income += Math.floor(st.pop / 5000) * 4;
      st.pop = Math.floor(st.pop * 1.01);
      st.money = Math.floor(st.money * 1.01) + 20;
    }
    save.gold += income;
    // 敌城缓慢增兵，否则越打越空
    for (const c of ALL) if (!mine(c.NAME)) save.cities[c.NAME].troops = Math.min(600, save.cities[c.NAME].troops + 6);

    const atk = rollAI(force);
    if (!atk) continue;
    pushLog(`敵 軍 來 攻：${atk.from} → ${atk.to}（敵 ${atk.et} 兵 / 我 ${atk.gt} 兵，${Math.round(atk.p * 100)}%）`, 'atk');
    if (batch) { resolveDefense(atk); continue; }
    // 单月推进：把存盘写完再跳守城战，打完由 main.js 写回
    persist();
    render();
    location.href = defendUrl(atk);
    return;
  }
  persist(); render();
}

document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
  const tab = t.dataset.tab;
  document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('on', x === t));
  $('mapwrap').style.display = tab === 'map' ? 'block' : 'none';
  $('list').style.display = tab === 'list' ? 'block' : 'none';
  if (tab === 'map') resizeCanvas();
}));

// 默认地图视图
$('mapwrap').style.display = 'block';
$('list').style.display = 'none';
fit();
render();
const adv = Number(qs.get('adv') || 0);
if (adv > 0) advanceMonth(adv);
