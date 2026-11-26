/**
 * 出陣隊列 —— 戰役編成層的「5 個武將槽」。
 *
 * ## 原作反彙編結論（R81：`work/r81_exec34/REPORT.md`，把「3 槽」從 [推測] 變 [反彙編]）
 *
 * 原作**沒有「前 3 槽上陣」這種字段**。戰場那一側的數據結構是
 * `army = [0x4A668C]`（A 軍）/ `[0x4A6690]`（B 軍），布局：
 *   · `army+0x00` = entry 數（部隊池里該隊的武將數，逐條 `memcpy 0x48` 填進來）
 *   · `army+0x04` = **唯一的「出陣下標」**（`0x446EE8` 處初始化 `mov [ecx+4],0`）
 *   · `army+0x1C` = entries[] 基址，步長 `0x48`
 *   · `army+0x454 / +0x458` = 進戰場時抄給單位 `+0x44 / +0x40` 的兩個值
 *
 * `0x446F45`（全程序只有 `0x448690` 里兩個調用點）就是「取當前出陣單位」：
 * ```
 * 00446F48  mov  eax, [ebp+8]        ; army
 * 00446F4B  mov  ecx, [eax+4]        ; ← 出陣下標，只有一個
 * 00446F4E  imul ecx, ecx, 0x48
 * 00446F54  lea  eax, [edx+ecx+0x1C] ; &army->entries[idx]
 * ```
 * `0x448690` 每側只建 **1** 個單位（`g_unitA = 0x446F45([0x4A668C])`、
 * `g_unitB = 0x446F45([0x4A6690])`，然後 `call 0x43A1C4` 初始化這兩個），
 * 沒有循環、沒有 count 上限、也沒有 `cmp ...,3`。
 *
 * 軍師技 `3 後選出陣`（`Execute 34`）的分支 `0x44DE44` 全文只有：
 * ```
 * 0044DE44  push 0x491900        ; Big5 "成功"
 * 0044DE4C  push [ebp-0x1C]      ; 消息欄上下文
 * 0044DE4D  call 0x46DAE0        ; 打一句話
 * 0044DE55  jmp  0x44E6C7        ; 函數尾
 * ```
 * **零狀態寫入** —— 它不立任何旗標、不動 `army+0x04`、不回寫存檔。
 *
 * 編成頁那張「選出陣武將」列表（窗口過程 `0x44960B`，A 側寫 `0x449853`、B 側寫 `0x4496D1`）
 * 點選時做的是 `army->+0x04 = 列表首行 + 光標`，界限是**列表總數**
 * （`cmp idx, [0x491094]` / `[0x491034]`，帶滾動 `[0x49108C]`），
 * 也就是「5 個槽裏任選一員當出陣武將」，不是「前 3 槽」、也不是「後 3 位」。
 * 敵方那一側由 `0x4042ED(army, 1) → 0x4040F3(army)` 自動選（`0x447DF1` / `0x447E34`）。
 *
 * 所以本檔案裏：
 *   · `DEPLOY_SLOTS` = 5 槽 —— 對應原作部隊池的 5 個武將槽（槽序即列表序）；
 *   · `DEPLOY_FIELD_SLOTS` = 3 —— 是**本重製版**戰場寬度（每側同時 3 個單位），
 *     **与 Exec34 無關**，別再拿它當「後選出陣可重排的槽數」；
 *   · `ORIGINAL_DEPLOY_PICK_SLOTS` = 1 —— 原作每側真正可決定的「出陣位」個數；
 *   · 「後選出陣」= **敵方先定、我方後選**（時點/順序），我方用 `pickDeploy()` 把
 *     任意一員提到出陣位（第 0 槽），其餘槽相對順序不動。
 *
 * 本檔案只做**純邏輯**：不碰 DOM、不碰 localStorage、不 import `battle.ts`，
 * 所以三個消費端共用同一份 ——
 *   · `game/web/deploy.html`（瀏覽器實測）、
 *   · `game/cocos/assets/scripts/DeployRoot.ts`（同步副本，`work/cocos_sync/sync_core3.mjs`）、
 *   · `game/tests/deploy_queue.test.ts`（node）。
 *
 * 槽位語義：
 *   · 最多 `DEPLOY_SLOTS` = 5 槽，**順序即出陣順序**。
 *   · 每槽 `{ general, troop, troops }`：武將名（`generals.json` 的 NAME）、兵種單字
 *     （原作 `UseForce` 的 刀/槍/弓/…）、帶兵數（1..100，與 `troopCapOf()` 同上限）。
 *
 * 序列化：存檔裡是**可選字段** `save.deployQueue`（`game/web/saves.js` v3，見該檔 §6b
 * 的可選字段約定）。缺字段/壞字段時 `queueOf(save, 當前 5 將)` 用當前出戰武將即時生成，
 * 所以舊檔不需要任何遷移跳（不進 `SNAPSHOT_REQUIRED`、不升 v4）。
 */

/** 每方最多 5 個武將槽（原作 Obj3 部隊池，docs/07b §6）。 */
export const DEPLOY_SLOTS = 5;

/** 前 3 槽是本重製版的「上陣區」（戰場每側 3 個單位）——**不是** Exec34 的槽數。 */
export const DEPLOY_FIELD_SLOTS = 3;

/**
 * 原作一側的「出陣位」個數：**恰好 1**。
 * `0x446F45` 只取 `army->entries[army->+0x04]` 這一個 entry，`0x448690` 每側只建 1 個單位；
 * `0x44DE44`（Execute 34）零狀態寫入。所以「後選出陣」放開的是「誰站上出陣位」，
 * 不是「重排前 3 槽」。
 */
export const ORIGINAL_DEPLOY_PICK_SLOTS = 1;

/** 反彙編取證：`work/orig_numbers/text_dis.tsv` 里的原始指令（位址 → 指令文字）。 */
export const ORIGINAL_DEPLOY_EVIDENCE: ReadonlyArray<readonly [string, string]> = [
  ['00446F4B', 'mov ecx, dword ptr [eax + 4]'],
  ['00446F4E', 'imul ecx, ecx, 0x48'],
  ['00446F54', 'lea eax, [edx + ecx + 0x1c]'],
  ['0044869C', 'call 0x446f45'],
  ['004486A4', 'mov dword ptr [0x4a8a24], eax'],
  ['004486EC', 'call 0x446f45'],
  ['004486F4', 'mov dword ptr [0x4a8a20], eax'],
  ['0044873F', 'call 0x43a1c4'],
  ['0044DE44', 'push 0x491900'],
  ['0044DE4D', 'call 0x46dae0'],
  ['0044DE55', 'jmp 0x44e6c7'],
  ['004496D1', 'mov dword ptr [ecx + 4], edx'],
  ['00449853', 'mov dword ptr [eax + 4], ecx'],
];

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
 * `limit` 之外的下標（預備槽）不給動 —— 傳 `DEPLOY_FIELD_SLOTS` 就是「只在本重製版的 3 行
 * 上陣區裏拖」。這只是 UI 的拖動範圍，**不是** Exec34 的授權範圍（後選出陣的授權見
 * `chooseAfterFoe` / `pickDeploy`）。
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

/**
 * 「後選出陣」的編成結果：敵方先定（`foe`），我方在敵方之後才選（`mine`）。
 *
 * 注意 `fieldSlots` —— 原作每側只有 **1** 個出陣位（`0x446F45` 的 `[eax+4]` 單一下標、
 * `0x448690` 每側只建 1 個單位），所以這裏是 1，不是 3。重製版的「3 行上陣區」
 * （`DEPLOY_FIELD_SLOTS`）是戰場寬度，與 Exec34 無關。
 */
export interface AfterFoePlan {
  /** 敵方隊列：先定，後選方**不得**再改 */
  foe: DeployQueue;
  /** 我方隊列：敵方確定之後才填 */
  mine: DeployQueue;
  /** 原作可決定的出陣位數 = `ORIGINAL_DEPLOY_PICK_SLOTS`（1） */
  fieldSlots: number;
  /** 可決定的槽下標，即 `[0]`（出陣位） */
  reorderable: number[];
  /** 我方可以拿來當出陣位的槽下標 = `0 .. mine.length-1`（列表裏任選一員） */
  pickable: number[];
  /** 決策順序：敵方先定（`foe`），我方後選（`mine`） */
  pickOrder: 'foe-first';
  /** 敵方先定的出陣武將名（`foe` 為空時 `null`） */
  foeLeader: string | null;
  /** 我方當前的出陣武將名（`mine` 為空時 `null`） */
  mineLeader: string | null;
}

/**
 * 後選出陣（seq 3 / Execute 34）：使用方在**敵方之後**選出陣武將。
 *
 * 反彙編依據（`work/r81_exec34/REPORT.md`）：
 *   · `0x44DE44`（Execute 34 分支）只有一句「成功」消息，**零狀態寫入**；
 *   · `0x446EE8` 把出陣下標初始化成 0，`0x446F45` 只取 `army->entries[army->+0x04]` 一個；
 *   · 編成頁列表（`0x44960B` 窗口過程，A 側寫 `0x449853`、B 側寫 `0x4496D1`）
 *     點選時 `army->+0x04 = 列表首行 + 光標`，界限是**列表總數**（任意一員），不是 3；
 *   · 敵方由 `0x4042ED(army, 1) → 0x4040F3(army)` 先自動選（`0x447DF1` / `0x447E34`）。
 *
 * 所以契約是：**敵方先定且不得改；我方可把任意一員提到出陣位**（`pickDeploy`），
 * 而不是「重排前 3 槽」。`fieldSlots` 參數保留只為兼容舊調用，任何 >1 的值都夾到 1。
 */
export function chooseAfterFoe(
  foe: unknown,
  mine: unknown,
  fieldSlots: number = ORIGINAL_DEPLOY_PICK_SLOTS,
): AfterFoePlan {
  const f = normalizeQueue(foe);
  const m = normalizeQueue(mine);
  const raw = Math.trunc(Number(fieldSlots));
  const n = Math.max(0, Math.min(ORIGINAL_DEPLOY_PICK_SLOTS, Number.isFinite(raw) ? raw : 0));
  const reorderable: number[] = [];
  for (let i = 0; i < n; i++) reorderable.push(i);
  const pickable: number[] = [];
  for (let i = 0; i < m.length; i++) pickable.push(i);
  return {
    foe: f,
    mine: m,
    fieldSlots: n,
    reorderable,
    pickable,
    pickOrder: 'foe-first',
    foeLeader: f.length > 0 ? f[0]!.general : null,
    mineLeader: m.length > 0 ? m[0]!.general : null,
  };
}

/**
 * 後選方落地：把第 `index` 槽提到**出陣位**（第 0 槽），其餘槽相對順序不變。
 *
 * 對應原作 `army->+0x04 = 列表首行 + 光標`（`0x449853` / `0x4496D1`）：選誰，誰就站出陣位，
 * 原第 0 槽順延。下標越界/非整數/已在 0 槽 → 原樣返回（不拋異常）。
 */
export function pickDeploy(queue: unknown, index: number): DeployQueue {
  const q = normalizeQueue(queue);
  if (!Number.isInteger(index) || index <= 0 || index >= q.length) return q;
  return moveSlot(q, index, 0, DEPLOY_SLOTS);
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
