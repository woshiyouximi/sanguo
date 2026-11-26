/**
 * 戰後招降面板的**規則層**（Cocos 側，不 import `cc`、不碰 `sys.localStorage`）。
 *
 * 對應 web `game/web/campaign.html` 的 `surState / surCardHtml / renderSurrender /
 * decideSurrender / bulkSurrender / finishSurrender`（`:3444-3651`），以及規則層
 * `game/src/core/roster.ts` 的 `surrenderCandidates / needSurrenderPanel / applySurrender`
 * （Cocos 側鏡像在 `assets/scripts/core/roster.ts:527/572/595`）。
 *
 * 分工：
 *  - `core/roster.ts` 決定「哪些人能出卡、檔位是什麼、決策怎麼落庫」；
 *  - 本檔只把那份結果整理成**面板可以直接畫的視圖**（`SurrenderView`）與
 *    **面板可以直接執行的操作**（`decideOf / bulkOf / finishOf`）；
 *  - `SurrenderPanel.ts` 只負責節點與命中矩形，一個判定都不做。
 *
 * 為什麼要這一層：web 的 `surCardHtml()` 把「檔位 → 按鈕 disabled」「已決策 → 徽標」
 * 這些規則寫在字串模板裡，headless 驗不了。搬過來時把它們提成純函式，node 裡可以直接
 * 斷言（見 `work/cocos_surrender/model_assert.mjs`）。
 *
 * 三條硬門（與 web r86 一致，見 `project/120` 的 tier 矩陣）：
 *  1. `tier === 'refuse'` 或 `card.recruitable === false` 的卡，「招降」按鈕不可用；
 *     批量「剩餘全部招降」對這種卡只能**放走**（`escape`），不能繞過硬門去招；
 *  2. 君主卡（`isKing`）沒有按鈕，只能「逃走」；批量鍵對他一律寫 `escape`；
 *  3. 空名不生成卡（`surrenderCandidates()` 已經過濾，`viewOf()` 再兜一層）。
 */
import { garrisonOf } from './core/garrison';
import type { GarrisonData } from './core/garrison';
import {
  DEAD,
  ENEMY_HELD,
  RELEASED,
  applyAiDisposal,
  applySurrender,
  decideBattleWon,
  movedOf,
  needSurrenderPanel,
  noteGeneralResult,
  ourForceNames,
  planAiDisposal,
  readBattleOutcome,
  surrenderCandidates,
} from './core/roster';
import type {
  AiDisposalEntry,
  AiDisposalResult,
  BattleOutcome,
  SurrenderCard,
  SurrenderCardExtras,
  SurrenderDecision,
  SurrenderResult,
  SurrenderTier,
} from './core/roster';
import type { CampaignSave, GameData } from './types';

/* ------------------------------------------------------------------------- */
/* 文案（逐字對齊 web `campaign.html`，改文案時兩邊一起改）                    */
/* ------------------------------------------------------------------------- */

/** 面板標題：web `campaign.html:378` 的 `.ttl`。 */
export const PANEL_TITLE = '抓 到 敵 將';

/** 單卡三個按鈕：web `campaign.html:3541-3543`（注意 web 是三顆橫排，Cocos 同義）。 */
export type CardAction = 'recruit' | 'kill' | 'release';

/** 批量鍵的三檔：web `#surAllRecruit / #surAllKill / #surAllRelease`。 */
export type BulkMode = CardAction;

export const ACTION_TEXT: Record<CardAction, string> = {
  recruit: '招 降',
  kill: '斬 首',
  release: '釋 放',
};

/** web `campaign.html` 三個批量鍵的文案（`#surAllRecruit` 等）。 */
export const BULK_TEXT: Record<BulkMode, string> = {
  recruit: '剩餘全部招降',
  kill: '剩餘全部斬首',
  release: '剩餘全部釋放',
};

/** 已決策徽標：web `campaign.html:3444` 的 `SUR_PICK_TEXT`。 */
export const PICK_TEXT: Record<SurrenderDecision, string> = {
  recruit: '已 招 降',
  kill: '已 斬 首',
  escape: '已 放 走',
  release: '已 釋 放',
};

/** 未決策的君主行徽標（web `campaign.html:3538` 的 `逃 走`）。 */
export const KING_CHIP = '逃 走';

/* ------------------------------------------------------------------------- */
/* 視圖                                                                                                                                        */
/* ------------------------------------------------------------------------- */

/** 卡面上的一顆按鈕。`enabled === false` 時面板畫灰、不進命中矩形。 */
export interface CardButton {
  act: CardAction;
  text: string;
  enabled: boolean;
}

/**
 * 一張卡的**畫法**（面板只讀這個）。
 *
 * 欄位來源（`core/roster.ts` 的 `SurrenderCard`）：
 *  - `name/str/int/loyal/constancy` ← `:308-315`（`loyal` 是被俘當刻已扣的值）；
 *  - `tier/tierText` ← `:323-325`（`可 降 / 需 再 戰 / 拒 降`，君主 `逃 走`）；
 *  - `recruitable` ← `:327`（= `from === 'captured'`，**預判失敗的卡永遠不可招降**）；
 *  - `reason` ← `:329`（原作硬門原文，或 `本戰擲骰成功：成功率 …`）；
 *  - [R197] 等級/士氣/疲勞/武器/物品/勝場/敗場 ← `SurrenderCardExtras`，**存檔沒有
 *    就不填**（面板畫灰「—」），來源見 `core/roster.ts` 的 `surrenderCardExtras()`。
 */
export interface SurrenderView extends SurrenderCardExtras {
  name: string;
  str: number;
  int: number;
  loyal: number;
  constancy: number;
  isKing: boolean;
  tier: SurrenderTier;
  tierText: string;
  recruitable: boolean;
  reason: string;
  /** 這張卡從哪來（`captured` 預判成功 / `executed` 預判失敗被斬 / `king` 君主逃走） */
  from: SurrenderCard['from'];
  /** 卡面底色分類：君主 `king`，其餘就是檔位（web `campaign.html:3530` 的 `cls`） */
  cls: 'king' | SurrenderTier;
  /** 數值行：`武 90 · 智 80 · 忠誠 12 · 義理 5`（web `campaign.html:3550`） */
  stat: string;
  /** 已決策的處置；`null` = 待決 */
  pick: SurrenderDecision | null;
  /** 已決策徽標（`已 招 降` 等）；待決為空串 */
  pickText: string;
  /** 是否已決策（web 的 `sgen.done`） */
  done: boolean;
  /** 君主待決：只畫「逃 走」徽標，不給按鈕（web `campaign.html:3537-3538`） */
  escapeOnly: boolean;
  /** [R197] 這一輪是不是「真的打完仗」開的面板（web `surBattleReal`）：敗場數要現算這一場 */
  lossNow: boolean;
  /** 三顆按鈕（已決策 / 君主為空陣列） */
  buttons: CardButton[];
}

/** `contextOf()` 的可選覆蓋項：給了就不自己推。 */
export interface SurrenderCtxOpts {
  /** 該城守將名（決定哪個剧本君主出「逃走」卡）；不給就查 `garrison.json` */
  atCity?: readonly string[];
  /** 我方在職武將名；不給就從 `save.roster` 推 */
  mine?: readonly string[];
  /** 我方君主名；不給就讀 `save.monarch || save.king` */
  king?: string;
  /** `garrison.json` 的剧本下標（與 `CampaignRoot` 一致：`garrisonOf(data, 0, …)`） */
  scenIdx?: number;
  /**
   * [R197] 這批俘虜是不是「真的打完仗」來的（web `surBattleReal`）。
   * 缺省 `true`（真實路徑 `CampaignRoot` 就是戰後才開面板）；只有 hud/自檢那種
   * 手工 mock 的 state 會是 `false` —— 那時敗場數不現算，照舊畫「—」。
   */
  battle?: boolean;
  /**
   * [R208/R220] 這一仗我方是不是勝者。不給就從 `save.lastBattle` 推
   * （`decideBattleWon()`，含舊檔兜底）。`false` 時 `surrenderCandidates()` /
   * `needSurrenderPanel()` 两层硬門都關，`stateOf()` 永遠返回 `null`。
   */
  won?: boolean;
}

/**
 * 一次招降的上下文（= web 的 `openSurrenderSheet(cards, home)` 的兩個參數
 * ＋ `surrenderCandidates()` 的三個 opts）。
 */
export interface SurrenderCtx {
  save: CampaignSave;
  data: GameData;
  /** 招降入城的城名（web `st.home`） */
  home: string;
  atCity: string[];
  mine: string[];
  king: string;
  /** [R197] 這批俘虜是不是「真的打完仗」來的（決定敗場數要不要現算這一場） */
  battle?: boolean;
  /**
   * [R208/R220] 這一仗我方是不是勝者。`contextOf()` 不給 `opts.won` 時自己從
   * `save.lastBattle` 推（`readBattleOutcome()` + `decideBattleWon()` 兜底）。
   */
  won: boolean;
}

/** 面板的整個狀態：卡 + 已決策表（`picks`）+ 上下文。 */
export interface SurrenderState {
  ctx: SurrenderCtx;
  cards: SurrenderCard[];
  picks: Record<string, SurrenderDecision>;
  /** `finishOf()` 已經跑過（防重複落庫） */
  done: boolean;
}

/** 結算後的一條戰報（web `pushLog(text, kind)`）。 */
export interface SurrenderLogLine {
  kind: 'win' | 'lost' | 'info';
  text: string;
}

/** `finishOf()` 的產物：結果 + 戰報 + 提示文案 + 寫進存檔的 `lastPost`。 */
export interface SurrenderOutcome {
  result: SurrenderResult;
  /** web `campaign.html:3614` 的 `save.lastPost`（`CampaignSave` 沒有這個欄位，走索引簽名） */
  lastPost: Record<string, unknown>;
  /** 戰報行（順序與 web `:3626-3630` 一致） */
  logs: SurrenderLogLine[];
  /** 提示條文案：`戰 後 處 置完成：招降 1 · 斬首 1 · 釋放 1 · 放走 1` */
  text: string;
  /** `applySurrender()` 拋錯（web 側只 warn，不影響存檔） */
  failed: boolean;
  /** 拋錯時的訊息（`failed === true` 時有値） */
  error: string;
}

/* ------------------------------------------------------------------------- */
/* 小工具                                                                                                                                      */
/* ------------------------------------------------------------------------- */

function namesOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    // 空名 / 純空白一律不當名字（髒檔裡 `captured: ['']` 不該長出空卡）
    const name = String(item ?? '').trim();
    if (name) out.push(name);
  }
  return out;
}

function boxOf(save: CampaignSave): Record<string, unknown> {
  return save as unknown as Record<string, unknown>;
}

/** 只在邊界用一次：`CampaignRoot.save`（`GameState.CampaignSave`）→ 規則層的寬鬆型。 */
export function saveOf(raw: object): CampaignSave {
  return raw as unknown as CampaignSave;
}

/** `save.roster`（`Record<string, string[]>` + `_moved`），形狀壞了返回空物件。 */
function rosterBox(save: CampaignSave): Record<string, unknown> {
  const box = boxOf(save);
  const roster = box.roster;
  return roster && typeof roster === 'object' ? (roster as Record<string, unknown>) : {};
}

/** 我方君主名：web `campaign.html:3391` 的 `String(save.monarch || save.king || '')`。 */
export function kingOf(save: CampaignSave): string {
  const box = boxOf(save);
  return String(box.monarch || box.king || '');
}

/**
 * 「我方在職武將」的近似值：`save.roster` 裡**屬於我方城**、且 `_moved` 沒把他派走的名字。
 *
 * web 的 `myGeneralNames()`（`campaign.html`）走的是 `city_model.rosterOf()` 疊全部城，
 * 這裡不去 import `CityModel`（那會把整個內政層拖進 headless 產物），只用同一份
 * `save.roster` + `_moved` 口徑。用途只有一個：與同名俘虜區分「這是我方自己人被俘」，
 * 所以「寧可多算我方、不要漏算」——漏算會讓自家將領出現在招降卡上。
 */
export function myNamesOf(save: CampaignSave): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const box = boxOf(save);
  const owned = new Set(namesOf(box.owned));
  const roster = rosterBox(save);
  const moved = movedOf(save);

  const isMineCity = (city: string): boolean => owned.size === 0 || owned.has(city);

  for (const city of Object.keys(roster)) {
    if (city === '_moved' || !isMineCity(city)) continue;
    const list = namesOf(roster[city]);
    for (const name of list) {
      if (seen.has(name)) continue;
      const at = moved[name];
      // 已調動到別城 / 已斬首 / 已釋放 → 不算在職
      if (at && at !== city) continue;
      seen.add(name);
      out.push(name);
    }
  }
  for (const name of Object.keys(moved)) {
    if (seen.has(name)) continue;
    const city = moved[name];
    // [R220] `敵軍` 也是"不在我方"的哨兵（R208 胜者门引入），不能算在職
    if (!city || city === DEAD || city === RELEASED || city === ENEMY_HELD) continue;
    if (!isMineCity(city)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

/** 某座城的守將名（`garrison.json`）；沒有資料就是空陣列。 */
export function officersAt(data: GameData, city: string, scenIdx = 0): string[] {
  const garrison = garrisonOf(data as GarrisonData, scenIdx, String(city ?? ''));
  if (!garrison || !Array.isArray(garrison.officers)) return [];
  const out: string[] = [];
  for (const officer of garrison.officers) {
    const name = String(officer?.name ?? '');
    if (name) out.push(name);
  }
  return out;
}

/* ------------------------------------------------------------------------- */
/* 建上下文 / 開面板                                                          */
/* ------------------------------------------------------------------------- */

/**
 * 從存檔 + 資料 + 回城名推出一整份上下文（web `campaign.html:3390-3400` 那六行）。
 *
 * 之所以把 `atCity / mine / king` 的推導放在這裡、而不是留給呼叫方：`CampaignRoot`
 * 只有 3 行預算（不能改檔），必須一行 `SurrenderPanel.showIfNeeded(node, {save, data, home})`
 * 就能開起來。
 */
export function contextOf(
  save: CampaignSave,
  data: GameData,
  home: string,
  opts: SurrenderCtxOpts = {},
): SurrenderCtx {
  const city = String(home ?? '');
  // [R208/R220] 勝者門：沒顯式給 won 就自己判（web `decideBattleWon(save, outcome)`）。
  // 舊檔沒有 `lastBattle` 時走 core 的兜底推斷（丟城 / 俘將裡有明確我方的人 → 敗）。
  const won = opts.won !== undefined ? opts.won === true : decideBattleWon(save);
  return {
    save,
    data,
    home: city,
    atCity: opts.atCity ? namesOf(opts.atCity) : officersAt(data, city, opts.scenIdx ?? 0),
    mine: opts.mine ? namesOf(opts.mine) : myNamesOf(save),
    king: opts.king !== undefined ? String(opts.king ?? '') : kingOf(save),
    // [R197] 真實路徑默認「戰後」（web `surBattleReal`）；顯式 false 才關（自檢用）
    battle: opts.battle !== false,
    won,
  };
}

/** 建狀態；**沒有卡就返回 `null`**（= web 的 `needSurrenderPanel()` 判斷）。 */
export function stateOf(ctx: SurrenderCtx): SurrenderState | null {
  const raw = surrenderCandidates(ctx.save, ctx.data, {
    atCity: ctx.atCity,
    mine: ctx.mine,
    king: ctx.king,
    // [R208] 勝者門：敗方一张卡都不出（core 側再兜一層，面板層不重複判斷）
    won: ctx.won,
  });
  // 規則層不做空名校驗（`nameListOf` 只過濾 falsy），面板這一層把純空白名擋掉：
  // 「空名不生成卡」是面板的責任，髒檔不該畫出一張沒有名字的卡。
  const cards = raw.filter((card) => String(card?.name ?? '').trim() !== '');
  if (!needSurrenderPanel(cards, { won: ctx.won })) return null;
  return { ctx, cards, picks: {}, done: false };
}

/** 開面板的便捷入口：給 `surrenderCandidates()` 的 opts，回狀態或 `null`。 */
export function openOf(
  save: CampaignSave,
  data: GameData,
  home: string,
  opts: SurrenderCtxOpts = {},
): SurrenderState | null {
  return stateOf(contextOf(save, data, home, opts));
}

/* ------------------------------------------------------------------------- */
/* 查詢                                                                                                                                        */
/* ------------------------------------------------------------------------- */

export function findCard(state: SurrenderState, name: string): SurrenderCard | null {
  const key = String(name ?? '');
  if (!key) return null;
  for (const card of state.cards) if (card.name === key) return card;
  return null;
}

/** 還沒決策的卡（web `renderSurrender()` 的 `left`）。 */
export function pendingOf(state: SurrenderState): SurrenderCard[] {
  const out: SurrenderCard[] = [];
  for (const card of state.cards) if (!state.picks[card.name]) out.push(card);
  return out;
}

/** 待決張數（web `campaign.html:3563` 的 `left`）。 */
export function leftOf(state: SurrenderState): number {
  return pendingOf(state).length;
}

/** 全部決策完（web `campaign.html:3586` 的 `cards.every(c => picks[c.name])`）。 */
export function allDecided(state: SurrenderState): boolean {
  return state.cards.length > 0 && pendingOf(state).length === 0;
}

/** 頭部副標：web `campaign.html:3574`。 */
export function subText(state: SurrenderState): string {
  return `逐將詢問：招降的進 ${state.ctx.home} 武將池，斬首的出池永不復活，釋放的放回原勢力`;
}

/** 底部提示：web `campaign.html:3564-3566`。 */
export function footText(state: SurrenderState): string {
  const left = leftOf(state);
  if (!left) return '處理完畢';
  return `剩 ${left} 位待決：招降進 ${state.ctx.home}，斬首出池永不復活，釋放回原勢力`;
}

/** 批量鍵能不能點：web `campaign.html:3567-3569` 的 `disabled = !left`。 */
export function bulkEnabled(state: SurrenderState): boolean {
  return !state.done && leftOf(state) > 0;
}

function statLine(card: SurrenderCard): string {
  // web 用 `c.str || '—'`：0 或缺欄位都畫「—」，不要畫成 0（原作 0 武力不存在）
  const str = card.str ? String(card.str) : '—';
  const int = card.int ? String(card.int) : '—';
  return `武 ${str} · 智 ${int} · 忠誠 ${card.loyal} · 義理 ${card.constancy}`;
}

/** 一張卡的畫法（`name` 不存在返回 `null`；空名不生成卡）。 */
export function viewOf(state: SurrenderState, name: string): SurrenderView | null {
  const card = findCard(state, name);
  if (!card || !card.name) return null;
  const pick = state.picks[card.name] ?? null;
  const done = pick !== null;
  const king = card.isKing === true;
  const buttons: CardButton[] = [];
  if (!done && !king) {
    // 招降：`recruitable === false`（拒降檔 / 預判失敗 / 君主）→ 灰掉，web 用 `disabled`
    buttons.push({ act: 'recruit', text: ACTION_TEXT.recruit, enabled: card.recruitable === true });
    buttons.push({ act: 'kill', text: ACTION_TEXT.kill, enabled: true });
    buttons.push({ act: 'release', text: ACTION_TEXT.release, enabled: true });
  }
  return {
    name: card.name,
    str: card.str,
    int: card.int,
    loyal: card.loyal,
    constancy: card.constancy,
    isKing: king,
    tier: card.tier,
    tierText: card.tierText,
    recruitable: card.recruitable === true,
    reason: card.reason,
    from: card.from,
    cls: king ? 'king' : card.tier,
    stat: statLine(card),
    pick,
    pickText: pick ? PICK_TEXT[pick] : '',
    done,
    escapeOnly: king && !done,
    // [R197] 十欄真值（存檔沒有就不填 → 面板畫「—」）+ 「這一場算不算敗」
    level: card.level,
    morale: card.morale,
    tire: card.tire,
    wins: card.wins,
    losses: card.losses,
    weapon: card.weapon,
    item: card.item,
    lossNow: state.ctx.battle === true,
    buttons,
  };
}

/** 全部卡的畫法（順序與 `state.cards` 一致）。 */
export function viewsOf(state: SurrenderState): SurrenderView[] {
  const out: SurrenderView[] = [];
  for (const card of state.cards) {
    const view = viewOf(state, card.name);
    if (view) out.push(view);
  }
  return out;
}

/* ------------------------------------------------------------------------- */
/* 操作                                                                                                                                        */
/* ------------------------------------------------------------------------- */

/**
 * 逐將決策（web `decideSurrender(name, act)`，`campaign.html:3582`）。
 *
 * @returns 是否寫入（`false` = 卡不存在 / 已決策 / 君主 / 這顆按鈕本來就不該亮）
 *
 * 與 web 的差別只有一點：web 的 disabled 按鈕靠 DOM 擋，這裡**再擋一次**
 * （拒降檔的 `recruit` 直接拒收）。真正的硬門仍在 `applySurrender()` 裡，
 * 這裡只是不要讓面板顯示出「已招降」卻沒進池。
 */
export function decideOf(state: SurrenderState, name: string, act: CardAction): boolean {
  if (state.done) return false;
  const card = findCard(state, name);
  if (!card || !card.name) return false;
  if (state.picks[card.name]) return false;
  if (card.isKing) return false; // 君主只能靠批量鍵「放走」
  if (act === 'recruit' && card.recruitable !== true) return false;
  state.picks[card.name] = act;
  return true;
}

/**
 * 批量決策（web `bulkSurrender(mode)`，`campaign.html:3589`）。
 *
 * **r86 缺陷的修法**（`project/86` 查出來的）：拒絕檔點「剩餘全部招降」不能繞過硬門——
 * 這裡逐張看 `card.recruitable`，不可招降的一律寫 `escape`（放走），君主同樣 `escape`。
 *
 * @returns 本次寫入的名字（已決策的跳過，與 web 一致）
 */
export function bulkOf(mode: BulkMode, state: SurrenderState): string[] {
  const picked: string[] = [];
  if (state.done) return picked;
  for (const card of state.cards) {
    if (state.picks[card.name]) continue;
    if (card.isKing) {
      state.picks[card.name] = 'escape';
    } else if (mode === 'recruit') {
      state.picks[card.name] = card.recruitable === true ? 'recruit' : 'escape';
    } else if (mode === 'release') {
      state.picks[card.name] = 'release';
    } else {
      state.picks[card.name] = 'kill';
    }
    picked.push(card.name);
  }
  return picked;
}

/** 未決策的卡補什麼處置（僅供測試/報告算「會被放走幾人」，不改狀態）。 */
export function wouldEscape(state: SurrenderState, mode: BulkMode): string[] {
  const out: string[] = [];
  for (const card of pendingOf(state)) {
    if (card.isKing) out.push(card.name);
    else if (mode === 'recruit' && card.recruitable !== true) out.push(card.name);
  }
  return out;
}

/* ------------------------------------------------------------------------- */
/* 落庫                                                                                                                                        */
/* ------------------------------------------------------------------------- */

function bitsOf(result: SurrenderResult): string[] {
  const bits: string[] = [];
  if (result.recruited.length) bits.push(`招降 ${result.recruited.length}`);
  if (result.killed.length) bits.push(`斬首 ${result.killed.length}`);
  if (result.released.length) bits.push(`釋放 ${result.released.length}`);
  if (result.escaped.length) bits.push(`放走 ${result.escaped.length}`);
  return bits;
}

function logsOf(result: SurrenderResult, home: string): SurrenderLogLine[] {
  const logs: SurrenderLogLine[] = [];
  // 五行順序與文案照 web `campaign.html:3626-3630`
  if (result.recruited.length) {
    logs.push({ kind: 'win', text: `戰 後 處 置：招降 ${result.recruited.join('、')} 入 ${home}` });
  }
  if (result.killed.length) {
    logs.push({ kind: 'lost', text: `戰 後 處 置：斬首 ${result.killed.join('、')}（出池，永不復活）` });
  }
  if (result.released.length) {
    logs.push({ kind: 'info', text: `釋放：${result.released.join('、')}（${result.released.length} 人）` });
  }
  if (result.rejected.length) {
    logs.push({ kind: 'info', text: `拒 降（硬門）：${result.rejected.join('、')} 只放走，不入池` });
  }
  if (result.escaped.length) {
    logs.push({ kind: 'info', text: `戰 後 處 置：放走 ${result.escaped.join('、')}` });
  }
  return logs;
}

function emptyResult(): SurrenderResult {
  return {
    recruited: [],
    killed: [],
    removed: [],
    escaped: [],
    released: [],
    rejected: [],
    cleared: [],
  };
}

function numOf(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * 決策落庫（web `finishSurrender()`，`campaign.html:3603`）。
 *
 * 做五件事，全部只改記憶體裡的 `save`，**不寫 localStorage**（由呼叫方
 * `GameState.persistSave()`；web 對應 `autosave()`）：
 *  1. `applySurrender(save, cards, picks, home)`（缺 pick 的卡不動）；
 *  2. 寫 `save.lastPost`（web `:3614`，欄位名逐字一致）；
 *  3. [R197] 每張卡記一場敗（`save.generalRecord`，web `:5087-5095`）；
 *  4. 產五行戰報給你 push；
 *  5. 產提示條文案（web `:3635-3640`）。
 *
 * 已結算過（`state.done`）或沒有卡 → `null`（**冪等**：重複呼叫不會二次落庫）。
 */
export function finishOf(state: SurrenderState): SurrenderOutcome | null {
  if (state.done) return null;
  if (!state.cards.length) return null;
  state.done = true;

  let result = emptyResult();
  let failed = false;
  let error = '';
  try {
    result = applySurrender(state.ctx.save, state.cards, state.picks, state.ctx.home);
  } catch (err) {
    // web 側也是只 warn：「戰後招降結算失敗（不影響存檔）」
    failed = true;
    error = err instanceof Error ? err.message : String(err);
    console.warn(`[SurrenderModel] 戰後招降結算失敗（不影響存檔）：${error}`);
  }

  const joinedAll: string[] = [];
  for (const card of state.cards) {
    if (state.picks[card.name] === 'recruit') joinedAll.push(card.name);
  }
  const box = boxOf(state.ctx.save);
  const lastPost: Record<string, unknown> = {
    city: state.ctx.home,
    joined: result.recruited,
    dead: result.removed,
    joinedAll,
    deadAll: result.killed,
    escaped: result.escaped,
    released: result.released,
    rejected: result.rejected,
    month: numOf(box.month),
    ts: Date.now(),
  };
  box.lastPost = lastPost;

  // [R197] 戰績落帳：web `finishSurrender()`（`campaign.html:5087-5095`）對**每一張卡**
  // 記一場敗（`Saves.noteGeneralResult(save, c.name, false)`），寫的是 `save.generalRecord`
  // —— 原作 `general+0xA1` 的敗場就是在戰後處置時累加的。只在「真的打完仗」時記
  // （`ctx.battle`；hud 那種手工 mock 的 state 沒這個旗標，不會污染存檔）。
  // 落帳發生在面板渲染之後：所以面板上顯示的是 `rec.l + 1`（見 `surFieldCells()`）。
  if (state.ctx.battle === true) {
    for (const card of state.cards) noteGeneralResult(state.ctx.save, card.name, false);
  }

  const bits = bitsOf(result);
  return {
    result,
    lastPost,
    logs: logsOf(result, state.ctx.home),
    text: bits.length ? `戰 後 處 置完成：${bits.join(' · ')}` : '戰 後 處 置完成',
    failed,
    error,
  };
}

/* ------------------------------------------------------------------------- */
/* 戰後寫回（補 Cocos 側的缺口）                                              */
/* ------------------------------------------------------------------------- */

/** 一場戰鬥的「被俘 / 被斬」清單（`core/capture.ts` 的 `PostBattleReport` 子集）。 */
export interface PostBattleLike {
  captures?: readonly { name?: unknown; recruited?: unknown }[];
  executed?: readonly { name?: unknown }[];
}

/**
 * 把戰鬥結算的俘虜寫回 `save.captured` / `save.executed`（web `main.js:845-853`）。
 *
 * **這是 Cocos 側目前缺的一環**：`BattleRoot.ts:172-184` 只把 `settlement.record`
 * （`record` 記分）交給 `GameState.recordBattleResult()`，`post.captures/executed`
 * 從來沒寫進存檔，所以 `surrenderCandidates()` 永遠拿到空名單、面板永遠不彈。
 * 接法見 `project/120` 的補丁 B（`BattleRoot` 兩行）。
 *
 * 語義與 web 一致：**所有俘虜**（不論戰場預判成敗）都進 `captured`，逐將檔位留到面板
 * 再算（`surrenderCandidates()` 會用 `capture.recruitChanceOf` 重算 `tier`）；
 * 戰場上被斬的進 `executed`。兩邊都去重、不改其他鍵。
 *
 * 為什麼不能只收 `recruited === true`：節操 ≥3 且原勢力健在的守將在 `settle()` 裡恒判
 * 「寧死不降」⇒ `recruited` 恒 false ⇒ 清單恒空 ⇒ 面板永不彈（`project/132` 的 P1）。
 */
export function queuePostBattle(save: CampaignSave, post: PostBattleLike | null | undefined): string[] {
  const box = boxOf(save);
  const captured = namesOf(box.captured);
  const executed = namesOf(box.executed);
  const seenCap = new Set(captured);
  const seenDead = new Set(executed);
  const added: string[] = [];
  const captures = post?.captures ?? [];
  for (const item of captures) {
    const name = String(item?.name ?? '');
    if (!name) continue;
    if (seenCap.has(name)) continue;
    seenCap.add(name);
    captured.push(name);
    added.push(name);
  }
  const kills = post?.executed ?? [];
  for (const item of kills) {
    const name = String(item?.name ?? '');
    if (!name || seenDead.has(name)) continue;
    seenDead.add(name);
    executed.push(name);
    added.push(name);
  }
  box.captured = captured;
  box.executed = executed;
  return added;
}

/** 面板要不要彈（`needSurrenderPanel()` 的名字層轉發，方便呼叫方少 import 一個檔）。 */
export function hasPending(save: CampaignSave): boolean {
  const box = boxOf(save);
  return namesOf(box.captured).length > 0 || namesOf(box.executed).length > 0;
}

/* ------------------------------------------------------------------------- */
/* [R208/R220] 勝者門：戰後俘虜處置「該開面板還是由敵方 AI 處置」                 */
/* ------------------------------------------------------------------------- */

/** `resolveCaptureFlow()` 的可選覆蓋項：`home` 不給就從存檔推（對齊 web 的 home 推斷）。 */
export interface CaptureFlowOpts extends SurrenderCtxOpts {
  /** 招降入城 / 戰報城名（web `st.home`）；不給就用 `lastBattle.city → save.last → owned[0]` */
  home?: string;
}

/** 我方戰敗時敵方 AI 對我軍俘將的處置（= `core/roster.ts` 的 `AiDisposalEntry`）。 */
export type CaptureDisposal = AiDisposalEntry;

/**
 * 戰後俘虜處置的「該開什麼」結論（`resolveCaptureFlow()` 的返回值）。
 *
 * 這一個函式就是 UI 需要的全部門；`CampaignRoot` 不用再自己判 `hasPendingCaptures()`：
 *  - `open === true` → 走 `SurrenderPanel.showIfNeeded(...)`（勝者才有處置權）；
 *  - `open === false && reason === 'lost'` → 敵方 AI 已處置完、`save` 已落庫，
 *    把 `logs` 逐條寫進戰報、`notice` 進提示條、`GameState.persistSave()` 即可；
 *  - `reason === 'none'` → 這一仗沒有俘虜可处置（待決隊列空 / 已處置過 / 卡被規則層清空）。
 *
 * 副作用（全部只改記憶體裡的 `save`，冪等）：
 *  - 敗方：`applyAiDisposal()` 落庫（勸降 → `_moved='敵軍'`；斬首/陣亡 → 出池；
 *    釋放 → 名單不動）、清 `save.captured` / `save.executed` 的已處置名、
 *    寫 `save.lastPost`（`ai:true` + `battleTs`，同一場不重複處置）；
 *  - 勝方：把「我方被誤寫進待決隊列」的人摘掉並記一條戰報；待決隊列空/無卡 → `lastPost=null`。
 */
export interface CaptureFlow {
  /** 要不要開招降面板（**只有我方勝、且有卡**才 true） */
  open: boolean;
  /** 勝方要处置的俘虜卡（`open === false` 時為空陣列） */
  cards: SurrenderCard[];
  /** 敗方：敵方 AI 的處置計劃（`open === false` 且 `reason === 'lost'` 時非空） */
  aiDisposal: CaptureDisposal[];
  /** `won` 勝方開面板 / `lost` 敗方 AI 處置 / `none` 無事可做 */
  reason: 'won' | 'lost' | 'none';
  /** 招降入城 / 戰報城名 */
  home: string;
  /** 這一仗我方是否勝（`opts.won` 優先，否則 `decideBattleWon()`） */
  won: boolean;
  /** 讀到的 `save.lastBattle`（舊檔沒有就 null） */
  outcome: BattleOutcome | null;
  /** 敗方 `applyAiDisposal()` 的結果（勝方/無事時 null） */
  aiResult: AiDisposalResult | null;
  /** 勝方可直接交給 `SurrenderPanel.show(node, opts, state)` 的狀態（免重算） */
  state: SurrenderState | null;
  /** 要 push 進戰報的行（內容與 web `campaign.html:4897-4986` 逐字對齊） */
  logs: SurrenderLogLine[];
  /** 提示條文案：`我軍戰敗：敵軍處置我軍俘將（勸降 1 · 斬首 1）`；勝方/無事為空串 */
  notice: string;
  /** 本次寫進 `save.lastPost` 的物件（勝方未結算 / 無事時 null） */
  lastPost: Record<string, unknown> | null;
}

/** 去重 + 去空名（保持先出現的順序；web 的 `uniqNames()`）。 */
function uniqOf(names: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of names) {
    const name = String(raw ?? '').trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

/** web 的 `home` 推斷（`campaign.html:4882-4886`）：`lastBattle.city → save.last → owned[0]`。 */
function homeOf(save: CampaignSave, outcome: BattleOutcome | null, given?: string): string {
  const forced = String(given ?? '');
  if (forced) return forced;
  const box = boxOf(save);
  const cities = (box.cities && typeof box.cities === 'object' ? box.cities : {}) as Record<string, unknown>;
  const bCity = outcome && outcome.city && cities[outcome.city] ? outcome.city : '';
  const last = typeof box.last === 'string' && cities[box.last] ? box.last : '';
  const owned = namesOf(box.owned);
  return bCity || last || owned[0] || '';
}

/** 敗方 AI 處置的戰報文案（web `campaign.html:4955-4961` 的 `verdict` 逐字）。 */
const DISPOSAL_TEXT: Record<AiDisposalEntry['action'], string> = {
  recruit: '勸降，已轉投敵營',
  execute: '斬首',
  dead: '所殺，陣亡',
  release: '釋放，已回本城',
};

/**
 * 戰後俘虜處置的唯一入口：**先判勝負，再決定「開面板」還是「敵方 AI 處置」**。
 *
 * 這是 F-01 的 Cocos 側模型層（web 對應 `settleBattleReturn()` / `aiDisposeCaptives()`，
 * `game/web/campaign.html:4874-4988`）。UI 只調這一個函式，判定全部在可測層：
 *
 *   我方勝 + 待決隊列非空 → `{ open: true, cards: 非空, reason: 'won' }`
 *   我方敗 + 有可處置的我方將 → `{ open: false, aiDisposal: 非空, reason: 'lost' }`
 *                                             （`save` 已落庫，`logs`/`notice` 直接拿去顯示）
 *   其餘（平手/無戰果/隊列空/已處置過/卡被硬門清空）→ `{ reason: 'none' }`
 *
 * 關鍵回歸（用戶實機 P0）：我方戰敗時 `cards` 永遠是空 —— 我方被俘將只會出現在
 * `aiDisposal` 裡由敵方處置，玩家不會再看到「自己處置自己人被俘」的面板。
 */
export function resolveCaptureFlow(
  save: CampaignSave,
  data: GameData,
  opts: CaptureFlowOpts = {},
): CaptureFlow {
  const box = boxOf(save);
  const outcome = readBattleOutcome(save);
  const won = opts.won !== undefined ? opts.won === true : decideBattleWon(save, outcome);
  const home = homeOf(save, outcome, opts.home);
  const ctx = contextOf(save, data, home, {
    atCity: opts.atCity,
    mine: opts.mine,
    king: opts.king,
    scenIdx: opts.scenIdx,
    battle: opts.battle,
    won,
  });
  const base: CaptureFlow = {
    open: false,
    cards: [],
    aiDisposal: [],
    reason: 'none',
    home,
    won,
    outcome,
    aiResult: null,
    state: null,
    logs: [],
    notice: '',
    lastPost: null,
  };

  // 冪等門（web `campaign.html:4888-4889`）：同一場戰鬥的敵方 AI 處置只做一次，
  // 否則每次回大地圖都會重複寫戰報/重複彈提示。
  const rawPost = box.lastPost;
  const prev =
    rawPost && typeof rawPost === 'object' && !Array.isArray(rawPost)
      ? (rawPost as Record<string, unknown>)
      : null;
  if (outcome && outcome.ts > 0 && prev && prev.ai === true && numOf(prev.battleTs) === outcome.ts) {
    return { ...base, lastPost: prev };
  }

  const king = ctx.king;
  // 「明確屬於我方」的名單：面板層自己推的 + core 的 roster 口徑 + 君主（與 web 一致）
  const own = new Set<string>(ctx.mine);
  for (const name of ourForceNames(save)) own.add(name);
  if (king) own.add(king);

  if (!won) {
    // 我方敗：把「應被俘 / 應被斬」的我方將交給敵方 AI —— 沿用戰鬥頁已判結果、不重擲骰。
    const joined = uniqOf(namesOf(box.captured).concat(outcome ? outcome.captured : [])).filter(
      (n) => n !== king,
    );
    const executed = uniqOf(namesOf(box.executed).concat(outcome ? outcome.executed : [])).filter(
      (n) => n !== king,
    );
    const fallen = uniqOf(outcome ? outcome.dead : []);
    const plan = planAiDisposal({ captured: joined, executed, dead: fallen, king });
    if (!plan.length) {
      // 沒有可處置的人：清掉舊的待決提示（web 同款），不寫 lastPost
      box.lastPost = null;
      return base;
    }
    const aiResult = applyAiDisposal(save, plan);
    // 已處置的人從待決隊列摘掉，否則下一次進大地圖又會被當成"新的俘虜"
    const disposed = new Set(plan.map((entry) => entry.name));
    box.captured = namesOf(box.captured).filter((n) => !disposed.has(n));
    box.executed = namesOf(box.executed).filter((n) => !disposed.has(n));

    const logs: SurrenderLogLine[] = [];
    // `battle !== false` 才是真打完仗的結算（自檢/探針不污染 `save.generalRecord`）
    const real = opts.battle !== false;
    for (const entry of plan) {
      logs.push({ kind: 'lost', text: `戰 報：（我方）${entry.name} 被敵軍${DISPOSAL_TEXT[entry.action] ?? '處置'}` });
      if (real) noteGeneralResult(save, entry.name, false);
    }
    const lastPost: Record<string, unknown> = {
      city: home,
      joined: [],
      dead: aiResult.executed.concat(aiResult.dead),
      joinedAll: [],
      deadAll: plan.filter((entry) => entry.action !== 'recruit').map((entry) => entry.name),
      escaped: [],
      released: aiResult.released,
      rejected: [],
      month: numOf(box.month),
      ts: numOf(box.ts),
      ai: true,
      battleTs: outcome ? outcome.ts : 0,
      aiRecruited: aiResult.recruited,
      aiReleased: aiResult.released,
    };
    box.lastPost = lastPost;

    const bits: string[] = [];
    if (aiResult.recruited.length) bits.push(`勸降 ${aiResult.recruited.length}`);
    if (aiResult.executed.length) bits.push(`斬首 ${aiResult.executed.length}`);
    if (aiResult.dead.length) bits.push(`陣亡 ${aiResult.dead.length}`);
    if (aiResult.released.length) bits.push(`釋放 ${aiResult.released.length}`);
    const notice = bits.length
      ? `我軍戰敗：敵軍處置我軍俘將（${bits.join(' · ')}）`
      : '我軍戰敗：敵軍處置我軍俘將';
    return { ...base, aiDisposal: plan, reason: 'lost', aiResult, logs, notice, lastPost };
  }

  // 我方勝：先把我方被誤寫進待決隊列的人摘掉（web `campaign.html:4897-4902`）
  const pending = namesOf(box.captured).filter((n) => n !== king);
  const doomed = namesOf(box.executed).filter((n) => n !== king);
  const oursHeld = uniqOf(pending.concat(doomed).filter((n) => own.has(n)));
  const logs: SurrenderLogLine[] = [];
  if (oursHeld.length) {
    const dropped = new Set(oursHeld);
    box.captured = namesOf(box.captured).filter((n) => !dropped.has(n));
    box.executed = namesOf(box.executed).filter((n) => !dropped.has(n));
    logs.push({
      kind: 'lost',
      text: `戰 報：（我方）${oursHeld.join('、')} 被敵軍俘去，本城名單不變`,
    });
  }
  if (!namesOf(box.captured).length && !namesOf(box.executed).length) {
    // 隊列空：沒有俘虜可处置 → 不彈面板，清掉舊提示（web 同款）
    box.lastPost = null;
    return { ...base, logs };
  }

  // 勝者才有處置權：這裡 cards 只會是敵方將（`own` 集合裡的人一律剔掉 —— 關鍵回歸）
  const candidates = surrenderCandidates(save, data, {
    atCity: ctx.atCity,
    mine: Array.from(own),
    king,
    won,
  });
  const cards = candidates.filter(
    (card) => String(card?.name ?? '').trim() !== '' && !own.has(String(card?.name ?? '')),
  );
  if (!needSurrenderPanel(cards, { won })) {
    box.lastPost = null;
    return { ...base, logs };
  }
  const state: SurrenderState = { ctx: { ...ctx, won }, cards, picks: {}, done: false };
  return { ...base, open: true, cards, reason: 'won', state, logs };
}
