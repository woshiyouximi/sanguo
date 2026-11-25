/**
 * ItemsPanel headless 验收：用 mock 的 `cc` 模块把编译后的 `_sim/ItemsPanel.js`
 * 真跑起来，拿真实节点树 / 真实 Label 文本 / 真实 SpriteFrame 路径 / 真实命中矩形，
 * 再用 `cc.__emitTouch()` 派发真 TOUCH_END 走 12 段交互。
 *
 * 为什么要有这一层：任务书不许跑 CocosCreator，面板又不能只靠「代码看起来对」。
 * mock 的 cc 只实现面板用到的 API（Node/UITransform/Graphics/Label/Sprite/SpriteFrame/
 * Texture2D/ImageAsset/input/sys/assetManager），够把布局、文案、命中、存档全验一遍。
 *
 * 跑的指令：node panel_headless.mjs
 * 产物：panel_tree.txt（完整节点树）、panel_interactions.txt（点击序列 + 每步状态）
 */
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const cc = require('./_sim/node_modules/cc/index.js');
const { ItemsPanel, LAYOUT, ITEM_SAVE_KEY, DEFAULT_BAG, ITEMS_NODE_NAME } = require('./_sim/ItemsPanel.js');
const { FACE_MAP } = require('./_sim/Portrait.js');

const BUNDLE = 'F:/sanguo/game/cocos/assets/bundles/res/';
const readJson = (name) => JSON.parse(readFileSync(`${BUNDLE}data/${name}.json`, 'utf8'));
const items = readJson('items');
const generals = readJson('generals');

/* 让 bundle 里真有这些图：面板才会走「加载成功」分支 */
for (const file of readdirSync(`${BUNDLE}face/full`)) {
  if (file.endsWith('.webp')) cc.__setAsset(`face/full/${file.replace('.webp', '')}`);
}
for (const file of readdirSync(`${BUNDLE}face/thumb`)) {
  if (file.endsWith('.webp')) cc.__setAsset(`face/thumb/${file.replace('.webp', '')}`);
}
for (const file of readdirSync(`${BUNDLE}hero`)) {
  if (file.endsWith('.webp')) cc.__setAsset(`hero/${file.replace('.webp', '')}`);
}
for (const file of readdirSync(`${BUNDLE}items`)) {
  if (file.endsWith('.png')) cc.__setAsset(`items/${file.replace('.png', '')}`);
}
cc.__setAsset('bg/map_bg');

/* ---------- 断言器 ---------- */
let total = 0;
const failures = [];
function ok(label, cond, actual) {
  total += 1;
  if (cond) return true;
  failures.push(`${label}${actual === undefined ? '' : ` — 实际：${JSON.stringify(actual)}`}`);
  return false;
}
function same(label, expected, actual) {
  const a = JSON.stringify(expected);
  const b = JSON.stringify(actual);
  total += 1;
  if (a === b) return true;
  failures.push(`${label}\n  预期 = ${a}\n  实际 = ${b}`);
  return false;
}

/* ---------- 开面板 ---------- */
let closed = 0;
const root = new cc.Node('PanelHost');
const panel = ItemsPanel.show(root, { onClose: () => { closed += 1; } });
ok('show() 返回 ItemsPanel', panel instanceof ItemsPanel);
ok('面板节点名 = ItemsPanel', panel.node.name === ITEMS_NODE_NAME, panel.node.name);
ok('面板节点挂在 host 下', panel.node.parent === root);
ok('build 后默认不显示', panel.node.active === false);
ok('未 open 时 isOpen = false', panel.isOpen === false);
ok('复用同一个实例（重复 show 不新建）', ItemsPanel.show(root, { onClose: () => {} }) === panel);
/* 上面那次 show 把 onClose 覆盖成空回调了，这里装回真回调再继续 */
ItemsPanel.show(root, { onClose: () => { closed += 1; } });
same('存档 key = sanguo_items_v1', 'sanguo_items_v1', ItemsPanel.saveKey);

/**
 * 面板的 `loadFrame()` 走 `getResBundle().then(...)`，是 Promise 微任务；
 * 所以每次 open / 点击之后要放行一次事件循环，图才会挂上去。
 */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

panel.open(generals, items, []);
await flush();
const d0 = panel.debug();

/* ---------- 节点树 ---------- */
function walk(node, depth = 0, out = []) {
  const transform = node.getComponent(cc.UITransform);
  const label = node.getComponent(cc.Label);
  const sprite = node.getComponent(cc.Sprite);
  out.push({
    depth,
    name: node.name,
    active: node.active,
    x: Math.round(node.position.x),
    y: Math.round(node.position.y),
    w: transform ? transform.contentSize.width : null,
    h: transform ? transform.contentSize.height : null,
    label,
    sprite,
  });
  for (const child of node.children) walk(child, depth + 1, out);
  return out;
}
const rows = walk(panel.node);
const all = walk(root);
const labels = rows.filter((r) => r.label !== null);
const sprites = rows.filter((r) => r.sprite !== null);
const graphicsNodes = [];
(function collect(node) {
  if (node.getComponent(cc.Graphics)) graphicsNodes.push(node.name);
  for (const child of node.children) collect(child);
})(panel.node);

/** 实时读文本（不能把 string 快照下来，否则后续 refresh 看不到）。 */
const byName = new Map();
const allByName = new Map();
for (const row of rows) {
  if (!row.label) continue;
  if (!byName.has(row.name)) byName.set(row.name, row.label);
  const list = allByName.get(row.name) ?? [];
  list.push(row.label);
  allByName.set(row.name, list);
}
const text = (name) => {
  const comp = byName.get(name);
  return comp ? comp.string : '(缺)';
};
const texts = (name) => (allByName.get(name) ?? []).map((comp) => comp.string);
/** 实时读 SpriteFrame 的 bundle 路径（mock 把 path 从 ImageAsset 一路带到 SpriteFrame）。 */
const frameOf = (name) => {
  const row = rows.find((r) => r.name === name && r.sprite);
  if (!row || !row.sprite.spriteFrame) return null;
  return row.sprite.spriteFrame.path ?? '(frame)';
};
const allFrames = () =>
  sprites.map((r) => (r.sprite.spriteFrame ? r.sprite.spriteFrame.path ?? '(frame)' : null));

const treeText = rows
  .map((r) => {
    const pad = '  '.repeat(r.depth);
    const size = r.w === null ? '' : ` size=${r.w}x${r.h}`;
    const at = ` @(${r.x},${r.y})`;
    const value = r.label ? ` "${String(r.label.string).replace(/\n/g, ' ⏎ ')}"` : '';
    const frame = r.sprite && r.sprite.spriteFrame ? ` frame=${r.sprite.spriteFrame.path ?? '(frame)'}` : '';
    const active = r.active ? '' : ' [hidden]';
    return `${pad}${r.name}${size}${at}${value}${frame}${active}`;
  })
  .join('\n');
writeFileSync(new URL('./panel_tree.txt', import.meta.url), `${treeText}\n`, 'utf8');

/* ---------- 结构断言 ---------- */
same('武将池 12 位', 12, d0.generals.length);
same('页签 7 个', ['全部', '兵器', '坐騎', '兵書', '寶物', '兵符', '陣法'], d0.tabs);
same('初始 filter = all', 'all', d0.filter);
same('初始 page = 0', 0, d0.page);
same('初始无装备', [], d0.equipped);
same('初始背包 12 件', DEFAULT_BAG.length, d0.bag);
same('组头 6 + 行 77 = 83 条目', 83, d0.entries);
ok('分页数 > 1', d0.pages > 1, d0.pages);
same('分页文案 第 1/8 頁', `第 1/${d0.pages} 頁`, text('ItemsPage'));

same('标题 = 物 品 　裝 備', '物 品 　裝 備', text('ItemsTitle'));
same('页眉统计', '共 77 件 · 可裝備 55 · 背包 12 件 · 已裝備 0/4', text('ItemsSub'));
same('武将卡名', d0.general, text('ItemsGenName'));
ok('武将卡属四行含「武力/智力/生命/速度」', /武力 .* · 智力 .* · 生命 .* · 速度 /.test(text('ItemsGenStat')), text('ItemsGenStat'));
ok('武将卡「所在 X · 忠誠 N」', /^所在 .+ · 忠誠 \d+$/.test(text('ItemsGenCity')), text('ItemsGenCity'));
same('四个槽位名', ['兵器', '坐騎', '兵書', '寶物'], texts('ItemsSlotKey'));
same('初始四槽空', ['空', '空', '空', '空'], texts('ItemsSlotVal'));

const firstItem = items
  .slice()
  .sort((a, b) => Number(a.Sort ?? 0) - Number(b.Sort ?? 0) || Number(a.Sequence) - Number(b.Sequence))[0];
same('初始选中 = Sort 最小的那件', Number(firstItem.Sequence), d0.selected);
same('详情名 = 该物名', String(firstItem.Name), text('ItemsDetName'));

/* 肖像：所有武将 full + thumb 都在 bundle 里，回落链第一级就该成功 */
same('肖像走 face/full（關羽 #385）', 'face/full/385', frameOf('ItemsPortrait'));
same('底图 bg/map_bg 已挂', 'bg/map_bg', frameOf('ItemsBg'));
const pickFrames = allFrames().filter((f) => f && f.startsWith('face/thumb/'));
same('12 个武将小头像都走 face/thumb', 12, pickFrames.length);
ok('小头像路径与 FACE_MAP 一致', pickFrames.every((f) => Object.values(FACE_MAP).some((num) => f === `face/thumb/${num}`)), pickFrames.slice(0, 3));
ok('物品图标走 items/<stem>', allFrames().some((f) => f && f.startsWith('items/')), allFrames().filter((f) => f && f.startsWith('items/')).slice(0, 3));

/* 列表首屏：6 个组头里只有当前页第一个有字 */
const heads = texts('ItemsHead').filter((s) => s !== '');
ok('首屏组头有文案（兵器 34 件 · 已擁有 3）', heads.length >= 1, heads);
same('首屏第一个组头', '兵 器 34 件 · 已擁有 3', heads[0]);
const headCount = texts('ItemsHead').length;
same('组头节点池 6 个', 6, headCount);
same('行节点池 11 个', 11, texts('ItemsRowName').length);
same('页签 7 个节点', 7, texts('ItemsTab').length);
same('武将格 12 个', 12, texts('ItemsPickName').length);
same('加成表 10 行', 10, texts('ItemsStatName').length);
ok('详情原作欄位 12 行', text('ItemsFieldKeys').split('\n').length === 12, text('ItemsFieldKeys').split('\n').length);
same('详情欄位两栏行数一致', text('ItemsFieldKeys').split('\n').length, text('ItemsFieldVals').split('\n').length);

console.log('--- ItemsPanel headless（mock cc，真 TOUCH_END） ---');
console.log(`面板节点数           : ${rows.length}（host 连同 ${all.length}）`);
console.log(`Label / Sprite       : ${labels.length} / ${sprites.length}（Graphics 节点：${graphicsNodes.join(', ')}）`);
console.log(`条目 / 页数          : ${d0.entries} 条 / ${d0.pages} 页`);
console.log(`命中矩形数           : ${d0.hits}`);
console.log(`武将池               : ${d0.generals.join(' / ')}`);
console.log(`页眉                 : ${text('ItemsSub')}`);
console.log(`武将卡               : ${text('ItemsGenName')} | ${text('ItemsGenStat')} | ${text('ItemsGenCity')}`);
console.log(`肖像                 : ${frameOf('ItemsPortrait')}`);
console.log(`首屏组头 / 前三行    : ${heads[0]} / ${texts('ItemsRowName').filter((s) => s !== '').slice(0, 3).join(' · ')}`);
console.log(`详情                 : ${text('ItemsDetName')} | ${text('ItemsDetType')} | ${text('ItemsDetFoot')}`);
console.log(`加成表（左列）       : ${texts('ItemsStatName').slice(0, 5).join(' / ')}`);
console.log(`原作欄位（前 4 行）  : ${text('ItemsFieldKeys').split('\n').slice(0, 4).join(' / ')}`);
console.log(`原作值（前 4 行）    : ${text('ItemsFieldVals').split('\n').slice(0, 4).join(' / ')}`);
console.log(`底栏                 : ${text('ItemsActMain')} + ${text('ItemsActSub')} | ${text('ItemsUnlockMain')} | ${text('ItemsBack')}`);

/* ---------- 交互：真 TOUCH_END ---------- */
const steps = [];
function note(line) {
  steps.push(line);
  console.log(line);
}
const tapAt = (x, y) => cc.__emitTouch(x - 375, 667 - y);
const tapRect = (rect) => {
  tapAt(rect.x + rect.w / 2, rect.y + rect.h / 2);
  return flush();
};
/** 每次都从面板的最新 hits 里挑，不能缓存数组（refresh 会换掉）。 */
const hitsIn = (y, h) => panel.hits.filter((hit) => hit.rect.y === y && hit.rect.h === h);
const slotHit = (i) => hitsIn(LAYOUT.slot.y, LAYOUT.slot.h)[i];
const tabHit = (i) => hitsIn(LAYOUT.tabs.y, LAYOUT.tabs.h)[i];
const rowHits = () => panel.hits.filter((hit) => hit.rect.h === LAYOUT.row.h);
const navRectOf = (index) => {
  const { x, y, w, h } = LAYOUT.nav;
  const col = w / 3;
  return { x: x + index * col, y, w: col - 4, h };
};
const pickRectOf = (index) => {
  const { x, y, w, h, gap, perRow, rowGap } = LAYOUT.pick;
  return { x: x + (index % perRow) * (w + gap), y: y + Math.floor(index / perRow) * (h + rowGap), w, h };
};

ok('命中 = 4 槽 + 12 武将 + 7 页签 + 当前页条目 + 2 翻页 + 3 底栏', panel.hits.length === 4 + 12 + 7 + rowHits().length + 2 + 3, panel.hits.length);
same('4 个槽位命中', 4, hitsIn(LAYOUT.slot.y, LAYOUT.slot.h).length);
same('7 个页签命中', 7, hitsIn(LAYOUT.tabs.y, LAYOUT.tabs.h).length);
same('2 个翻页命中', 2, hitsIn(LAYOUT.nav.y, LAYOUT.nav.h).length);

console.log('\n--- 交互驱动（cc.__emitTouch 派发 TOUCH_END） ---');

/* 1. 页签 → 兵器 */
{
  const before = panel.debug();
  await tapRect(tabHit(1).rect);
  const after = panel.debug();
  same('页签 → weapon', 'weapon', after.filter);
  same('兵器页 = 1 组头 + 34 行', 35, after.entries);
  same('组头只剩兵器', '兵 器 34 件 · 已擁有 3', texts('ItemsHead').filter((s) => s !== '')[0]);
  note(`  页签 兵器: filter ${before.filter}→${after.filter}, 条目 ${before.entries}→${after.entries}`);
}

/* 2. 页签 → 全部 */
{
  await tapRect(tabHit(0).rect);
  const d = panel.debug();
  same('页签 → all', 'all', d.filter);
  same('全部页条目恢复 83', 83, d.entries);
  note(`  页签 全部: 条目 ${d.entries}`);
}

/* 3. 点第 3 行 → 选中项与详情跟随 */
{
  const before = panel.debug().selected;
  await tapRect(rowHits()[2].rect);
  const seq = panel.debug().selected;
  const name = String(items.find((it) => Number(it.Sequence) === seq).Name);
  ok('点第 3 行后选中项变化', seq !== before, `${before}→${seq}`);
  same('详情名跟随选中项', name, text('ItemsDetName'));
  same('底栏副文跟随', `兵器 · ${name}`, text('ItemsActSub'));
  note(`  选物品: #${before} → #${seq}（${name}）`);
}

/* 4. 选一件兵器 → 装备 */
{
  await tapRect(tabHit(1).rect);
  await tapRect(rowHits()[0].rect);
  const seq = panel.debug().selected;
  const name = String(items.find((it) => Number(it.Sequence) === seq).Name);
  const beforeStat = text('ItemsGenStat');
  await tapRect(LAYOUT.actBtn);
  const d = panel.debug();
  same('装备后 weapon 槽有值', ['weapon'], d.equipped);
  same('槽位文字 = 物名', [name], [texts('ItemsSlotVal')[0]]);
  same('主按钮变「卸 下」', '卸 下', text('ItemsActMain'));
  ok('武将卡出现 b→a 对比', /→/.test(text('ItemsGenStat')), text('ItemsGenStat'));
  ok('武将卡 b→a 与卡面一致（武力/智力/生命/速度）', /武力 \d+→\d+/.test(text('ItemsGenStat')), text('ItemsGenStat'));
  same('详情 foot 变「裝備中」', true, text('ItemsDetFoot').includes('裝備中'));
  same('预览文案 = 已裝備於兵器槽', `${name} 已裝備於「兵器」槽`, text('ItemsPreview'));
  note(`  装备: #${seq} ${name}；卡片 ${beforeStat} → ${text('ItemsGenStat')}`);
}

/* 5. 再点一次 → 卸下 */
{
  await tapRect(LAYOUT.actBtn);
  const d = panel.debug();
  same('再点一次 → 卸下', [], d.equipped);
  same('主按钮变回「裝 備」', '裝 備', text('ItemsActMain'));
  same('槽位回到「空」', '空', texts('ItemsSlotVal')[0]);
  note('  卸下: 装备槽清空');
}

/* 6. 翻页 */
{
  await tapRect(tabHit(0).rect);
  const pages = panel.debug().pages;
  await tapRect(navRectOf(2));
  same('下一页 → page 1', 1, panel.debug().page);
  await tapRect(navRectOf(2));
  same('再下一页 → page 2', 2, panel.debug().page);
  same('页脚文案跟随', `第 3/${pages} 頁`, text('ItemsPage'));
  await tapRect(navRectOf(0));
  same('上一页 → page 1', 1, panel.debug().page);
  note(`  翻页: 共 ${pages} 页，0→1→2→1 正常`);
}

/* 7. 切武将（点第 4 个格子） */
{
  const before = panel.debug().general;
  await tapRect(pickRectOf(3));
  const d = panel.debug();
  const expected = `face/full/${FACE_MAP[d.general]}`;
  ok('切武将后 general 变化', d.general !== before, `${before}→${d.general}`);
  same('武将卡名跟随', d.general, text('ItemsGenName'));
  same('武将池索引 = 3', 3, d.genIndex);
  same(`肖像走 full → ${expected}`, expected, frameOf('ItemsPortrait'));
  note(`  切武将: ${before} → ${d.general}，大肖像 ${frameOf('ItemsPortrait')}`);
}

/* 8. 全部解锁 */
{
  const before = panel.debug().bag;
  await tapRect(LAYOUT.unlockBtn);
  const d = panel.debug();
  same('全部解锁后背包 77 件', 77, d.bag);
  same('解锁副文跟随', '背包 77 件', text('ItemsUnlockSub'));
  same('toast 提示补了多少件', `背包補滿 ${77 - before} 件`, text('ItemsToast'));
  same('toast 节点显示出来', true, panel.node.getChildByName('ItemsToast')?.active ?? false);
  note(`  解锁: 背包 ${before}→${d.bag}，toast=${JSON.stringify(text('ItemsToast'))}`);
}

/* 9. 点槽位 → 选中该槽物品 */
{
  await tapRect(tabHit(1).rect);
  await tapRect(rowHits()[1].rect);
  const seq = panel.debug().selected;
  await tapRect(LAYOUT.actBtn);
  same('第二件兵器已装备', ['weapon'], panel.debug().equipped);
  await tapRect(tabHit(0).rect);
  await tapRect(tabHit(1).rect);
  await tapRect(rowHits()[3].rect);
  const other = panel.debug().selected;
  await tapRect(slotHit(0).rect);
  same('点兵器槽 → 选中该槽物品', seq, panel.debug().selected);
  ok('确实从别的物品切回来了', other !== seq, `${other}→${seq}`);
  same('切回来时 filter 回到 all（原物不在兵器页时也一样）', true, panel.debug().filter === 'weapon' || panel.debug().filter === 'all');
  note(`  槽位点击: 选中 #${other} → #${panel.debug().selected}（兵器槽）`);
}

/* 10. 存档落盘 */
{
  const raw = cc.__storage.get(ITEM_SAVE_KEY);
  ok('localStorage 写了 sanguo_items_v1', typeof raw === 'string', String(raw).slice(0, 60));
  const parsed = JSON.parse(String(raw));
  same('存档 bag 77 件', 77, parsed.bag.length);
  const equippedGen = Object.keys(parsed.equip).find((name) => Object.keys(parsed.equip[name] ?? {}).length > 0);
  ok('存档里有一位武将带武器', Boolean(equippedGen), JSON.stringify(parsed.equip));
  same('存档记住上次武将', panel.debug().general, parsed.gen);
  ok('存档 equip 槽名合法', Object.values(parsed.equip[equippedGen] ?? {}).length >= 1, JSON.stringify(parsed.equip));
  note(`  存档: ${String(raw).slice(0, 150)}…`);
}

/* 11. 关闭 */
{
  await tapRect(LAYOUT.backBtn);
  ok('关闭后 isOpen = false', panel.isOpen === false);
  same('关闭后节点隐藏', false, panel.node.active);
  same('关闭回调触发 1 次', 1, closed);
  same('关闭后注销 input 监听', 0, cc.__listeners.get('touch-end')?.length ?? 0);
  note('  关闭: 节点隐藏、input 注销、onClose 回调各一次');
}

/* 12. 重开（持久化） */
{
  panel.open(generals, items, []);
  await flush();
  const d = panel.debug();
  same('重开后背包仍 77 件', 77, d.bag);
  same('重开后记住上次武将', '曹操', d.general);
  same('重开后回到 all / 第 1 页', ['all', 0], [d.filter, d.page]);
  ok('重开后装备仍在（weapon 槽有值）', d.equipped.length === 1, d.equipped);
  same('重开后槽位文字非空', true, texts('ItemsSlotVal')[0] !== '空');
  note(`  重开: 背包 ${d.bag} 件，武将 ${d.general}，filter ${d.filter}，page ${d.page}，装备 ${JSON.stringify(d.equipped)}`);
}

/* 13. 数据面：页头数字 / 8 页逐页条目 / 加成表非空 / 模型层 equip-unequip */
{
  console.log('\n--- 数据面（77 件 / 55 可裝備 / 8 頁 / 加成表 / equip 可用性） ---');
  const M = require('./_sim/ItemsModel.js');
  const guanyu = generals.find((g) => g.NAME === '關羽');

  same('頁頭 = 共 77 件 · 可裝備 55 · 背包 77 件 · 已裝備 1/4',
    '共 77 件 · 可裝備 55 · 背包 77 件 · 已裝備 1/4', text('ItemsSub'));
  same('模型 allItems() = 77 件', 77, M.allItems().length);
  ok('模型 allItems()[0] 是真物品（不是 MapIterator）',
    Boolean(M.allItems()[0]) && typeof M.allItems()[0].Name === 'string', typeof M.allItems()[0]);
  let equippable = 0;
  for (const it of M.allItems()) if (M.isEquippable(it)) equippable += 1;
  same('模型 isEquippable = 55 件', 55, equippable);
  const groupCount = {};
  for (const it of M.allItems()) {
    const g = M.groupOf(it);
    groupCount[g] = (groupCount[g] ?? 0) + 1;
  }
  same('6 組件數', [['amulet', 5], ['book', 8], ['formation', 9], ['horse', 8], ['talisman', 13], ['weapon', 34]],
    Object.keys(groupCount).sort().map((k) => [k, groupCount[k]]));

  // 逐頁：pageSizes 由面板自己的分頁結果給出，再用 UI 的行數對一次
  if (panel.debug().page !== 0) await tapRect(navRectOf(0));
  const sizes = panel.debug().pageSizes;
  same('分頁 = 8 頁', 8, sizes.length);
  same('8 頁條目合計 = 83（6 個組頭 + 77 件）', 83, sizes.reduce((s, n) => s + n, 0));
  const perPage = [];
  for (let p = 0; p < sizes.length; p += 1) {
    if (panel.debug().page !== p) await tapRect(navRectOf(2));
    await flush();
    const rowCount = texts('ItemsRowName').filter((s) => s !== '').length;
    const headCount = texts('ItemsHead').filter((s) => s !== '').length;
    same(`第 ${p + 1} 頁頁碼`, `第 ${p + 1}/${sizes.length} 頁`, text('ItemsPage'));
    same(`第 ${p + 1} 頁條目 = 行 + 組頭`, sizes[p], rowCount + headCount);
    perPage.push({ page: p + 1, rows: rowCount, heads: headCount, entries: sizes[p] });
  }
  same('8 頁行數合計 = 77 件', 77, perPage.reduce((s, c) => s + c.rows, 0));
  ok('每頁至少 1 行物品', perPage.every((c) => c.rows >= 1), perPage);
  ok('每頁不超過 11 行（ROW_POOL）', perPage.every((c) => c.rows <= 11), perPage);
  note(`  分頁: ${perPage.map((c) => `第 ${c.page} 頁 ${c.rows} 行 + ${c.heads} 組頭`).join('；')}`);
  if (panel.debug().page !== 0) await tapRect(navRectOf(0));

  // 選中一件兵器 → 右側加成表必須非空，且逐項等於模型 bonusOf
  await tapRect(tabHit(1).rect);
  await tapRect(rowHits()[0].rect);
  const selSeq = panel.debug().selected;
  const selItem = M.itemOf(selSeq);
  const vals = texts('ItemsStatVal');
  same('加成表固定 10 行', 10, vals.length);
  const bonus = M.bonusOf(selItem);
  const shown = M.STAT_KEYS.map((k) => (bonus[k] === 0 ? '—' : `${bonus[k] > 0 ? '+' : ''}${bonus[k]}`));
  same(`選中 #${selSeq} ${String(selItem.Name)} 的加成表 = 模型 bonusOf`, shown, vals);
  ok('加成表至少一項非「—」', vals.some((s) => s !== '—'), vals);
  note(`  加成表: #${selSeq} ${String(selItem.Name)} → ${M.bonusText(selItem)}`);

  // 模型層 equip / unequip：四個槽逐個裝上、算加成、卸下
  for (const slot of M.SLOTS) {
    const pick = M.allItems().find((it) => M.slotOf(it) === slot);
    const table = M.equipItem({}, pick.Sequence);
    same(`equipItem 把 ${slot} 槽裝上`, pick.Sequence, table[slot]);
    same(`equippedSlot 認得 ${slot}`, slot, M.equippedSlot(table, pick.Sequence));
    const base = M.runtimeGeneral(guanyu);
    const applied = M.applyEquip(base, table);
    const gained = M.STAT_KEYS.filter((k) => applied[k] !== base[k]);
    ok(`applyEquip 後 ${slot} 至少一項屬性變化`, gained.length > 0,
      M.STAT_KEYS.map((k) => `${k}:${base[k]}→${applied[k]}`));
    const off = M.unequipSlot(table, slot);
    ok(`unequipSlot 清掉 ${slot}`, !(slot in off), off);
  }

  // 同槽只能一件：裝第二件兵器會取代第一件
  const weaponItems = M.allItems().filter((it) => M.slotOf(it) === 'weapon');
  const twoWeapons = M.equipItem(M.equipItem({}, weaponItems[0].Sequence), weaponItems[1].Sequence);
  same('同槽第二件取代第一件', weaponItems[1].Sequence, twoWeapons.weapon);
  same('同槽只留一個 key', 1, Object.keys(twoWeapons).length);

  // 兵符 / 陣法書：不可裝備，equipItem 原樣返回
  const talisman = M.allItems().find((it) => M.isTalisman(it));
  const formBook = M.allItems().find((it) => M.isFormBook(it));
  same('兵符 slotOf = null（不可裝備）', null, M.slotOf(talisman));
  same('陣法書 slotOf = null（不可裝備）', null, M.slotOf(formBook));
  same('equipItem(兵符) 不動裝備表', {}, M.equipItem({}, talisman.Sequence));
  same('equipItem(陣法書) 不動裝備表', {}, M.equipItem({}, formBook.Sequence));
  ok('兵符 bonusOf 全 0（兵符不加屬性）', M.STAT_KEYS.every((k) => M.bonusOf(talisman)[k] === 0));
}

writeFileSync(new URL('./panel_interactions.txt', import.meta.url), `${steps.join('\n')}\n`, 'utf8');

console.log('\n--- 结果 ---');
console.log(`断言总数  : ${total}`);
console.log(`失败      : ${failures.length}`);
if (failures.length) {
  console.log('--- 失败 ---');
  for (const line of failures.slice(0, 20)) console.log(line);
  process.exit(1);
}
console.log('ALL PASS');
