/**
 * 文字层级（六级 role）—— 四页 UI 共用的字号 / 描边 / 阴影策略。
 *
 * 为什么要单独一层：四页里 Label 是各自 `makeLabel()` 建的（CampaignRoot 用 cx/cy，
 * CityPanel/ItemsPanel 用 rect，DeployRoot 用 cx/cy），字号散在 11~28px 之间、描边
 * 有的加有的没加，观感上「同一层级的字长得不一样」。这里把「层级 → 字号/描边/阴影」
 * 收成一张表，各页只声明自己的语义（页标题 / 卡片标题 / 正文 / 数值），不再各写一份
 * `fontSize=18` 之类的魔数。
 *
 * w9-render3：四级 → 六级。web 版一屏里的字号差是 6~7 档（`city.html` 的
 * `.title 40` / `.sec-title 22` / `body 18` / `.num 20` / `.tip 13` / `.chip 11`），
 * 四级不够用，结果是「提示」和「正文」挤在同一档（18），「按钮角标」和「正文」也挤在
 * 一起 —— 层级就靠颜色在撑。新增的两级：
 *   tip   13px —— 面板底部的一句提示、列表行的说明（web `.tip`/`.hint`）
 *   badge 11px —— 按钮右下角的小注、四槽的空态字、页码「第 x/8 頁」（web `.chip`/`.sub`）
 *
 * 实现说明（3.8.8）：`LabelOutline` / `LabelShadow` 两个组件自 v3.8.2 起 deprecated，
 * 官方替代就是 `Label.enableOutline / outlineWidth / outlineColor` 与
 * `Label.enableShadow / shadowColor / shadowOffset / shadowBlur`——引擎内部仍然落到
 * 这两个组件上（`ArtLayer.addOutline()` 也是这么写的）。为了不刷 deprecated 警告、
 * 也为了和既有代码一致，这里走 Label 上的门面属性。
 *
 * 唯一不改的是 `label.color`：CampaignRoot 的城名 / 数值是按势力色板逐条染色
 * （`cityTintOf()`），这里改颜色会把色板语义抹掉。role 只管字号、描边、阴影。
 */
import { Color, Label, Vec2 } from 'cc';

export type TextRole = 'title' | 'head' | 'body' | 'num' | 'tip' | 'badge';

export interface TextRoleSpec {
  /** 设计像素字号（750×1334 设计稿） */
  readonly fontSize: number;
  /** 描边宽度（px），0 表示不描边 */
  readonly outlineWidth: number;
  /** 描边色（深色，压在浅底图上才透得出来） */
  readonly outlineColor: string;
  /** 是否投影 */
  readonly shadow: boolean;
  /** 投影偏移（x, y），Cocos 里 y 正方向朝上 */
  readonly shadowOffset: readonly [number, number];
  /** 投影模糊半径 */
  readonly shadowBlur: number;
  readonly shadowColor: string;
}

/**
 * 六级 role 表（改这里等于改全工程的文字层级，验收脚本
 * `work\cocos_skinapply\skin_nodes_assert.mjs` 会逐项比对前四级的这几个数字）。
 *
 * 新增的两级（tip / badge）与既有四级同形（字段顺序、字面量写法都不能变）：
 * 断言脚本 `parseRoles()` 用一条正则逐字段抓这张表，任何一项写得不一样就整条抓不到。
 */
export const TEXT_ROLES: Readonly<Record<TextRole, TextRoleSpec>> = {
  title: { fontSize: 40, outlineWidth: 2, outlineColor: '#06080C', shadow: true, shadowOffset: [0, -2], shadowBlur: 2, shadowColor: '#000000' },
  head: { fontSize: 22, outlineWidth: 1, outlineColor: '#06080C', shadow: true, shadowOffset: [0, -1], shadowBlur: 1, shadowColor: '#000000' },
  body: { fontSize: 18, outlineWidth: 1, outlineColor: '#06080C', shadow: false, shadowOffset: [0, 0], shadowBlur: 0, shadowColor: '#000000' },
  num: { fontSize: 20, outlineWidth: 1, outlineColor: '#06080C', shadow: false, shadowOffset: [0, 0], shadowBlur: 0, shadowColor: '#000000' },
  tip: { fontSize: 13, outlineWidth: 1, outlineColor: '#06080C', shadow: false, shadowOffset: [0, 0], shadowBlur: 0, shadowColor: '#000000' },
  badge: { fontSize: 11, outlineWidth: 1, outlineColor: '#06080C', shadow: false, shadowOffset: [0, 0], shadowBlur: 0, shadowColor: '#000000' },
};

/** 没有 lineHeight 时的兜底行高比（各页原有 1.35 / 1.4 / 1.42 / 1.45 会被保留） */
const DEFAULT_LINE_RATIO = 1.4;

/** `#RRGGBB` / `#RGB` → Color（alpha 默认 255）。传进来非法值就退回纯黑。 */
export function hexColor(hex: string, alpha = 255): Color {
  const raw = typeof hex === 'string' ? hex.trim().replace('#', '') : '';
  const norm = raw.length === 3 ? raw[0] + raw[0] + raw[1] + raw[1] + raw[2] + raw[2] : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(norm)) return new Color(0, 0, 0, alpha);
  const v = parseInt(norm, 16);
  return new Color((v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff, alpha);
}

/** 某个 role 的默认字号（各页要按版式降级时先问它，别再抄魔数） */
export function roleFontSize(role: TextRole): number {
  const spec = TEXT_ROLES[role];
  return spec ? spec.fontSize : TEXT_ROLES.body.fontSize;
}

/**
 * 把 role 套到一个 Label 上。
 *
 * `fontSize` 是**版式豁免**：某些位置的字号被既有矩形锁死（城名 14px 由
 * `CITY_LABEL_FONT` 决定、命令按钮副标题 14px…），传进来就只改「描边/阴影策略」，
 * 不改字号。行高按该 Label 原有比例换算，所以 multiline 的排版（两个按钮里的
 * 「標題\n說明」）不会被挤开。
 */
export function applyTextRole(label: Label | null | undefined, role: TextRole, fontSize?: number): void {
  if (!label || !label.isValid) return;
  const spec = TEXT_ROLES[role];
  if (!spec) return;

  const size = fontSize && fontSize > 0 ? fontSize : spec.fontSize;
  const prevSize = label.fontSize > 0 ? label.fontSize : size;
  const prevLine = label.lineHeight > 0 ? label.lineHeight : prevSize * DEFAULT_LINE_RATIO;
  const ratio = prevSize > 0 && Number.isFinite(prevLine / prevSize) ? prevLine / prevSize : DEFAULT_LINE_RATIO;

  label.fontSize = size;
  label.lineHeight = Math.max(1, Math.round(size * (ratio > 0 ? ratio : DEFAULT_LINE_RATIO)));

  label.enableOutline = spec.outlineWidth > 0;
  if (spec.outlineWidth > 0) {
    label.outlineColor = hexColor(spec.outlineColor);
    label.outlineWidth = spec.outlineWidth;
  }

  if (spec.shadow) {
    label.enableShadow = true;
    label.shadowColor = hexColor(spec.shadowColor);
    label.shadowOffset = new Vec2(spec.shadowOffset[0], spec.shadowOffset[1]);
    label.shadowBlur = spec.shadowBlur;
  } else {
    label.enableShadow = false;
  }
}

/** 批量套同一 role（页头三行、战报 8 行这类同层级的字）。 */
export function applyTextRoles(
  labels: readonly (Label | null | undefined)[],
  role: TextRole,
  fontSize?: number,
): void {
  for (const label of labels) applyTextRole(label, role, fontSize);
}
