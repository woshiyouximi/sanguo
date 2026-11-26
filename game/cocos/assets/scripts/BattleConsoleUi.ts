/**
 * R218 竖屏战斗底栏（重排版）：主将行 + 部队行 + 全局动作，替掉旧的
 * 「突擊/撤退 chip + 武將技按钮 + 部隊指令二级菜单」那套重复入口。
 *
 * 布局（设计坐标，竖屏 750×1334）：
 *
 *   y 1000 ┌───────────────────────────────────────────────┐
 *          │ 主将块（HUD 画头像/武智） │ 技能格 1..n（动态） │  右侧 2×3：6 条部队指令
 *   y 1120 ├───────────────────────────────────────────────┤  （前進/後退/分散/集中/
 *          │ 全局 4 钮（保護/出擊/待機/撤退）│ 消息框       │    待機/突擊）
 *   y 1334 └───────────────────────────────────────────────┘
 *
 * 技能格按「当前可释放技数」出格，空槽不画；n=0 时显示一行「無武將技」。
 * 本模块只读 world，纯数据；绘制仍由 BattleRoot 的通用 CmdItem 渲染器完成。
 */
import type { World } from './core/battle';
import { armyMenuItems, cmd6Defs, cmd6Rects, cmd6Usable } from './BattleCmdUi';
import type { CmdBg, Cmd6Kind, CmdItem } from './BattleCmdUi';
import type { Rect } from './view/layout';
import { COLORS } from './view/theme';

/** 技能行：主将块右侧，单行最多 6 格 */
export const SKILL_ROW = { x: 116, y: 1120, w: 392, h: 90 };
/** 技能格之间的缝 */
const SKILL_GAP = 4;
/** 全局动作列：贴左，4 颗竖排 */
export const GLOBAL_COL = { x: 8, y: 1120, w: 100, h: 46, gap: 6 };
/** 部队指令格沿用旧的右侧 2×3 几何（524..742 / 1030..1302） */
export const ARMY_RECTS: readonly Rect[] = cmd6Rects();

/** 技能格矩形：按实际可释放技数动态分配宽度（最多 6 格，最宽 88） */
export function skillCellRects(count: number): Rect[] {
  const n = Math.max(0, Math.min(6, Math.trunc(count)));
  if (n === 0) return [];
  const w = Math.min(88, Math.floor((SKILL_ROW.w - SKILL_GAP * (n - 1)) / n));
  const out: Rect[] = [];
  for (let i = 0; i < n; i += 1) {
    out.push({ x: SKILL_ROW.x + i * (w + SKILL_GAP), y: SKILL_ROW.y, w, h: SKILL_ROW.h });
  }
  return out;
}

/** 全局 4 颗：保護主將 / 武將出擊 / 主將待機|後退 / 全軍撤退 */
export function globalRects(): Rect[] {
  const out: Rect[] = [];
  for (let i = 0; i < 4; i += 1) {
    out.push({
      x: GLOBAL_COL.x,
      y: GLOBAL_COL.y + i * (GLOBAL_COL.h + GLOBAL_COL.gap),
      w: GLOBAL_COL.w,
      h: GLOBAL_COL.h,
    });
  }
  return out;
}

const GLOBAL_KINDS: readonly Cmd6Kind[] = ['guardLord', 'sortie', 'lordOrder', 'retreat'];
/** 全局按钮 → 第一层 6 颗的下标（cmd6Usable 用下标查可用） */
const CMD6_INDEX: Record<string, number> = {
  guardLord: 0,
  armyMenu: 1,
  skillPage: 2,
  sortie: 3,
  lordOrder: 4,
  retreat: 5,
};

export interface ConsoleSkill {
  name: string;
  mp: number;
}

export interface ConsoleHit {
  type: 'skill' | 'armyCmd' | 'global';
  index?: number;
  slot?: number;
  kind?: Cmd6Kind;
}

function inRect(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

function bg(id: string, rect: Rect, skin: string, alpha = 255): CmdBg {
  return { kind: 'bg', id, rect: { ...rect }, skin, alpha };
}

/**
 * 造底栏的绘制模型。`skills` 是本局主将可释放的武将技（已按等级过滤），
 * `mode` 决定按钮可用性；返回值顺序即 z 序。
 */
export function buildConsoleUi(
  world: World | null | undefined,
  skills: readonly ConsoleSkill[],
  mode: 'idle' | 'fighting' | 'settled',
): CmdItem[] {
  const items: CmdItem[] = [];
  const fighting = mode === 'fighting';

  // ---- 技能行（动态格数；空槽不画） ----
  const rects = skillCellRects(skills.length);
  const generalMp = world?.sides.A.general.alive ? world.sides.A.general.mp : 0;
  for (let i = 0; i < rects.length; i += 1) {
    const r = rects[i]!;
    const s = skills[i]!;
    const usable = fighting && generalMp >= s.mp;
    items.push(bg(`skill.${i}.bg`, r, 'plate_sq', usable ? 235 : 140));
    items.push({
      kind: 'text',
      id: `skill.${i}.idx`,
      text: String(i + 1),
      x: r.x + 6,
      y: r.y + 10,
      w: 24,
      size: 10,
      color: COLORS.textFaint,
      align: 'left',
      bold: false,
    });
    items.push({
      kind: 'text',
      id: `skill.${i}.name`,
      text: s.name,
      x: r.x + r.w / 2,
      y: r.y + 40,
      w: r.w - 4,
      size: r.w >= 80 ? 15 : 13,
      color: usable ? COLORS.text : COLORS.textFaint,
      align: 'center',
      bold: true,
    });
    items.push({
      kind: 'text',
      id: `skill.${i}.mp`,
      text: `技${s.mp}`,
      x: r.x + r.w / 2,
      y: r.y + r.h - 12,
      w: r.w - 4,
      size: 10,
      color: usable ? COLORS.goldDim : COLORS.textFaint,
      align: 'center',
      bold: false,
    });
  }
  if (rects.length === 0) {
    items.push({
      kind: 'text',
      id: 'skill.none',
      text: '無可施放武將技',
      x: SKILL_ROW.x + SKILL_ROW.w / 2,
      y: SKILL_ROW.y + SKILL_ROW.h / 2,
      w: SKILL_ROW.w,
      size: 12,
      color: COLORS.textFaint,
      align: 'center',
      bold: false,
    });
  }

  // ---- 部队指令 6 条（常显，替掉部队指令二级菜单） ----
  const army = armyMenuItems(world);
  for (let i = 0; i < ARMY_RECTS.length; i += 1) {
    const r = ARMY_RECTS[i]!;
    const a = army[i] ?? null;
    const ok = fighting && !!a?.ok;
    items.push(bg(`army.${i}.bg`, r, a?.ordered ? 'plate_sel' : 'plate_btn', ok ? 245 : 140));
    items.push({
      kind: 'text',
      id: `army.${i}.label`,
      text: a?.label ?? '—',
      x: r.x + r.w / 2,
      y: r.y + 36,
      w: r.w - 8,
      size: 17,
      color: ok ? COLORS.text : COLORS.textFaint,
      align: 'center',
      bold: true,
    });
    items.push({
      kind: 'text',
      id: `army.${i}.sub`,
      text: !ok && a?.reason ? a.reason : (a?.ordered ? '已下達' : ''),
      x: r.x + r.w / 2,
      y: r.y + 62,
      w: r.w - 6,
      size: 10,
      color: ok ? COLORS.textDim : COLORS.textFaint,
      align: 'center',
      bold: false,
    });
  }

  // ---- 全局 4 颗（保護主將 / 武將出擊 / 主將待機|後退 / 全軍撤退） ----
  const defs = cmd6Defs(world);
  const byKind = new Map(defs.map((d) => [d.kind, d] as const));
  const gr = globalRects();
  const useCtx = { fighting, skillCount: skills.length };
  for (let i = 0; i < gr.length; i += 1) {
    const r = gr[i]!;
    const kind = GLOBAL_KINDS[i]!;
    const def = byKind.get(kind);
    // 原作可用性逐颗不同（0x444C37 / 0x444B4C / 0x445282），统一问 cmd6Usable
    const use = cmd6Usable(world, CMD6_INDEX[kind] ?? -1, useCtx);
    items.push(bg(`global.${i}.bg`, r, 'plate_btn', def && use.ok ? 235 : 130));
    items.push({
      kind: 'text',
      id: `global.${i}.label`,
      text: def?.label ?? '—',
      x: r.x + r.w / 2,
      y: r.y + r.h / 2,
      w: r.w - 6,
      size: 15,
      color: def && use.ok ? COLORS.text : COLORS.textFaint,
      align: 'center',
      bold: true,
    });
  }

  return items;
}

/** 底栏命中：技能格 → 部队 6 条 → 全局 4 颗；都不在返回 null（交给战场命中）。 */
export function consoleHit(
  world: World | null | undefined,
  tx: number,
  ty: number,
  skillCount: number,
): ConsoleHit | null {
  const slots = skillCellRects(skillCount);
  for (let i = 0; i < slots.length; i += 1) {
    if (inRect(slots[i]!, tx, ty)) return { type: 'skill', index: i };
  }
  const army = armyMenuItems(world);
  for (let i = 0; i < ARMY_RECTS.length; i += 1) {
    if (!inRect(ARMY_RECTS[i]!, tx, ty)) continue;
    const slot = army[i]?.slot;
    if (slot === undefined) return null;
    return { type: 'armyCmd', slot, index: i };
  }
  const gr = globalRects();
  for (let i = 0; i < gr.length; i += 1) {
    if (inRect(gr[i]!, tx, ty)) return { type: 'global', kind: GLOBAL_KINDS[i]!, index: i };
  }
  return null;
}
