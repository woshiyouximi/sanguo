/**
 * 竖屏战斗视图的配色 / 字号 / 间距常量。
 *
 * 这个文件不引用 `cc`，也不引用 DOM —— 它是两套渲染实现（Canvas2D 预览 /
 * Cocos Graphics）共用的"设计 token"。颜色取自 `project/03_美术风格与资源规范.md`，
 * 三带尺寸取自 `project/02_战斗重构设计.md §2.5`。
 */

/** 基础色板（深色底 + 双阵营 + 金） */
export const COLORS = {
  /** 全局底色 #14171C（依据：project/03 深色底） */
  bg: '#14171C',
  /** 比底色再深一档，用于 HUD / 控制台 */
  bgDeep: '#0E1116',
  /** 战场带底色，略偏冷 */
  field: '#11161D',
  /** 面板 */
  panel: '#1A1F27',
  panelHi: '#232B36',
  /** 分割线 */
  line: '#2C3440',
  lineSoft: 'rgba(255,255,255,0.055)',
  lineStrong: 'rgba(255,255,255,0.13)',

  /** 文本 */
  text: '#E9E4D8',
  textDim: '#9AA3AE',
  textFaint: '#65707C',

  /** 我方蓝 #4C7DF0（依据：project/03） */
  ours: '#4C7DF0',
  oursDark: '#2C4E9E',
  oursLight: '#9DB8FF',
  /** 敌方红 #E2604A（依据：project/03） */
  enemy: '#E2604A',
  enemyDark: '#9E3A2B',
  enemyLight: '#FFA18E',
  /** 金 #D8B36A（依据：project/03） */
  gold: '#D8B36A',
  goldDim: '#8A6F3E',
  goldLight: '#F0D79C',

  /** 语义色 */
  heal: '#69C98A',
  danger: '#E2604A',
  ok: '#69C98A',
  white: '#FFFFFF',
  black: '#000000',

  /** 半透明遮罩 / 阴影 */
  shadow: 'rgba(0,0,0,0.42)',
  overlay: 'rgba(6,8,12,0.78)',
  panelAlpha: 'rgba(20,24,31,0.94)',
} as const;

/** 字体栈：优先系统中文黑体，Canvas 与 Cocos Label 都可用 */
export const FONT_FAMILY =
  '"Noto Sans SC","Source Han Sans SC","PingFang SC","Microsoft YaHei",sans-serif';

/** 字号（px，按 750×1334 设计分辨率） */
export const FONT = {
  /** 结算大字 */
  hero: 64,
  /** 页面标题 */
  title: 34,
  /** 区块标题 / 胜负 */
  h1: 30,
  h2: 24,
  /** 正文 */
  body: 20,
  /** 次要信息 */
  small: 16,
  /** 标签 / 角标 */
  tiny: 12,
  /** 数字（计时、兵力） */
  num: 26,
  /** 飘字 */
  float: 20,
} as const;

/** 间距（8 的倍数为主） */
export const SPACE = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

/** 圆角 */
export const RADIUS = {
  sm: 6,
  md: 10,
  lg: 16,
  pill: 999,
} as const;

/** 线宽 */
export const LINE = {
  hair: 1,
  thin: 2,
  thick: 4,
  heavy: 6,
} as const;

/**
 * 把 `#RRGGBB` 转成 `rgba()`。视图里大量需要"同色不同透明度"，
 * 预先写死 rgba 会让调色变成两份真相，所以在构建指令时现算。
 */
export function withAlpha(hex: string, alpha: number): string {
  const a = Math.max(0, Math.min(1, alpha));
  if (hex.startsWith('rgba(') || hex.startsWith('rgb(')) return hex;
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = Number.parseInt(full, 16);
  if (!Number.isFinite(n) || full.length !== 6) return hex;
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return `rgba(${r},${g},${b},${a.toFixed(3)})`;
}

/** 阵营主色 */
export function sideColor(side: 'A' | 'B'): string {
  return side === 'A' ? COLORS.ours : COLORS.enemy;
}

/** 阵营亮色（描边 / 高光） */
export function sideLight(side: 'A' | 'B'): string {
  return side === 'A' ? COLORS.oursLight : COLORS.enemyLight;
}

/** 阵营暗色（底 / 阴影） */
export function sideDark(side: 'A' | 'B'): string {
  return side === 'A' ? COLORS.oursDark : COLORS.enemyDark;
}
