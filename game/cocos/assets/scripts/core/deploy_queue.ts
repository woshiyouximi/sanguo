/**
 * 出陣隊列 —— 戰役編成層的「5 個武將槽」。
 *
 * 為什麼需要這一層：原作軍師技 `3 後選出陣`（分支 `Execute 34`）的 `0x44DE44` 只有一句
 * 「成功」日誌、零狀態寫入（`work/dis_battle_B_44D450.txt:763`）；`ATTRIB=1` 表明它是
 * **戰前選擇**類（`docs/03a-武将技表MAGIC.md:297`），真實語義是「使用方在敵方之後選將/兵種」
 * （`project/109` §5.3）。這件事不發生在戰場裏，而發生在**部隊編成**：
 * `docs/07b_存档字段详解.md` §6 的 Obj3 部隊池是 128 × 0x6C，每隊固定 5 個武將槽
 * （`+0x010 / +0x014 / +0x018 / +0x01C / +0x020` = u32 Idx(General*)），槽序即出陣序。
 *
 * 本檔案只做**純邏輯**：不碰 DOM、不碰 localStorage、不 import `battle.ts`，
 * 所以三個消費端共用同一份 ——
 *   · `game/web/deploy.html`（瀏覽器實測）、
 *   · `game/cocos/assets/scripts/DeployRoot.ts`（同步副本，`work/cocos_sync/sync_core3.mjs`）、
 *   · `game/tests/deploy_queue.test.ts`（node）。
 *
 * 槽位語義（對照原作 5 槽）：
 *   · 最多 `DEPLOY_SLOTS` = 5 槽，**順序即出陣順序**；前 `DEPLOY_FIELD_SLOTS` = 3 槽是
 *     「上陣」，其餘 2 槽預備 —— 後選出陣允許在敵方確定之後重排的就是前 3 槽。
 *   · 每槽 `{ general, troop, troops }`：武將名（`generals.json` 的 NAME）、兵種單字
 *     （原作 `UseForce` 的 刀/槍/弓/…）、帶兵數（1..100，與 `troopCapOf()` 同上限）。
 *
 * 序列化：存檔裡是**可選字段** `save.deployQueue`（`game/web/saves.js` v3，見該檔 §6b
 * 的可選字段約定）。缺字段/壞字段時 `queueOf(save, 當前 5 將)` 用當前出戰武將即時生成，
 * 所以舊檔不需要任何遷移跳（不進 `SNAPSHOT_REQUIRED`、不升 v4）。
 */

/** 每方最多 5 個武將槽（原作 Obj3 部隊池，docs/07b §6）。 */
export const DEPLOY_SLOTS = 5;

/** 前 3 槽「上陣」，後 2 槽預備；後選出陣只重排這 3 槽。 */
export const DEPLOY_FIELD_SLOTS = 3;

/** 沒給兵種時的缺省值：朴刀（原作兵種表下標 0，`TROOP_BY_CHAR.刀`）。 */
export const DEFAULT_TROOP = '刀';

/** 沒給兵力時的缺省值（= 原作武將帶兵上限的滿值，`troopCapOf()` 上限也是 100）。 */
export const DEFAULT_TROOPS = 100;

/** 一側的一個出陣槽。`general` 是 `generals.json` 的 NAME，不是下標。 */
export interface DeploySlot {
  general: string;
  /** 兵種單字（刀/槍/弓/…），空字串按缺省值補 */
  troop: string;
  /** 帶兵數 1..100 */
  troops: number;
}

/** 一側的出陣隊列：0..5 槽，順序即出陣順序。 */
export type DeployQueue = DeploySlot[];

/** 存檔側只需要這一個可選字段；其餘鍵一概不看、不動。 */
export interface DeployQueueSave {
  deployQueue?: unknown;
}

function clampInt(value: unknown, lo: number, hi: number, fallback: number): number {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, n));
}

function cleanName(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function cleanTroop(value: unknown): string {
  const s = cleanName(value);
  return s.length > 0 ? s : DEFAULT_TROOP;
}

/** 單槽正規化：字符串按「武將名」理解（給 `?dq=張飛,關羽` 這種簡寫）；其餘壞值 → null。 */
function normalizeSlot(raw: unknown): DeploySlot | null {
  if (typeof raw === 'string') {
    const name = cleanName(raw);
    return name ? { general: name, troop: DEFAULT_TROOP, troops: DEFAULT_TROOPS } : null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const general = cleanName(row.general);
  if (!general) return null;
  return {
    general,
    troop: cleanTroop(row.troop),
    troops: clampInt(row.troops, 1, 100, DEFAULT_TROOPS),
  };
}

/** 建一個槽。 */
export function makeSlot(general: string, troop: string = DEFAULT_TROOP, troops: number = DEFAULT_TROOPS): DeploySlot {
  return {
    general: cleanName(general),
    troop: cleanTroop(troop),
    troops: clampInt(troops, 1, 100, DEFAULT_TROOPS),
  };
}

/**
 * 由武將名列表建隊列：保序、去重、最多 5 槽。
 * `opts.troopsOf` 可以逐將給兵力（給不出就 100），`opts.troopOf` 逐將給兵種。
 */
export function makeQueue(
  generals: readonly unknown[],
  opts: { troopOf?: (name: string) => string; troopsOf?: (name: string) => number } = {},
): DeployQueue {
  const out: DeployQueue = [];
  const seen = new Set<string>();
  for (let i = 0; i < generals.length; i++) {
    if (out.length >= DEPLOY_SLOTS) break;
    const name = cleanName(generals[i]);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push({
      general: name,
      troop: cleanTroop(opts.troopOf ? opts.troopOf(name) : DEFAULT_TROOP),
      troops: clampInt(opts.troopsOf ? opts.troopsOf(name) : DEFAULT_TROOPS, 1, 100, DEFAULT_TROOPS),
    });
  }
  return out;
}

/**
 * 存檔/URL 裏讀回來的隊列：丟掉壞槽、去重（同一武將不能佔兩槽）、截到 5 槽。
 * 永遠回新陣列 —— 呼叫方可以放心改。
 */
export function normalizeQueue(raw: unknown): DeployQueue {
  if (!Array.isArray(raw)) return [];
  const out: DeployQueue = [];
  const seen = new Set<string>();
  for (let i = 0; i < raw.length; i++) {
    if (out.length >= DEPLOY_SLOTS) break;
    const slot = normalizeSlot(raw[i]);
    if (!slot || seen.has(slot.general)) continue;
    seen.add(slot.general);
    out.push(slot);
  }
  return out;
}

/** 補齊：把 `generals` 裏還沒進隊列的武將按序追加到 5 槽（不動已在隊列裏的順序）。 */
export function fillQueue(queue: unknown, generals: readonly unknown[] = []): DeployQueue {
  const out = normalizeQueue(queue);
  const seen = new Set<string>();
  for (let i = 0; i < out.length; i++) seen.add(out[i]!.general);
  for (let i = 0; i < generals.length && out.length < DEPLOY_SLOTS; i++) {
    const name = cleanName(generals[i]);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push({ general: name, troop: DEFAULT_TROOP, troops: DEFAULT_TROOPS });
  }
  return out;
}

/**
 * 從存檔取隊列：有 `deployQueue` 就用（正規化 + 補齊），**缺字段時按 `fallback`
 * （呼叫方傳「當前出戰的 5 名武將」）即時生成** —— 舊檔因此不需要任何遷移。
 */
export function queueOf(save: DeployQueueSave | null | undefined, fallback: readonly unknown[] = []): DeployQueue {
  const raw = save && typeof save === 'object' ? save.deployQueue : undefined;
  return fillQueue(raw, fallback);
}

/** 寫回存檔（只碰 `deployQueue` 這一個鍵，正規化後寫入），返回寫進去的值。 */
export function saveQueue<T extends DeployQueueSave>(save: T, queue: unknown): DeployQueue {
  const out = normalizeQueue(queue);
  save.deployQueue = out.map((s) => ({ general: s.general, troop: s.troop, troops: s.troops }));
  return out;
}

/** 存檔裏有沒有隊列（`queueOf` 的 fallback 分支要不要提示「已按當前 5 將生成」）。 */
export function hasQueue(save: DeployQueueSave | null | undefined): boolean {
  const raw = save && typeof save === 'object' ? save.deployQueue : undefined;
  return Array.isArray(raw) && normalizeQueue(raw).length > 0;
}

/** 這一對下標能不能動：都在 `limit` 槽以內、不是同一槽。 */
export function canMove(from: number, to: number, limit: number = DEPLOY_SLOTS): boolean {
  const cap = Math.max(0, Math.min(DEPLOY_SLOTS, Math.trunc(limit) || 0));
  if (!Number.isInteger(from) || !Number.isInteger(to)) return false;
  if (from < 0 || to < 0 || from >= cap || to >= cap) return false;
  return from !== to;
}

/**
 * 把第 `from` 槽移到第 `to` 槽（其餘槽相對順序不變）。
 * `limit` 之外的下標（預備槽）在後選出陣時不給動 —— 傳 `DEPLOY_FIELD_SLOTS` 即可。
 */
export function moveSlot(queue: unknown, from: number, to: number, limit: number = DEPLOY_SLOTS): DeployQueue {
  const q = normalizeQueue(queue);
  if (!canMove(from, to, limit) || from >= q.length || to >= q.length) return q;
  const moved = q.splice(from, 1)[0]!;
  q.splice(to, 0, moved);
  return q;
}

/** 上移一槽（已是最上 / 超出 limit → 原樣返回）。 */
export function moveUp(queue: unknown, index: number, limit: number = DEPLOY_SLOTS): DeployQueue {
  return moveSlot(queue, index, index - 1, limit);
}

/** 下移一槽。 */
export function moveDown(queue: unknown, index: number, limit: number = DEPLOY_SLOTS): DeployQueue {
  return moveSlot(queue, index, index + 1, limit);
}

/** 換某一槽的兵種（只改這一槽，別名亦可）。 */
export function setTroop(queue: unknown, index: number, troop: string): DeployQueue {
  const q = normalizeQueue(queue);
  if (!Number.isInteger(index) || index < 0 || index >= q.length) return q;
  q[index] = { ...q[index]!, troop: cleanTroop(troop) };
  return q;
}

/** 改某一槽的帶兵數（夾 1..100）。 */
export function setTroops(queue: unknown, index: number, troops: number): DeployQueue {
  const q = normalizeQueue(queue);
  if (!Number.isInteger(index) || index < 0 || index >= q.length) return q;
  const n = Math.trunc(Number(troops));
  if (!Number.isFinite(n)) return q;
  q[index] = { ...q[index]!, troops: Math.max(1, Math.min(100, n)) };
  return q;
}

/** 換某一槽的武將（新名字已在別槽 → 兩槽互換，避免同一人佔兩槽）。 */
export function setGeneral(queue: unknown, index: number, general: string): DeployQueue {
  const q = normalizeQueue(queue);
  const name = cleanName(general);
  if (!name || !Number.isInteger(index) || index < 0 || index >= q.length) return q;
  const dup = q.findIndex((s) => s.general === name);
  if (dup >= 0) {
    const a = q[index]!, b = q[dup]!;
    q[index] = { ...b };
    q[dup] = { ...a };
    return q;
  }
  q[index] = { ...q[index]!, general: name };
  return q;
}

/**
 * 換邊：兩份隊列對調（我方的出陣序 → 敵方，反之亦然）。
 * 純函數，兩邊都先正規化；`A`/`B` 的槽位字段不共享引用。
 */
export function swapSides(a: unknown, b: unknown): { a: DeployQueue; b: DeployQueue } {
  return { a: normalizeQueue(b), b: normalizeQueue(a) };
}

/** 「後選出陣」的編成結果：敵方先定，我方在敵方之後才填/重排前 3 槽。 */
export interface AfterFoePlan {
  /** 敵方隊列：先定，後選方**不得**再改 */
  foe: DeployQueue;
  /** 我方隊列：敵方確定之後才填 */
  mine: DeployQueue;
  /** 可以重排的上陣槽數（= 前 N 槽） */
  fieldSlots: number;
  /** 可重排的槽下標，即 `[0, 1, 2]` */
  reorderable: number[];
}

/**
 * 後選出陣（seq 3 / Execute 34）：使用方在**敵方之後**選將/兵種。
 *
 * 純語義函數，不做 UI、不改 world：把「敵方隊列已定、我方前 3 槽可重排、後 2 槽預備」
 * 這件事變成一條可測的契約。戰場內核只需要 `ArmyStatus.chooseAfterFoe = true` 這個旗標，
 * 真正的重排落在編成頁（`deploy.html` / `DeployRoot.ts`）用同一份 `moveSlot(..., limit)`。
 */
export function chooseAfterFoe(
  foe: unknown,
  mine: unknown,
  fieldSlots: number = DEPLOY_FIELD_SLOTS,
): AfterFoePlan {
  const n = Math.max(0, Math.min(DEPLOY_SLOTS, Math.trunc(Number(fieldSlots)) || 0));
  const reorderable: number[] = [];
  for (let i = 0; i < n; i++) reorderable.push(i);
  return { foe: normalizeQueue(foe), mine: normalizeQueue(mine), fieldSlots: n, reorderable };
}

/** 隊列的緊湊串（給 URL / 日誌）：`張飛:槍:80;關羽:刀:100`。 */
export function queueKey(queue: unknown): string {
  const q = normalizeQueue(queue);
  const parts: string[] = [];
  for (let i = 0; i < q.length; i++) {
    const s = q[i]!;
    parts.push(`${s.general}:${s.troop}:${s.troops}`);
  }
  return parts.join(';');
}

/** `queueKey` 的逆運算；壞片段逐個丟掉（不拋異常）。 */
export function parseQueueKey(text: unknown): DeployQueue {
  if (typeof text !== 'string' || !text.trim()) return [];
  const rows: unknown[] = [];
  const chunks = text.split(';');
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]!.trim();
    if (!chunk) continue;
    const cols = chunk.split(':');
    rows.push({ general: cols[0], troop: cols[1], troops: cols[2] });
  }
  return normalizeQueue(rows);
}

/** 兩份隊列是否完全一致（順序、兵種、兵力都比）。 */
export function sameQueue(a: unknown, b: unknown): boolean {
  const x = normalizeQueue(a);
  const y = normalizeQueue(b);
  if (x.length !== y.length) return false;
  for (let i = 0; i < x.length; i++) {
    const p = x[i]!, q = y[i]!;
    if (p.general !== q.general || p.troop !== q.troop || p.troops !== q.troops) return false;
  }
  return true;
}
