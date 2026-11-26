import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const READ = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8');
const CR = READ('cocos/assets/scripts/CampaignRoot.ts');
const GS = READ('cocos/assets/scripts/GameState.ts');
const DR = READ('cocos/assets/scripts/DeployRoot.ts');

/** 抽出某个方法的本文（大括號配對） */
function bodyOf(src: string, name: string): string {
  const at = src.indexOf(name);
  if (at < 0) return '';
  const open = src.indexOf('{', at);
  if (open < 0) return '';
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  return '';
}

const SIEGE = bodyOf(CR, 'private startArrivalSiege(army: Army, target: string): void');
const SNAP = bodyOf(CR, 'private siegeSnapshotOf(army: CampaignArmy, target: string, from: string): GameState.DeploySiege');
const MARCH_BRANCH = CR.slice(CR.indexOf("if (kind === 'march') {"), CR.indexOf('  // 行軍（web campaign.html'));
const START = DR.slice(DR.indexOf('protected async start(): Promise<void> {'), DR.indexOf('  onEnable(): void {'));
const MARCH = bodyOf(DR, 'private march(): void');
const FIGHT = bodyOf(DR, 'private fight(): void');
const ABANDON = bodyOf(DR, 'private abandonSiege(): void');
const ROSTER = bodyOf(DR, 'private applySiegeRoster(byName: Map<string, GeneralRow>): void');
const TROOPS = bodyOf(DR, 'private applySiegeTroops(): void');
const PERSIST = bodyOf(DR, 'private persistQueue(): void');

/* ============================================================================
 * ① GameState：攻城戰前準備快照总線
 * ========================================================================== */
test('[R231] GameState：DeploySiege 快照（將/兵/armyId）+ set/peek/clear + resetCache 清理', () => {
  const iface = GS.slice(GS.indexOf('export interface DeploySiege'), GS.indexOf('let deploySiege'));
  assert.ok(iface.length > 100, '找不到 DeploySiege 接口');
  for (const field of ['from: string;', 'target: string;', 'pathIndex: number;', 'armyId: string;', 'general: string;', 'officers: string[];', 'troops: number;']) {
    assert.ok(iface.includes(field), `DeploySiege 缺欄位 ${field}`);
  }
  assert.match(GS, /export function setDeploySiege\(siege: DeploySiege \| null\): void/);
  assert.match(GS, /export function peekDeploySiege\(\): DeploySiege \| null/);
  assert.match(GS, /export function clearDeploySiege\(\): void/);
  const reset = bodyOf(GS, 'export function resetCache(): void');
  assert.ok(reset.includes('deploySiege = null;'), 'resetCache 要清攻城快照（避免跨局殘留）');
});

test('[R231] GameState.refundSiegeTroops：按 web refundArmy 口径退回出發城（cap = CITY_TROOP_CAP，写回存档）', () => {
  assert.ok(
    GS.includes('export function refundSiegeTroops(from: string, troops: number, cap = CITY_TROOP_CAP): number'),
    '找不到 refundSiegeTroops()（web campaign.html refundArmy 同口徑）',
  );
  const body = bodyOf(GS, 'export function refundSiegeTroops(from: string, troops: number, cap = CITY_TROOP_CAP): number');
  assert.ok(body.includes('save.cities[from]'), '退款要寫回出發城');
  assert.ok(body.includes('state.troops = Math.min('), '要按 cap 夾一次（600 = CITY_TROOP_CAP）');
  assert.ok(body.includes('persistSave()'), '退款要落盤');
  assert.ok(body.includes('numberOr('), '兵數要防髒資料（沿用 numberOr）');
});

/* ============================================================================
 * ② CampaignRoot：抵達 → 攻城快照（參戰=剛抵達的兵團）
 * ========================================================================== */
test('[R231] 抵達快照鏡像這支兵團：主將/隨軍/兵數/armyId/出發城/路徑', () => {
  assert.ok(SNAP.length > 100, '找不到 siegeSnapshotOf()');
  for (const field of ['from,', 'target,', 'pathIndex: army.pathIndex', 'armyId: army.id', 'general: army.general', 'officers:', 'troops:', 'advisor: army.advisor']) {
    assert.ok(SNAP.includes(field), `快照缺 ${field}`);
  }
  assert.ok(SNAP.includes('Array.isArray(army.officers)'), '隨軍要防非陣列');
  assert.ok(SNAP.includes('slice(0, 4)'), '隨軍最多 4 人（與 dispatchMarch 同口徑）');
  assert.ok(SNAP.includes('Math.max(1, Math.round(Number(army.troops) || 1))'), '兵數至少 1（戰場不接受 0 兵）');
});

test('[R231] startArrivalSiege 顺序：撤隊 → 清派兵快照 → 写攻城快照 → 切 Deploy（不再重派兵團）', () => {
  assert.ok(SIEGE.length > 200, '找不到 startArrivalSiege()');
  assert.ok(SIEGE.includes('GameState.removeArmy(army.id)'), '先撤隊');
  assert.ok(SIEGE.includes('GameState.clearDeployMarch()'), '清派兵快照（否則 Deploy 按「出征」重派新兵團）');
  assert.ok(SIEGE.includes('GameState.setDeploySiege(this.siegeSnapshotOf(army'), '寫攻城快照');
  assert.ok(!SIEGE.includes('GameState.setDeployMarch({'), '抵達戰不能寫派兵快照');
  const rm = SIEGE.indexOf('GameState.removeArmy(army.id)');
  const clear = SIEGE.indexOf('GameState.clearDeployMarch()');
  const set = SIEGE.indexOf('GameState.setDeploySiege(');
  const load = SIEGE.indexOf("director.loadScene('Deploy')");
  assert.ok(rm >= 0 && rm < clear && clear < set && set < load, '順序必須是 removeArmy → clearDeployMarch → setDeploySiege → loadScene');
});

test('[R231] 大地圖「攻城」（城下已有部隊）也寫同一份快照，且接鄰守衛在撤隊之前', () => {
  assert.ok(MARCH_BRANCH.length > 500, '找不到 march 分支');
  assert.ok(
    MARCH_BRANCH.includes('GameState.setDeploySiege(this.siegeSnapshotOf(siege, selected, siege.from))'),
    '點城「攻城」也要用抵達兵團的戰前準備快照（不能走 setDeployMarch 重派兵）',
  );
  const guard = MARCH_BRANCH.indexOf('GameState.distanceFromOwned(selected, this.paths)');
  const rm = MARCH_BRANCH.indexOf('GameState.removeArmy(siege.id)');
  assert.ok(guard >= 0 && rm >= 0 && guard < rm, '不接壤要先判再撤隊，不能白丟部隊');
  // 派兵路（無部隊）要清掉殘留的攻城快照
  assert.ok(MARCH_BRANCH.includes('GameState.clearDeploySiege();'), '派兵/守城戰前要清殘留的攻城快照');
});

/* ============================================================================
 * ③ DeployRoot：攻城戰前準備模式
 * ========================================================================== */
test('[R231] DeployRoot.start()：讀攻城快照，先鎖將（applyGeneral 前）再鎖兵（applyGeneral 後）', () => {
  assert.ok(START.length > 500, '找不到 start()');
  assert.ok(START.includes('this.siege = GameState.peekDeploySiege();'), 'start() 要讀攻城快照');
  const read = START.indexOf('this.siege = GameState.peekDeploySiege();');
  const roster = START.indexOf('if (this.siege) this.applySiegeRoster(byName);');
  const apply = START.indexOf('this.applyGeneral();');
  const troops = START.indexOf('if (this.siege) this.applySiegeTroops();');
  assert.ok(read >= 0 && roster > read, '要先讀快照再鎖將');
  assert.ok(roster < apply && apply < troops, '鎖將在 applyGeneral 之前、鎖兵在之後（等級上限夾完再蓋回抵達兵數）');
});

test('[R231] 戰前準備：將/兵鎖定（隊列=快照將領、兵力=抵達兵數、不能換將/拖滑桿/落盤）', () => {
  assert.ok(ROSTER.includes('this.queue = names.map((name) => makeSlot(name))'), '出陣隊列要重建自快照名單');
  assert.ok(
    ROSTER.includes('this.generals = rows;'),
    '將領池要無條件覆寫成快照解析結果：解析不到就是空（fight 用快照 general 兜底），不能殘留城內候選池',
  );
  assert.ok(ROSTER.includes('siege.general'), '主將來自快照');
  assert.ok(ROSTER.includes('siege.officers'), '隨軍來自快照');
  assert.ok(TROOPS.includes('this.soldiers = troops;'), '兵力鎖在抵達兵數');
  assert.ok(TROOPS.includes('this.soldierCap = Math.max(this.soldierCap, troops);'), '上限放寬到抵達兵數（不能把兵夾掉）');
  assert.ok(PERSIST.includes('if (this.siege) return;'), '攻城模式不能把抵達兵團寫進出發城的派兵隊列');
  const drawQueue = bodyOf(DR, 'private drawQueue(g: Graphics): void');
  assert.ok(drawQueue.includes('this.siege'), '隊列面板要判攻城模式');
  assert.ok(drawQueue.includes("'隨軍'"), '攻城模式非主將槽標「隨軍」，不能顯示 makeSlot 預設的 10 兵');
  const deny = bodyOf(DR, 'private setColumnFromX(column: number, x: number): void');
  assert.ok(deny.includes('if (this.siege) return;'), '攻城模式滑桿不生效');
  const touchStart = bodyOf(DR, 'private onTouchStart(event: EventTouch): void');
  assert.ok(touchStart.includes('if (this.siege) return;'), '攻城模式不進滑桿拖拽');
  const genBranch = DR.slice(DR.indexOf("if (button.kind === 'gen') {"), DR.indexOf("if (button.kind === 'troop') {"));
  assert.ok(genBranch.includes('if (this.siege)'), '攻城模式將卡要攔下來');
  assert.ok(genBranch.includes('不能換將'), '要提示不能換將');
});

test('[R231] 按「出 戰」走 fight()：直接 startBattle 並帶 armyId，不 dispatchMarch（不再造新兵團）', () => {
  assert.ok(MARCH.length > 500, '找不到 march()');
  const siegeAt = MARCH.indexOf('if (this.siege)');
  const marchAt = MARCH.indexOf('GameState.peekDeployMarch()');
  assert.ok(siegeAt >= 0 && marchAt > siegeAt, '攻城分支要在派兵分支之前（快照優先）');
  const genGuard = MARCH.indexOf('const gen = this.currentGen();');
  assert.ok(
    genGuard > siegeAt,
    '攻城分支要在「沒有可用主將」檢查之前：抵達兵團的將領解析不到時也要能由 fight() 兜底開戰',
  );
  assert.ok(MARCH.includes('this.fight();'), '攻城模式按鈕要進 fight()');
  assert.ok(FIGHT.length > 300, '找不到 fight()');
  assert.ok(FIGHT.includes('GameState.startBattle('), '要直接進 Battle');
  assert.ok(FIGHT.includes('armyId: siege.armyId'), '戰後結算要能按 armyId 清這支部隊');
  assert.ok(!FIGHT.includes('dispatchMarch('), '攻城戰不能重派新兵團');
  assert.ok(FIGHT.includes('soldiers: Math.max(1, Math.round(Number(siege.troops) || 1))'), '上陣兵數 = 抵達兵數');
  assert.ok(FIGHT.includes('GameState.clearDeploySiege()'), '進 Battle 前清快照（一次性）');
  assert.ok(FIGHT.includes('cols: this.deployCols()'), '仍要帶前/中/後站位');
});

test('[R231/R234b] 「返回大地圖」=放棄攻城：改派返程兵團回出發城（不再立刻退款）', () => {
  const fn = bodyOf(DR, 'private abandonSiege');
  assert.ok(fn.length > 0, '找不到 abandonSiege');
  assert.ok(/pushReturnArmy\(\s*siege\.target\s*,\s*siege\.from/.test(fn), '要用 siege.target→siege.from 派返程兵團');
  assert.ok(fn.includes('clearDeploySiege()'), '要清攻城快照');
  assert.equal(fn.includes('refundSiegeTroops'), false, '不得再退款回城（會讓將立刻又能編去打別城）');
  assert.ok(fn.includes("loadScene('Campaign')"), '回到大地圖');
});

test('[R231] 攻城模式標題/標籤與派兵模式分開（不再顯示「出征編成」）', () => {
  const applyGeneral = bodyOf(DR, 'private applyGeneral(): void');
  assert.ok(applyGeneral.includes("this.siege ? '攻 城 編 成'"), '標題要分攻城模式');
  const refresh = bodyOf(DR, 'private refresh(): void');
  assert.ok(refresh.includes('if (this.siege)'), 'labelTarget 要有攻城分支');
  assert.ok(refresh.includes('抵達'), '要寫明這支兵團是抵達城下的部隊');
});

test('R232c 編成候選池的在途集合包含攻城快照（不能只看 GameState.armies）', () => {
  assert.ok(
    DR.includes('const away = O.awayNameSet(save)'),
    'DeployRoot 的 away 必須走 O.awayNameSet(save)（save.away ∪ armies ∪ siege）',
  );
  assert.ok(
    DR.includes('.filter((gen) => !away.has(gen.NAME))'),
    '候選池必須用 away 過濾（save.away ∪ armies(side A) ∪ siege）',
  );
  // [R245] 這裡允許再補一輪 armies 迴圈，但只能作為「把敵軍（side B）也剔掉」的擴充，
  // 不能退化成「只靠 armies 建 away」。
  const aug = DR.indexOf('for (const army of GameState.armies())');
  assert.ok(aug > 0, '要補剔所有兵團（含敵軍）的將');
  assert.ok(
    DR.slice(Math.max(0, aug - 400), aug).includes('[R245]'),
    '這段擴充要帶 R245 註解，說明它是在 awayNameSet 之外補敵軍',
  );
  assert.ok(DR.includes('save.siege'), '註解要寫明 save.siege 這個來源');
  assert.ok(DR.includes('removeArmy'), '註解要寫明 removeArmy 造成的因果');
});

test('R234b 放棄攻城改派返程兵團（不再立刻退款回城）', () => {
  const gs = READ('cocos/assets/scripts/GameState.ts');
  assert.ok(gs.includes('export function pushReturnArmy'), 'GameState 要有 pushReturnArmy');
  // 返程兵團不能扣出發城的兵（那是 dispatchMarch 的語義）
  const fn = bodyOf(gs, 'export function pushReturnArmy');
  assert.ok(fn.includes('addArmy(army)'), '要 push 進 save.armies');
  assert.equal(fn.includes('state.troops ='), false, '返程不得改出發城兵（那是派兵語義）');
  assert.equal(fn.includes('deployMarch'), false, '返程不看 deployMarch 快照');

  const fn2 = bodyOf(DR, 'private abandonSiege');
  assert.ok(fn2.includes('pushReturnArmy'), 'abandonSiege 要改成派返程兵團');
  assert.equal(fn2.includes('refundSiegeTroops'), false, '不得再立刻退款回城（會讓將馬上又能編去打別城）');
  assert.ok(fn2.includes('clearDeploySiege'), '仍要清快照（避免戰前準備殘留）');
});

test('R237 攻城戰前準備先鎖人（不得先套存檔隊列再鎖）', () => {
  const at = DR.indexOf('this.generals = pool;');
  assert.ok(at > 0, '找不到候选池赋值');
  const siegeAt = DR.indexOf('if (this.siege) this.applySiegeRoster(byName);', at);
  const storedAt = DR.indexOf('const stored =', at);
  assert.ok(siegeAt > 0, '要在 start() 里调 applySiegeRoster');
  assert.ok(storedAt > 0, '找不到 stored');
  assert.ok(siegeAt < storedAt, 'applySiegeRoster 必须先于「存檔隊列」逻辑（否则中间抛错会留着城里的 5 个将）');
  // 存檔隊列/自動預選在攻城模式要被跳过
  assert.ok(DR.includes('if (!this.siege && stored && this.queue[0])'), 'stored 分支要加 !this.siege 守卫');
  assert.ok(DR.includes('else if (!this.siege && pool[0]'), '自动预选也要加 !this.siege 守卫');
});

test('R238 出征只派畫面上存在的將（隊列不得夾帶隱形舊名字）', () => {
  const marchAt = DR.indexOf('if (GameState.peekDeployMarch())');
  assert.ok(marchAt > 0, '找不到 march 出徵分支');
  const seg = DR.slice(marchAt, marchAt + 900);
  assert.ok(seg.includes('this.liveQueue()'), 'march() 的 officers 要用 liveQueue()');
  assert.equal(seg.includes('this.queue\n        .map((slot) => slot.general)'), false, '不要直接用 this.queue');
  assert.ok(DR.includes('private liveQueue(): DeployQueue[number][]'), '要有 liveQueue() 實作');
  // persistQueue 也要濾
  const pAt = DR.indexOf('private persistQueue');
  const pSeg = DR.slice(pAt, pAt + 600);
  assert.ok(pSeg.includes('this.liveQueue()'), 'persistQueue 要寫 liveQueue()');
});
