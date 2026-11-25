// #region 版式纯函数
// work/cocos_map84/probe.mjs 会逐字节抽取本段（去类型后在 node 里 import 断言），
// 所以这一段**不许 import 'cc'、不许碰 Node/Component**。改结构请同步跑探针。
/** 城点图元缩放：对齐 web campaign.html 的 `CITY_ICON_K = 0.65`（49×35 最大档 → 32×23）。 */
export const CITY_ICON_K = 0.65;
/** 图元最短边：图集页切坏时也不至于变成 0×0 的隐形城点。 */
export const CITY_ICON_MIN = 10;
/** 图元最长边：即使拿到的是整页图集（2048），也绝不能铺满屏——兜底。 */
export const CITY_ICON_MAX = 64;
/**
 * 城点图元尺寸：**只认 spriteFrame 自己的 rect / originalSize**。
 * `spriteFrame.texture.width` 是图集页宽（实测 2048×2048），拿它当 contentSize 会把城点
 * 画成整屏（project/98 对照复查 §5乙②）。
 */
export function cityIconSize(frame, k = CITY_ICON_K) {
    const ow = frame ? Number(frame.originalSize.width) || Number(frame.rect.width) || 0 : 0;
    const oh = frame ? Number(frame.originalSize.height) || Number(frame.rect.height) || 0 : 0;
    const clamp = (v) => Math.min(CITY_ICON_MAX, Math.max(CITY_ICON_MIN, Math.round(v * k)));
    return { width: clamp(ow), height: clamp(oh) };
}
/** 标签字号 / 与城点的最小间距（与 start() 里 makeLabel(..., 14, ...) 一致）。 */
export const CITY_LABEL_FONT = 14;
export const CITY_LABEL_GAP = 3;
/** Label 是 overflow=NONE，视觉宽度就是字宽；110 的排版框不参与避让。 */
export function cityLabelWidth(name, fontSize) {
    return Math.max(18, Array.from(name).length * fontSize + 2);
}
function labelOverlapArea(box, placed) {
    let total = 0;
    for (const other of placed) {
        const ox = Math.min(box.x + box.w / 2, other.x + other.w / 2) - Math.max(box.x - box.w / 2, other.x - other.w / 2);
        const oy = Math.min(box.y + box.h / 2, other.y + other.h / 2) - Math.max(box.y - box.h / 2, other.y - other.h / 2);
        if (ox > 0 && oy > 0)
            total += ox * oy;
    }
    return total;
}
/**
 * 城名标签错开：按屏幕 y 从北到南排序，名次奇偶决定默认朝上/朝下（web `li % 2` 的同款思路），
 * 撞到已摆好的标签就沿同方向再让一行，让不出来再换方向。返回与 `items` 同序的框。
 * 旧实现把 y 夹到 `MAP_VIEW.y + 14`，60 城全叠在 y=144（project/98 对照复查 §5乙③）。
 */
export function layoutCityLabels(items, opts) {
    const h = Math.max(14, Math.round(opts.fontSize * 1.5));
    const steps = opts.steps ?? 14;
    const order = items
        .map((_, index) => index)
        .sort((a, b) => items[a].y - items[b].y || items[a].x - items[b].x || (items[a].name < items[b].name ? -1 : 1));
    const out = new Array(items.length);
    const placed = [];
    order.forEach((index, rank) => {
        const item = items[index];
        const w = cityLabelWidth(item.name, opts.fontSize);
        const x = Math.min(Math.max(item.x, w / 2 + 3), opts.screenW - w / 2 - 3);
        const dirs = rank % 2 === 0 ? [-1, 1] : [1, -1];
        let best = null;
        let bestOverlap = Number.POSITIVE_INFINITY;
        for (const dir of dirs) {
            for (let k = 0; k < steps; k += 1) {
                const y = dir < 0
                    ? item.y - item.iconH - opts.gap - h / 2 - k * (h + 2)
                    : item.y + opts.gap + h / 2 + k * (h + 2);
                if (y - h / 2 < opts.top || y + h / 2 > opts.bottom)
                    continue;
                const candidate = { name: item.name, x, y, w, h, up: dir < 0, rank };
                const overlap = labelOverlapArea(candidate, placed);
                if (overlap === 0) {
                    best = candidate;
                    bestOverlap = 0;
                    break;
                }
                if (overlap < bestOverlap) {
                    best = candidate;
                    bestOverlap = overlap;
                }
            }
            if (bestOverlap === 0)
                break;
        }
        // 60 城在 900 高的视口里总有空位；真找不到就贴在上边界，宁可压一行也不出界。
        const box = best ?? { name: item.name, x, y: opts.top + h / 2, w, h, up: true, rank };
        out[index] = box;
        placed.push(box);
    });
    return out;
}
/** 装饰带渐变：web `drawBands` 的 #1D1710 →(0.55) #15110C → #100D09。 */
export const BAND_STOPS = [
    { t: 0, r: 29, g: 23, b: 16 },
    { t: 0.55, r: 21, g: 17, b: 12 },
    { t: 1, r: 16, g: 13, b: 9 },
];
/** 按 t∈[0,1] 在装饰带渐变上取色（返回分量，不依赖 cc.Color，方便单测）。 */
export function bandColorAt(t) {
    const clamped = Math.min(1, Math.max(0, t));
    let lo = BAND_STOPS[0];
    let hi = BAND_STOPS[BAND_STOPS.length - 1];
    for (let i = 0; i < BAND_STOPS.length - 1; i += 1) {
        if (clamped >= BAND_STOPS[i].t && clamped <= BAND_STOPS[i + 1].t) {
            lo = BAND_STOPS[i];
            hi = BAND_STOPS[i + 1];
            break;
        }
    }
    const span = hi.t - lo.t || 1;
    const k = (clamped - lo.t) / span;
    return {
        r: Math.round(lo.r + (hi.r - lo.r) * k),
        g: Math.round(lo.g + (hi.g - lo.g) * k),
        b: Math.round(lo.b + (hi.b - lo.b) * k),
    };
}
/** HUD 上下压条高度：装饰带的外侧金线要落在压条内侧，否则会被压掉。 */
export const HUD_TOP = 124;
export const HUD_BOTTOM = 1080;
/**
 * 底圖縮放係數：**只按寬度**等比（web `.bgmap` 是 750 頂寬貼圖，750/1280 = 0.5859375）。
 * v18-cocos-layout 新增；常數寫死在區內（本段要能被探針整段抽出去單獨編譯，
 * 不能引用區外的 `MAP_IMAGE_W`）。
 */
export function baseMapScale(viewW, imageW = 1280) {
    return viewW / imageW;
}
/**
 * 底圖矩形（設計座標）：寬度鋪滿 `view` 寬、按 1280×960 等比得高、在 `view` 內**垂直居中**，
 * 上下剩餘空間就是裝裱帶。回傳的 x 恆等於 view.x、w 恆等於 view.w
 * → 左右溢出恆為 0（舊版 813.6 寬居中，兩側各溢出 14.63 / 48.96 px）。
 *
 * 對齊 web（`campaign.html` 的 `#mapwrap` 695 高、`.bgmap` 0,332 750×562.5）：
 * 底圖不裁、不拉伸、不 cover，留白由 `.bgveil` / 裝裱帶負責。
 */
export function baseMapRect(view, imageW = 1280, imageH = 960) {
    const k = baseMapScale(view.w, imageW);
    const h = imageH * k;
    return { x: view.x, y: view.y + (view.h - h) / 2, w: view.w, h };
}
/**
 * 底图版式：一张 1280×960 的 CHINAMAP 等比铺满 view 宽（`baseMapRect()`，750×562.5，
 * 左右溢出 0），上下剩余空间交给装饰带。
 *
 * `designH` 是**面板底邊**而不是畫布高：v18 起 buildArt 傳 `CONSOLE_TOP=830`，
 * 這樣下帶只到控制台頂邊，不會在戰報下面再鋪一層漸變。
 * 預設 `hudTop/hudBottom` 仍錨在 124/1080（`layout_guard.mjs` 會驗這兩個值）。
 */
export function planBaseMap(rect, designW, designH, hudTop = HUD_TOP, hudBottom = HUD_BOTTOM) {
    // 上带 ceil、下带 floor：图幅 y 是 279.99…这种小数，带子要**盖住**图边而不是留 1px 缝
    const topEdge = Math.max(0, Math.ceil(rect.y));
    const bottomEdge = Math.min(designH, Math.floor(rect.y + rect.h));
    const map = { x: rect.x, y: rect.y, w: rect.w, h: rect.h };
    return {
        images: [{ path: 'map/chinamap', rect: map }],
        bands: {
            map,
            top: { x: 0, y: 0, w: designW, h: topEdge },
            bottom: { x: 0, y: bottomEdge, w: designW, h: Math.max(0, designH - bottomEdge) },
        },
        rails: {
            top: [topEdge - 4, hudTop + 2],
            bottom: [Math.min(designH - 2, bottomEdge + 1), hudBottom - 8],
        },
    };
}
