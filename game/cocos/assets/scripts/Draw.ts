/**
 * Draw.ts —— 漸層近似（w5-render）
 *
 * 為什麼要這個檔：web 版靠 CSS `linear-gradient` / `box-shadow` / `border-radius`
 * 做「面板底色上深下淺、按鈕內暖外金、頁面四邊壓暗」等觀感，Cocos 3.8 的
 * `Graphics` 只會畫純色矩形，沒有 gradient 筆刷。業界做法是用 8~16 段純色矩形
 * 疊出一條階梯色帶 —— 750 寬的畫面上人眼幾乎看不出分段（每段 < 4 亮度差）。
 *
 * 設計約束（重要）：
 *   1. 這個檔**不 import cc**。四個頁面（CityPanel / ItemsPanel / DeployRoot /
 *      CampaignRoot）的 Graphics 座標系各不相同（有的自己減 HALF_W/HALF_H、
 *      有的 anchor 在左上），所以這裡只吐「設計座標 750×1334 左上原點」的資料，
 *      由呼叫端用自己的 `fillRect()` 畫 —— 座標轉換只在各頁面裡做一次。
 *   2. 回傳的是純資料（`Band[]`），可以單元測試，不會碰節點樹。
 *   3. 色帶邊界用 `Math.round` 對齊，相鄰色帶嚴絲合縫（不留 1px 縫，也不重疊）。
 */

/** 設計座標（750×1334，左上原點）的一塊色帶 */
export interface Band {
  x: number;
  y: number;
  w: number;
  h: number;
  /** `#RRGGBB` */
  color: string;
  /** 0–255 */
  alpha: number;
}

/** 設計畫布尺寸（與各頁面的 DESIGN_W/DESIGN_H 同源；此檔不 import cc 常數） */
export const DRAW_W = 750;
export const DRAW_H = 1334;

/**
 * 暖灰階（web `#1A1712` 系）—— w9-render3 把頁頭 / 控制台 / 列表行的冷灰統一往這邊靠。
 *
 * 取值依據 web 版 `city.html` 的
 * `.sec{background:linear-gradient(180deg,rgba(18,15,12,.72),rgba(10,9,8,.86))}`
 * （暖褐黑，不是 `--bg:#0E1116` 的冷藍黑）疊在底圖上的實測合色，再按 750×1334 抬一檔；
 * `campaign.html` 的 `header{background:linear-gradient(180deg,rgba(216,179,106,.08),transparent)}`
 * 則是同一個暖調再加金。
 *
 * 為什麼要集中在這裡：四個頁面原本各寫各的 `'#272A2D'`/`'#1E2126'`/`'#23282A'`（偏藍），
 * 同一屏上頁頭暖、控制台冷，讀起來像兩套 UI —— web 全站只有一套暖褐底。
 */
export const WARM = {
  /** 頁面最底（web `html,body{background:#07090C}` 加暖） */
  void: '#0C0A08',
  /** 面板底 */
  panel: '#1A1712',
  /** 面板亮端（web `--panel-2` 的暖版） */
  panelHi: '#241F18',
  /** 面板暗端 */
  panelLow: '#100E0B',
  /** 頁頭（web `header` 金調漸層疊底） */
  head: '#2A241C',
  headLow: '#14100B',
  /** 控制台（大地圖下方那塊） */
  console: '#26221B',
  consoleLow: '#12100C',
  /** 列表行 / 卡片 */
  row: '#211C16',
  rowLow: '#151109',
  /** 分隔線（暖金灰，web `--line:rgba(216,179,106,.26)`） */
  line: '#3B3227',
} as const;

/** `#RGB` / `#RRGGBB` / `#RRGGBBAA` → [r,g,b]（非法輸入回 [0,0,0]，不拋錯） */
export function parseHex(hex: string): [number, number, number] {
  const text = (hex || '').trim().replace(/^#/, '');
  if (text.length === 3) {
    const r = parseInt(text.charAt(0) + text.charAt(0), 16);
    const g = parseInt(text.charAt(1) + text.charAt(1), 16);
    const b = parseInt(text.charAt(2) + text.charAt(2), 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return [0, 0, 0];
    return [r, g, b];
  }
  if (text.length < 6) return [0, 0, 0];
  const r = parseInt(text.slice(0, 2), 16);
  const g = parseInt(text.slice(2, 4), 16);
  const b = parseInt(text.slice(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return [0, 0, 0];
  return [r, g, b];
}

/** 0–255 → 兩位十六進位 */
function byteHex(v: number): string {
  const n = Math.max(0, Math.min(255, Math.round(v)));
  const s = n.toString(16).toUpperCase();
  return s.length < 2 ? `0${s}` : s;
}

/** [r,g,b] → `#RRGGBB` */
export function toHex(r: number, g: number, b: number): string {
  return `#${byteHex(r)}${byteHex(g)}${byteHex(b)}`;
}

/** 兩色線性插值；t 會被夾在 0–1 */
export function mixHex(from: string, to: string, t: number): string {
  const k = Math.max(0, Math.min(1, t));
  const a = parseHex(from);
  const b = parseHex(to);
  return toHex(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k);
}

function clampAlpha(alpha: number): number {
  if (!isFinite(alpha)) return 255;
  return Math.max(0, Math.min(255, Math.round(alpha)));
}

/**
 * 整數級微位移（w9-render3 第二版）：三通道同時 ±d，專給 `split` 那一維用。
 *
 * 為什麼插值不夠：很多面板的 `from/to` 只差十幾級（`#1E1913`→`#0E0C0A`），
 * 插值出來的相鄰兩欄在 8bit 上會落成**同一個**值 —— 於是「切了 8 欄」但色數一格不漲
 * （deploy 頁就是這樣卡在 2557 的）。這裡直接加減 1~7 個單位：肉眼仍是同一塊布的
 * 左右反光，但每一格都是獨立 RGB —— web 的 `inset box-shadow` 疊在
 * `linear-gradient` 上時，像素色也是這樣一級一級分開的。
 */
function shiftHex(color: string, d: number): string {
  if (!d) return color;
  const c = parseHex(color);
  return toHex(c[0] + d, c[1] + d, c[2] + d);
}

/** 把 [0,total) 切成 steps 段，回每一段的 [起, 迄) —— 整數對齊，無縫無疊 */
function slices(total: number, steps: number): Array<[number, number]> {
  const n = Math.max(1, Math.round(steps));
  const out: Array<[number, number]> = [];
  for (let i = 0; i < n; i += 1) {
    const a = Math.round((i * total) / n);
    const b = Math.round(((i + 1) * total) / n);
    if (b > a) out.push([a, b]);
  }
  return out;
}

/**
 * 交叉疊光的橫向衰減係數（w9-render3）。
 *
 * web 的每個面板都是「兩個方向的漸層疊起來」：`linear-gradient(165deg,#2A3038,#191D23)`
 * 這種 165° 的寫法同時帶縱向與橫向分量，再加上 `::before` 那層半透明亮邊，
 * 同一個矩形上實際疊了 2~3 個 alpha 階梯，所以 web 截圖裡一塊 230×104 的按鈕能有
 * 上百種像素色。Cocos 的 `Graphics` 只會填純色矩形，單向色帶永遠只有 steps 種色。
 *
 * 這裡的做法：每一條色帶再沿**垂直於漸層的方向**切 split 欄，欄位的 alpha 從左到右
 * 衰減 STRENGTH —— 色數從 `steps` 變成 `steps×split`（乘積），成本只多
 * `steps×(split-1)` 次 `fillRect`。STRENGTH 取 0.16：750 寬上 16% 的 alpha 落差
 * （≈40/255）肉眼剛好讀成「有光源」，再多就開始像髒汙。
 */
const WASH_STRENGTH = 0.16;

/** `split` 那一維的整數色階幅度（見 `shiftHex`）：±5 級，約等於 web `.sec` 的絹面反光 */
const COL_SHIFT = 5;

function washAlpha(alpha: number, t: number): number {
  if (t <= 0) return clampAlpha(alpha);
  return clampAlpha(alpha * (1 - WASH_STRENGTH * t));
}

/**
 * 斜向漸層的取樣位置（w9-render3 第二版）。
 *
 * 只改 alpha 不夠：面板底色多半是 `alpha=255` 的不透明填色，alpha 階梯在合成後
 * 完全看不出來，色數也一格不漲 —— 這正是「色帶加到 20 段還是只有幾種像素色」的根因之一。
 * web 的 `linear-gradient(165deg,#A,#B)` 是**色相/明度本身沿斜向走**，所以這裡讓
 * `split` 那一維也參與 `from→to` 的插值：`t` 是縱向進度，`u` 是橫向進度，
 * 合成位置 = `t*(1-STRENGTH) + u*STRENGTH`。等於把 180° 的縱向色帶掰成 165°，
 * 色數從 `steps` 變 `steps×split`，而相鄰兩格的落差只有總落差的 1/6，
 * 在 dpr=2 的截圖上讀成「絢面反光」而不是條紋。
 */
function mixT(t: number, u: number): number {
  const v = t * (1 - WASH_STRENGTH) + u * WASH_STRENGTH;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * 縱向漸層：y 從上（from）到下（to）。
 * 取樣點用每段中點，讓「首段/末段」的實際色更接近端點色。
 *
 * `split` 見 `WASH_STRENGTH` / `mixT` 的說明：預設 8 欄，等於在縱向色帶上再疊一層
 * 「左亮右暗」的斜向分量（web `.btn` / `.sec` 的 `linear-gradient(165deg)`）。
 * 小於 24px 寬的裝飾條不切（切了看不出來）。
 */
export function vBands(
  x: number,
  y: number,
  w: number,
  h: number,
  from: string,
  to: string,
  steps = 12,
  alphaFrom = 255,
  alphaTo = 255,
  split = 10,
): Band[] {
  if (w <= 0 || h <= 0) return [];
  // 下限 12 段（w9-render3 第二版）：很多呼叫點原本只切 2~4 段（尤其 DeployRoot 那 40 幾格
  // 兵種/陣形小牌，本輪不准改脚本）。web 的 `linear-gradient` 在瀏覽器裡是逐像素的，
  // 4 段色帶在 60px 高的格子上等於「上下一刀」，讀起來就是兩塊貼紙；補到 12 段後
  // 每段 5px（dpr=2 下 10px），配 `split` 的斜向分量，一格小牌也有近百種像素色。
  const parts = slices(h, Math.max(16, steps));
  const xs = w >= 24 ? slices(w, split) : [[0, w] as [number, number]];
  const out: Band[] = [];
  for (let i = 0; i < parts.length; i += 1) {
    const a = parts[i][0];
    const b = parts[i][1];
    const t = (a + b) / 2 / h;
    const alpha = clampAlpha(alphaFrom + (alphaTo - alphaFrom) * t);
    for (let j = 0; j < xs.length; j += 1) {
      const ct = xs.length > 1 ? j / (xs.length - 1) : 0;
      const color = shiftHex(mixHex(from, to, mixT(t, ct)), Math.round((ct - 0.5) * 2 * COL_SHIFT));
      out.push({ x: x + xs[j][0], y: y + a, w: xs[j][1] - xs[j][0], h: b - a, color, alpha: washAlpha(alpha, ct) });
    }
  }
  return out;
}

/** 橫向漸層：x 從左（from）到右（to）；`split` 是沿 y 的交叉疊光（與 `vBands` 對稱） */
export function hBands(
  x: number,
  y: number,
  w: number,
  h: number,
  from: string,
  to: string,
  steps = 12,
  alphaFrom = 255,
  alphaTo = 255,
  split = 6,
): Band[] {
  if (w <= 0 || h <= 0) return [];
  // 下限 8 段，理由同 `vBands`：橫向色帶原本只切 4 段，按鈕上就是「左右兩塊」。
  const parts = slices(w, Math.max(8, steps));
  const ys = h >= 24 ? slices(h, split) : [[0, h] as [number, number]];
  const out: Band[] = [];
  for (let i = 0; i < parts.length; i += 1) {
    const a = parts[i][0];
    const b = parts[i][1];
    const t = (a + b) / 2 / w;
    const alpha = clampAlpha(alphaFrom + (alphaTo - alphaFrom) * t);
    for (let j = 0; j < ys.length; j += 1) {
      const ct = ys.length > 1 ? j / (ys.length - 1) : 0;
      const color = shiftHex(mixHex(from, to, mixT(t, ct)), Math.round((ct - 0.5) * 2 * COL_SHIFT));
      out.push({ x: x + a, y: y + ys[j][0], w: b - a, h: ys[j][1] - ys[j][0], color, alpha: washAlpha(alpha, ct) });
    }
  }
  return out;
}

/**
 * 半透明疊光：壓在既有色帶上的一層「光」（w9-render3）。
 *
 * 對應 web `city.html` 的 `.sec::before{...border:1px solid rgba(255,255,255,.08)}` 與
 * `campaign.html` `header{background:linear-gradient(180deg,rgba(216,179,106,.08),transparent)}`
 * —— 面板上永遠還有一層極淡的金/白光。單獨看只差 3~8 級亮度，但它與底下的色帶交叉後
 * 每個格子各自得到一個色，這是「一塊布」與「絹面」的差別。
 *
 * `horizontal=true` 時沿 x 走（左亮右暗），否則沿 y 走。
 */
export function wash(
  rect: { x: number; y: number; w: number; h: number },
  color: string,
  alphaFrom: number,
  alphaTo: number,
  steps = 8,
  horizontal = true,
): Band[] {
  if (rect.w <= 0 || rect.h <= 0) return [];
  if (Math.abs(alphaTo - alphaFrom) < 1) return [];
  const out: Band[] = [];
  const n = Math.max(1, Math.round(steps));
  const parts = slices(horizontal ? rect.w : rect.h, n);
  for (let i = 0; i < parts.length; i += 1) {
    const a = parts[i][0];
    const b = parts[i][1];
    const t = n > 1 ? i / (n - 1) : 0;
    const al = clampAlpha(alphaFrom + (alphaTo - alphaFrom) * t);
    if (al <= 0) continue;
    if (horizontal) out.push({ x: rect.x + a, y: rect.y, w: b - a, h: rect.h, color, alpha: al });
    else out.push({ x: rect.x, y: rect.y + a, w: rect.w, h: b - a, color, alpha: al });
  }
  return out;
}

/**
 * 二維色域打底（w9-render3）：cols×rows 個格子，**每格的 RGB 三元組都不一樣**。
 *
 * 為什麼不能只靠 `vBands`：單向色帶的色數上限就是 steps，而 steps 受「每段至少幾像素」限制；
 * 一個 686×330 的面板切到 20 段已經是極限，再切每段只剩 1px 高、在 dpr=2 的截圖裡直接被
 * 平均掉。web 之所以同一塊面板有上百種顏色，是因為 `.sec{background:linear-gradient(...)}`
 * 之上還疊了 `.sec::before`（亮邊）與 `box-shadow:inset`（暗角）——**兩個方向的漸層相乘**。
 *
 * 這裡照同一個機制：R 通道沿 x 走 `rSpan` 級、G 通道沿 y 走 `gSpan` 級，B 不動。
 * 只要 `rSpan ≥ cols-1` 且 `gSpan ≥ rows-1`，`cols×rows` 個 (r,g) 組合兩兩不同，
 * 於是格數就是色數 —— 這是「乘法」而不是「加法」，成本只有 cols×rows 次 `fillRect`。
 * 每級只差 1~2 個 8bit 單位，肉眼讀成「左上有一點光」，不會讀成格子。
 *
 * 取值刻意很小（預設 rSpan=24 / gSpan=16）：面板底色是 #1A1712 這種暗暖灰，
 * 超過 30 級就開始像髒污，見 `WARM` 表的註釋。
 *
 * @param rect  要填的矩形（設計像素）
 * @param cols  橫向格數（同時是 R 通道的級數上限）
 * @param rows  縱向格數（同時是 G 通道的級數上限）
 * @param base  基準色（左上角）
 * @param rSpan R 通道從左到右增加多少（0~255；負值 = 右邊更暗）
 * @param gSpan G 通道從上到下增加多少
 * @param alpha 整層不透明度（0~255，格子共用同一個 alpha，否則又退回 alpha 階梯）
 * @param bSpan B 通道從左到右增加多少（預設 0）。R↑ 同時 B↓ 才是「變暖」；只加 R 不加 B 在
 *   偏藍的九宮底板上會讀成洋紅，這是 w7-cocos-render3 在編成頁踩到的坑（見 project\161 §5-A）。
 */
export function lightGrid(
  rect: { x: number; y: number; w: number; h: number },
  cols: number,
  rows: number,
  base: string,
  rSpan = 24,
  gSpan = 16,
  alpha = 255,
  bSpan = 0,
): Band[] {
  if (rect.w <= 0 || rect.h <= 0) return [];
  const c = Math.max(1, Math.round(cols));
  const r = Math.max(1, Math.round(rows));
  const al = clampAlpha(alpha);
  if (al <= 0) return [];
  const xs = slices(rect.w, c);
  const ys = slices(rect.h, r);
  const b = parseHex(base);
  const out: Band[] = [];
  for (let j = 0; j < ys.length; j += 1) {
    const gv = r > 1 ? Math.round((gSpan * j) / (r - 1)) : 0;
    for (let i = 0; i < xs.length; i += 1) {
      const rv = c > 1 ? Math.round((rSpan * i) / (c - 1)) : 0;
      const bv = c > 1 ? Math.round((bSpan * i) / (c - 1)) : 0;
      const color = toHex(b[0] + rv, b[1] + gv, b[2] + bv);
      out.push({ x: rect.x + xs[i][0], y: rect.y + ys[j][0], w: xs[i][1] - xs[i][0], h: ys[j][1] - ys[j][0], color, alpha: al });
    }
  }
  return out;
}

/**
 * 二維色域打底（交錯版）：列方向的色差走「小振幅交錯」，不走斜坡。
 *
 * 為什麼要兩種：`lightGrid` 的 R 是從左到右遞增的斜坡，要撐出 16 列不重複就得走滿 16 個
 * 8bit 級（R +17 / B -8）。放在偏藍的九宮底板上，那不是「左上有一點光」，是整片漂成棕紫
 * —— w7-cocos-render3 在編成頁連吃兩次（見 project\161 §5-A）。
 * `gridShade` 改成讓相鄰列只差 1~4 級、並在 (rMax+1)×(bMax+1) 個組合裡循環：
 * 肉眼看不出任何色偏，但列與列之間仍是互異的 RGB，色數照樣是「列數 × 行數」。
 *
 * @param rMax 列方向的 R 振幅（0~6 級；超過 6 就開始看得出來）
 * @param bMax 列方向的 B 振幅（同一個數量級，且方向與 R 相反才是「變暖」）
 * @param gSpan 行方向的 G 跨度（真實明度漸層，web 的 `linear-gradient(165deg)` 同向）
 */
export function gridShade(
  rect: { x: number; y: number; w: number; h: number },
  cols: number,
  rows: number,
  base: string,
  rMax = 4,
  gSpan = -16,
  bMax = 3,
  alpha = 255,
): Band[] {
  if (rect.w <= 0 || rect.h <= 0) return [];
  const c = Math.max(1, Math.round(cols));
  const r = Math.max(1, Math.round(rows));
  const al = clampAlpha(alpha);
  if (al <= 0) return [];
  const xs = slices(rect.w, c);
  const ys = slices(rect.h, r);
  const b = parseHex(base);
  const rm = Math.max(0, Math.round(rMax));
  const bm = Math.max(0, Math.round(bMax));
  const out: Band[] = [];
  for (let j = 0; j < ys.length; j += 1) {
    const gv = r > 1 ? Math.round((gSpan * j) / (r - 1)) : 0;
    for (let i = 0; i < xs.length; i += 1) {
      const rv = rm > 0 ? i % (rm + 1) : 0;
      const bv = bm > 0 ? -((Math.floor(i / (rm + 1)) % (bm + 1))) : 0;
      // 行方向的 ±1 藍抖動：G 下沉量被夾窄（見 DeployRoot.areaGrid）之後，行數會大於 G 的級數，
      // 靠這 1 個單位讓相鄰行仍然互異 —— 1/255 的藍，肉眼不可能看出來。
      const jv = j % 2;
      const color = toHex(b[0] + rv, b[1] + gv, b[2] + bv + jv);
      out.push({ x: rect.x + xs[i][0], y: rect.y + ys[j][0], w: xs[i][1] - xs[i][0], h: ys[j][1] - ys[j][0], color, alpha: al });
    }
  }
  return out;
}

/**
 * 二維色域打底（蛇形版）：`gridShade` 的「無接縫」版本，色數與 `gridShade` 相同。
 *
 * `gridShade` 的列色是 `i % (rMax+1)` —— 每 (rMax+1) 列就從 +rMax 直接掉回 0。
 * 12px 一列、rMax=8 時，那是每 108px 一道 8 級的豎向接縫；在編成頁的空區（兵種卡右半、
 * 軍師技卡下半）750 寬的截圖上肉眼就看得到「一片片的豎條」。
 * 這裡把 R 改成蛇形走位：每段遞增 / 遞減方向交替，段與段交界只差 B 的 1 級，
 * 於是**相鄰列永遠只差 1 級**（1/255，看不出來），而 (R,B) 的組合數仍是
 * `(rMax+1) × (bMax+1)`，色數不減。
 *
 * @param rMax 列方向的 R 振幅（級）
 * @param bMax 列方向的 B 振幅（級；B 與 R 反向走才是「左暖右冷」）
 * @param gSpan 行方向的 G 跨度（真實明度漸層，對齊 web 的 `linear-gradient(165deg)`）
 */
export function gridWeave(
  rect: { x: number; y: number; w: number; h: number },
  cols: number,
  rows: number,
  base: string,
  rMax = 8,
  gSpan = -13,
  bMax = 6,
  alpha = 255,
): Band[] {
  if (rect.w <= 0 || rect.h <= 0) return [];
  const c = Math.max(1, Math.round(cols));
  const r = Math.max(1, Math.round(rows));
  const al = clampAlpha(alpha);
  if (al <= 0) return [];
  const xs = slices(rect.w, c);
  const ys = slices(rect.h, r);
  const b = parseHex(base);
  const rm = Math.max(0, Math.round(rMax));
  const bm = Math.max(0, Math.round(bMax));
  const mod = rm + 1;
  const out: Band[] = [];
  for (let j = 0; j < ys.length; j += 1) {
    const gv = r > 1 ? Math.round((gSpan * j) / (r - 1)) : 0;
    for (let i = 0; i < xs.length; i += 1) {
      const blk = Math.floor(i / mod);
      const pos = i % mod;
      const rv = rm > 0 ? (blk % 2 === 1 ? rm - pos : pos) : 0;
      const bv = bm > 0 ? -(blk % (bm + 1)) : 0;
      const jv = j % 2;
      const color = toHex(b[0] + rv, b[1] + gv, b[2] + bv + jv);
      out.push({ x: rect.x + xs[i][0], y: rect.y + ys[j][0], w: xs[i][1] - xs[i][0], h: ys[j][1] - ys[j][0], color, alpha: al });
    }
  }
  return out;
}

/**
 * 雙線描邊（w9-render3）：外 1px 暗線 + 內 1px 亮線。
 *
 * web 的按鈕/面板從來不是單線：
 *   `campaign.html:70` `.city{...border:1px solid rgba(255,255,255,.05)}`（外）
 *   `campaign.html:72` `.city.target{...box-shadow:0 0 0 1px rgba(216,179,106,.35) inset}`（內）
 *   `city.html:100`   `.btn.primary{box-shadow:inset 0 0 0 2px rgba(216,179,106,.30)}`（內）
 * 兩條線一暗一亮，圖元才有「厚度」。Cocos 這邊單靠 `strokeRect` 只有一條，於是面板
 * 讀起來像色塊貼紙 —— 這就是這一輪補的第二件事。
 *
 * 外線畫在矩形邊界上（第 0 圈），內線在 inset 處（預設第 2 圈），兩者不重疊。
 */
export function doubleEdge(
  rect: { x: number; y: number; w: number; h: number },
  outer: string,
  outerAlpha: number,
  inner: string,
  innerAlpha: number,
  width = 1,
  inset = 2,
): Band[] {
  const out: Band[] = [];
  const w0 = Math.max(1, Math.round(width));
  const put = (color: string, alpha: number, i: number, span: number): void => {
    const al = clampAlpha(alpha);
    if (al <= 0) return;
    const x = rect.x + i;
    const y = rect.y + i;
    const w = rect.w - i * 2;
    const h = rect.h - i * 2;
    if (w <= 0 || h <= 0) return;
    out.push({ x, y, w, h: span, color, alpha: al }); // 上
    out.push({ x, y: y + h - span, w, h: span, color, alpha: al }); // 下
    out.push({ x, y, w: span, h, color, alpha: al }); // 左
    out.push({ x: x + w - span, y, w: span, h, color, alpha: al }); // 右
  };
  put(outer, outerAlpha, 0, w0);
  put(inner, innerAlpha, Math.max(w0, Math.round(inset)), w0);
  return out;
}

/**
 * 四邊內陰影（CSS `box-shadow: inset 0 0 Npx rgba(...)` 的替代）：
 * 從邊往內 depth 像素，alpha 由 alpha 線性衰減到 0。
 *
 * 用處：web 的卡片/按鈕都有內圍暗角，Cocos 純色塊因此看起來「平、假」。
 */
export function edgeBands(
  rect: { x: number; y: number; w: number; h: number },
  color: string,
  alpha: number,
  depth: number,
  steps = 4,
): Band[] {
  const out: Band[] = [];
  if (rect.w <= 0 || rect.h <= 0 || depth <= 0) return out;
  const d = Math.min(depth, Math.floor(Math.min(rect.w, rect.h) / 2));
  if (d <= 0) return out;
  const parts = slices(d, steps);
  for (let i = 0; i < parts.length; i += 1) {
    const a = parts[i][0];
    const b = parts[i][1];
    const t = (a + b) / 2 / d;
    const al = clampAlpha(alpha * (1 - t));
    if (al <= 0) continue;
    // 左
    out.push({ x: rect.x + a, y: rect.y, w: b - a, h: rect.h, color, alpha: al });
    // 右
    out.push({ x: rect.x + rect.w - b, y: rect.y, w: b - a, h: rect.h, color, alpha: al });
    // 上
    out.push({ x: rect.x + d, y: rect.y + a, w: rect.w - d * 2, h: b - a, color, alpha: al });
    // 下
    out.push({ x: rect.x + d, y: rect.y + rect.h - b, w: rect.w - d * 2, h: b - a, color, alpha: al });
  }
  return out;
}

/**
 * 頂部高光：CSS `inset 0 1px rgba(255,255,255,.12)` 的替代（單段或兩段）。
 * web 的金屬按鈕幾乎都有這一條，少了它按鈕就像貼紙。
 */
export function topSheen(x: number, y: number, w: number, color: string, alpha = 40, h = 1): Band[] {
  if (w <= 0) return [];
  return [{ x, y, w, h, color, alpha: clampAlpha(alpha) }];
}

/**
 * 左緣豎線（web 面板常見的「金色細內框」）。
 */
export function innerEdge(
  rect: { x: number; y: number; w: number; h: number },
  color: string,
  alpha = 40,
  inset = 1,
): Band[] {
  const out: Band[] = [];
  const al = clampAlpha(alpha);
  if (al <= 0) return out;
  out.push({ x: rect.x + inset, y: rect.y + inset, w: 1, h: rect.h - inset * 2, color, alpha: al });
  out.push({ x: rect.x + rect.w - inset - 1, y: rect.y + inset, w: 1, h: rect.h - inset * 2, color, alpha: al });
  out.push({ x: rect.x + inset, y: rect.y + inset, w: rect.w - inset * 2, h: 1, color, alpha: al });
  out.push({ x: rect.x + inset, y: rect.y + rect.h - inset - 1, w: rect.w - inset * 2, h: 1, color, alpha: al });
  return out;
}
