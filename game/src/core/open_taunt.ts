/**
 * 開場叫陣：原作 `SYSTEM.SO` 的 `StartBattle`（`0x2108`）第一段演出。
 *
 * 逐條對照 `src/core/syso_host.ts:1288-1372` 的實裝：
 *   1. `loc6 = ScreenRegionTest(g7)`（敵方主將分區）、`loc5 = ScreenRegionTest(g8)`（我方主將分區）；
 *   2. 第一句 `loc3 = CallLine(loc5, loc6)`，由**敵將**喊話（臺詞層 2）；
 *   3. 第二句 `loc4 = AnswerLine(loc5, loc6)`，由**我將**接話（臺詞層 3）；
 *   4. `AnswerLine` 抽到和第一句同號時重抽（原作 do-while，本檔用 64 次上限防死迴圈）。
 *
 * 本檔只做「選編號 + 填臺詞 + 排序列」，不碰渲染也不碰戰鬥數值：
 * 鏡頭、計時、暫停 `step()` 都在 `web/main.js`；台詞框在 `view/battleView.ts`。
 *
 * 臺詞原文來自 `extract/json/message.json`（MESSAGE.INI，cp950）MSG300-409 共 110 條，
 * 與 `docs/03d-文本与配置.md:499-648` 逐條一致；重製版還沒有 `game/data/message.json`，
 * 所以先內嵌在這（缺口見 `work/flow_taunt/REPORT.md`）。
 */

/** 叫陣的兩側：B = 敵將先喊，A = 我將接話（對應原作臺詞層 2/3）。 */
export type TauntSide = 'A' | 'B';

/** 一句叫陣。 */
export interface TauntLine {
  side: TauntSide;
  /** MESSAGE.INI 編號（300..409） */
  msgId: number;
  /** 這句停留多少個邏輯 tick（60Hz）；到時切下一句 */
  holdTicks: number;
  /** 已填好 `%S1%/%S2%`、已剝掉 `%K%%E%` 這類尾碼的臺詞；查不到編號時是空串 */
  text: string;
}

export interface TauntOptions {
  /** `loc5`：我方主將的屏幕分區（0 出屏 / 1 邊線 / 2 屏內） */
  near: number;
  /** `loc6`：敵方主將的屏幕分區（同上） */
  far: number;
  /** false = 整體關閉（`?taunt=0`），回空序列 */
  enabled?: boolean;
  /** 每句停留 tick，默認 90（=1.5s @60Hz），夾在 [30, 300] */
  holdTicks?: number;
  /** 只影響編號抽取，不碰戰鬥的亂數流（同 seed 同序列） */
  seed?: number;
  /** 自定義閉區間整數隨機（min,max）；不給就用 seed 的 mulberry32 */
  rand?: (min: number, max: number) => number;
  /** 自定義臺詞表；不給就用內嵌的 MSG300-409 */
  textTable?: Readonly<Record<number, string>>;
  /** 我方主將名（填 `%S1%` / `%s1%`） */
  aName?: string;
  /** 敵方主將名（填 `%S1%` / `%s1%`） */
  bName?: string;
}

/** 默認停留：90 tick = 1.5s @60Hz。 */
export const TAUNT_HOLD_TICKS = 90;
/** 最短停留：30 tick = 0.5s（再短看不清字）。 */
export const TAUNT_HOLD_MIN = 30;
/** 最長停留：300 tick = 5s。 */
export const TAUNT_HOLD_MAX = 300;
/** 編號下界（MESSAGE.INI MSG300）。 */
export const TAUNT_MSG_MIN = 300;
/** 編號上界（MESSAGE.INI MSG409）。 */
export const TAUNT_MSG_MAX = 409;
/** 第二句和第一句撞號時最多重抽幾次（原作是 do-while，這裡防死迴圈）。 */
export const TAUNT_MAX_REROLL = 64;

/**
 * 原作 `0x206` 的分區判定：`col/row` 是「屏幕格」座標，75 是邊線、90 是出屏。
 * 逐字照抄 `syso_host.ts:1151-1174`（`0x5a = 90`、`0x4b = 75`）。
 */
export function screenRegion(col: number, row: number): 0 | 1 | 2 {
  if (!Number.isFinite(col) || !Number.isFinite(row)) return 0;
  if (col >= 0x5a || row >= 0x5a) return 0;
  if (col >= 0x4b || row >= 0x4b) return 1;
  return 2;
}

/**
 * 重製版的「分區」代理：原作 `UnitPos` 回的是屏幕格座標，重製版 port 只有 71×14 的
 * 戰場格（`runtime.ts:2574-2582`），永遠到不了 75/90。這裡按「主將離鏡頭中心多遠」
 * 換算成同樣的 0/1/2，閾值取投影可見深度（`docs/…`：遠 7.43 行、近 3.74 行）。
 * 標 [推測]：實機只保證語義（屏內/邊線/出屏），數值等 0x206 的螢幕座標口徑定案再校。
 */
export function regionFromCamera(gx: number, camX: number): 0 | 1 | 2 {
  const d = Math.abs(gx - camX);
  if (!Number.isFinite(d)) return 0;
  if (d <= 3.74) return 2;
  if (d <= 7.43) return 1;
  return 0;
}

/** 把任意輸入夾成合法的 holdTicks；非法值回默認 90。 */
export function clampHoldTicks(value?: number): number {
  if (value === undefined || value === null || !Number.isFinite(value)) return TAUNT_HOLD_TICKS;
  return Math.min(TAUNT_HOLD_MAX, Math.max(TAUNT_HOLD_MIN, Math.round(value)));
}

/** URL 開關：缺省開，`?taunt=0`（也認 off/false/no）關。 */
export function tauntEnabled(raw: string | null | undefined): boolean {
  if (raw === null || raw === undefined) return true;
  const v = String(raw).trim().toLowerCase();
  return !(v === '0' || v === 'off' || v === 'false' || v === 'no');
}

/**
 * 叫陣用的獨立亂數流：mulberry32，閉區間整數。
 * 刻意不共用 `world.rng`——叫陣開/關不能改變戰鬥的隨機序列，否則同 seed 對拍會漂。
 */
export function makeTauntRng(seed: number): (min: number, max: number) => number {
  let s = (Math.floor(seed) ^ 0x9e3779b9) >>> 0;
  return (min: number, max: number): number => {
    const lo = Math.ceil(Math.min(min, max));
    const hi = Math.floor(Math.max(min, max));
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi < lo) return lo;
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t;
    const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    return lo + Math.floor(r * (hi - lo + 1));
  };
}

/**
 * 第一段（敵將叫陣）：`CallLine(loc5, loc6)`，逐字照抄 `syso_host.ts:1339-1349`。
 * 參數順序是 (near = loc5 = 我將分區, far = loc6 = 敵將分區)。
 */
export function callLine(near: number, far: number, rand: (min: number, max: number) => number): number {
  if (near === 0) {
    return rand(0, 1) === 0 ? rand(300, 319) : rand(380, 399);
  }
  if (near === 1) {
    return rand(0, 1) === 0 ? rand(320, 339) : rand(380, 399);
  }
  if (near === 2 && far === 0) {
    return rand(0, 1) === 0 ? rand(340, 359) : rand(380, 399);
  }
  if (near === 2) {
    const pick = rand(0, 2);
    if (pick === 0) return rand(340, 359);
    if (pick === 1) return rand(380, 399);
    return rand(360, 379);
  }
  // 原作 near 只可能是 0/1/2；異常值回 0（syso_host 同）
  return 0;
}

/**
 * 第二段（我將接話）：`AnswerLine(loc5, loc6)`，逐字照抄 `syso_host.ts:1351-1372`。
 * 注意分檔看的是 **far**（敵將分區），只有 `far===2` 時才再看 near。
 */
export function answerLine(near: number, far: number, rand: (min: number, max: number) => number): number {
  if (far === 0) {
    const pick = rand(0, 2);
    if (pick === 0) return rand(300, 319);
    if (pick === 1) return rand(380, 399);
    return rand(400, 409);
  }
  if (far === 1) {
    const pick = rand(0, 2);
    if (pick === 0) return rand(320, 339);
    if (pick === 1) return rand(380, 399);
    return rand(400, 409);
  }
  if (far === 2 && near === 0) {
    const pick = rand(0, 2);
    if (pick === 0) return rand(340, 359);
    if (pick === 1) return rand(380, 399);
    return rand(400, 409);
  }
  if (far === 2) {
    const pick = rand(0, 3);
    if (pick === 0) return rand(340, 359);
    if (pick === 1) return rand(380, 399);
    if (pick === 2) return rand(360, 379);
    return rand(400, 409);
  }
  // 原作 far 只可能是 0/1/2；異常值回 0（syso_host 同）
  return 0;
}

/** 尾碼：%K%%E% / %k%%e% / %k%%l% 是「說話方 + 語氣」兩維碼，顯示前剝掉。 */
const TAUNT_TAIL_CODE = /%[kKeElL]%/g;

/**
 * 填臺詞：剝尾碼 + 換 `%S1%/%s1%`（說話方）與 `%S2%`（對方）為武將名。
 * 原作由引擎按 general 替換（`syso_host.ts:1693-1705` 只記錄原文），這裡補上。
 * 佔位語義文檔沒寫死，是從文案推的 [推測]：MSG300「我乃%s1%是也」= 自報名號。
 */
export function fillTauntText(text: string, speaker: string, opponent: string): string {
  if (!text) return '';
  return text
    .replace(TAUNT_TAIL_CODE, '')
    .replace(/%S1%|%s1%/g, speaker)
    .replace(/%S2%|%s2%/g, opponent)
    .trim();
}

/**
 * 排一段完整開場叫陣。
 *
 * @returns 先 B（敵將叫陣）後 A（我將接話），長度 0 或 2；`enabled:false` 時為 []。
 */
export function buildTauntSeq(opts: TauntOptions): TauntLine[] {
  if (opts.enabled === false) return [];
  const rand = opts.rand ?? makeTauntRng(opts.seed ?? 1);
  const table = opts.textTable ?? TAUNT_TEXT;
  const holdTicks = clampHoldTicks(opts.holdTicks);
  const aName = (opts.aName ?? '').trim() || '我將';
  const bName = (opts.bName ?? '').trim() || '敵將';

  const bId = callLine(opts.near, opts.far, rand);
  let aId = answerLine(opts.near, opts.far, rand);
  for (let guard = 0; aId === bId && guard < TAUNT_MAX_REROLL; guard += 1) {
    aId = answerLine(opts.near, opts.far, rand);
  }

  return [
    {
      side: 'B',
      msgId: bId,
      holdTicks,
      text: fillTauntText(table[bId] ?? '', bName, aName),
    },
    {
      side: 'A',
      msgId: aId,
      holdTicks,
      text: fillTauntText(table[aId] ?? '', aName, bName),
    },
  ];
}

/**
 * MSG300-409 原文（110 條，MESSAGE.INI cp950）。
 * 與 `docs/03d-文本与配置.md:499-648`、`extract/json/message.json` 逐條一致；
 * 300-399 是叫陣/報名，400-409 是接戰（原作只有兩句輪換）。
 * 尾碼保留在表裡，顯示時由 `fillTauntText()` 剝掉——這樣表仍是「原文」。
 */
export const TAUNT_TEXT: Readonly<Record<number, string>> = {
  300: '我乃%s1%是也！%k%%e%',
  301: '和我%S1%交手是你一生最大的錯誤！%K%%E%',
  302: '跟我%S1%交手，你一定會後悔的！%K%%E%',
  303: '你的人頭我要定了，有什麼遺言就快交代吧！%K%%E%',
  304: '%S1%在此，誰敢與我一決死戰！%K%%E%',
  305: '我乃%S1%，不怕死的人儘管過來吧！%K%%E%',
  306: '反賊，還不快快下馬受縛！%K%%E%',
  307: '和我%S1%交手是你一生最大的錯誤！%K%%E%',
  308: '跟我%S1%交手，你一定會後悔的！%K%%E%',
  309: '你的人頭我要定了，有什麼遺言就快交代吧！%K%%E%',
  310: '%S1%在此，誰敢與我一決死戰！%K%%E%',
  311: '我乃%S1%，不怕死的人儘管過來吧！%K%%E%',
  312: '反賊，還不快快下馬受縛！%K%%E%',
  313: '和我%S1%交手是你一生最大的錯誤！%K%%E%',
  314: '跟我%S1%交手，你一定會後悔的！%K%%E%',
  315: '你的人頭我要定了，有什麼遺言就快交代吧！%K%%E%',
  316: '%S1%在此，誰敢與我一決死戰！%K%%E%',
  317: '我乃%S1%，不怕死的人儘管過來吧！%K%%E%',
  318: '反賊，還不快快下馬受縛！%K%%E%',
  319: '反賊，還不快快下馬受縛！%K%%E%',
  320: '我乃%s1%是也！%k%%e%',
  321: '和我%S1%交手是你一生最大的錯誤！%K%%E%',
  322: '跟我%S1%交手，你一定會後悔的！%K%%E%',
  323: '你的人頭我要定了，有什麼遺言就快交代吧！%K%%E%',
  324: '%S1%在此，誰敢與我一決死戰！%K%%E%',
  325: '我乃%S1%，不怕死的人儘管過來吧！%K%%E%',
  326: '反賊，還不快快下馬受縛！%K%%E%',
  327: '和我%S1%交手是你一生最大的錯誤！%K%%E%',
  328: '跟我%S1%交手，你一定會後悔的！%K%%E%',
  329: '你的人頭我要定了，有什麼遺言就快交代吧！%K%%E%',
  330: '%S1%在此，誰敢與我一決死戰！%K%%E%',
  331: '我乃%S1%，不怕死的人儘管過來吧！%K%%E%',
  332: '反賊，還不快快下馬受縛！%K%%E%',
  333: '和我%S1%交手是你一生最大的錯誤！%K%%E%',
  334: '跟我%S1%交手，你一定會後悔的！%K%%E%',
  335: '你的人頭我要定了，有什麼遺言就快交代吧！%K%%E%',
  336: '%S1%在此，誰敢與我一決死戰！%K%%E%',
  337: '我乃%S1%，不怕死的人儘管過來吧！%K%%E%',
  338: '反賊，還不快快下馬受縛！%K%%E%',
  339: '和我%S1%交手是你一生最大的錯誤！%K%%E%',
  340: '我乃%s1%是也！%k%%e%',
  341: '我是%S1%，來比試一下吧！%K%%E%',
  342: '不知死活的傢伙，這不是你該來的地方！%K%%E%',
  343: '我乃%s1%是也！%k%%e%',
  344: '我是%S1%，來比試一下吧！%K%%E%',
  345: '不知死活的傢伙，這不是你該來的地方！%K%%E%',
  346: '我乃%s1%是也！%k%%e%',
  347: '我是%S1%，來比試一下吧！%K%%E%',
  348: '不知死活的傢伙，這不是你該來的地方！%K%%E%',
  349: '我乃%s1%是也！%k%%e%',
  350: '我是%S1%，來比試一下吧！%K%%E%',
  351: '不知死活的傢伙，這不是你該來的地方！%K%%E%',
  352: '我乃%s1%是也！%k%%e%',
  353: '我是%S1%，來比試一下吧！%K%%E%',
  354: '不知死活的傢伙，這不是你該來的地方！%K%%E%',
  355: '我乃%s1%是也！%k%%e%',
  356: '我是%S1%，來比試一下吧！%K%%E%',
  357: '不知死活的傢伙，這不是你該來的地方！%K%%E%',
  358: '我乃%s1%是也！%k%%e%',
  359: '我是%S1%，來比試一下吧！%K%%E%',
  360: '完了！完了！搞不好今天要死在這裡了！！%K%%E%',
  361: '真要命，怎麼會碰上這個怪物！%K%%E%',
  362: '好像是個狠角色，不可輕敵啊！%K%%E%',
  363: '真糟糕，我的運氣實在不好！%K%%E%',
  364: '完了！完了！搞不好今天要死在這裡了！！%K%%E%',
  365: '真要命，怎麼會碰上這個怪物！%K%%E%',
  366: '好像是個狠角色，不可輕敵啊！%K%%E%',
  367: '真糟糕，我的運氣實在不好！%K%%E%',
  368: '完了！完了！搞不好今天要死在這裡了！！%K%%E%',
  369: '真要命，怎麼會碰上這個怪物！%K%%E%',
  370: '好像是個狠角色，不可輕敵啊！%K%%E%',
  371: '真糟糕，我的運氣實在不好！%K%%E%',
  372: '完了！完了！搞不好今天要死在這裡了！！%K%%E%',
  373: '真要命，怎麼會碰上這個怪物！%K%%E%',
  374: '好像是個狠角色，不可輕敵啊！%K%%E%',
  375: '真糟糕，我的運氣實在不好！%K%%E%',
  376: '完了！完了！搞不好今天要死在這裡了！！%K%%E%',
  377: '真要命，怎麼會碰上這個怪物！%K%%E%',
  378: '好像是個狠角色，不可輕敵啊！%K%%E%',
  379: '真糟糕，我的運氣實在不好！%K%%E%',
  380: '誰敢和我%S1%交手！%K%%E%',
  381: '敢和我%S1%交手？來吧！%K%%E%',
  382: '反賊%S2%，早早投降可以免你一死！%K%%E%',
  383: '反賊%S2%，準備受死吧！%K%%E%',
  384: '反賊%S2%，一決勝負吧！%K%%E%',
  385: '就讓你看看我的厲害！%K%%E%',
  386: '誰敢和我%S1%交手！%K%%E%',
  387: '敢和我%S1%交手？來吧！%K%%E%',
  388: '反賊%S2%，早早投降可以免你一死！%K%%E%',
  389: '反賊%S2%，準備受死吧！%K%%E%',
  390: '反賊%S2%，一決勝負吧！%K%%E%',
  391: '就讓你看看我的厲害！%K%%E%',
  392: '誰敢和我%S1%交手！%K%%E%',
  393: '敢和我%S1%交手？來吧！%K%%E%',
  394: '反賊%S2%，早早投降可以免你一死！%K%%E%',
  395: '反賊%S2%，準備受死吧！%K%%E%',
  396: '反賊%S2%，一決勝負吧！%K%%E%',
  397: '就讓你看看我的厲害！%K%%E%',
  398: '誰敢和我%S1%交手！%K%%E%',
  399: '敢和我%S1%交手？來吧！%K%%E%',
  400: '別廢話多說，一決勝負吧！%K%%E%',
  401: '只動嘴巴是不會贏的，來吧！%K%%E%',
  402: '別廢話多說，一決勝負吧！%K%%E%',
  403: '只動嘴巴是不會贏的，來吧！%K%%E%',
  404: '別廢話多說，一決勝負吧！%K%%E%',
  405: '只動嘴巴是不會贏的，來吧！%K%%E%',
  406: '別廢話多說，一決勝負吧！%K%%E%',
  407: '只動嘴巴是不會贏的，來吧！%K%%E%',
  408: '別廢話多說，一決勝負吧！%K%%E%',
  409: '只動嘴巴是不會贏的，來吧！%K%%E%',
};
