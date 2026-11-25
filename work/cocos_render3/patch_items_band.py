# -*- coding: utf-8 -*-
"""w7-cocos-render3 第二階段（物品頁兩件事，不碰 DeployRoot.ts）

1. 武將卡底部空帶（pick 第二排 368 → 卡片邊界 398，約 30px）填「裝備總加成」摘要，
   取代原本的空白 —— web 的 `items.html` 在四槽底下也有一行總加成摘要。
2. 列表行文案去重：行內原本同時印 `Description`（「武力上昇1點。」）與 meta
   （「Lv 1 · 武力 +1」），同一件事說兩遍。改成：
     - meta 行保留 `Lv n · 加成`；
     - Description 只留「與 meta 不重複的條目」（例如「無法退兵無效」）；
     - 沒有剩餘條目時把 meta 上移到描述行的位置，整行收成兩行（名稱 + 資訊）。
"""
import io

P = r"F:\sanguo\game\cocos\assets\scripts\ItemsPanel.ts"
s = io.open(P, encoding="utf-8").read()

PATCHES = []


def add(old, new, why):
    PATCHES.append((old, new, why))


# ── 1. LAYOUT：武將卡底部的「裝備總加成」帶 ────────────────────────────────
add(
    "  slot: { x: 34, y: 190, w: 164, h: 54, gap: 8 },\n",
    "  slot: { x: 34, y: 190, w: 164, h: 54, gap: 8 },\n"
    "  /**\n"
    "   * 武將卡底部的「裝備總加成」摘要帶（w7-cocos-render3）。\n"
    "   *\n"
    "   * 十二格武將格（`pick`）第二排結束在 y 368，卡片邊界 398 —— 中間 30px 原本是純空帶，\n"
    "   * 在這張 750×1334 的頁面上等於白扔一條。web 的 `items.html` 在四槽底下有一行\n"
    "   * 「已裝備合計」，這裡照同一位置補上（不改任何既有矩形，只填空白）。\n"
    "   */\n"
    "  genBonus: { x: 34, y: 369, w: 682, h: 24 },\n",
    "LAYOUT.genBonus",
)

# ── 2. 欄位 ────────────────────────────────────────────────────────────
add(
    "  private labelGenCity: Label | null = null;\n",
    "  private labelGenCity: Label | null = null;\n"
    "  /** 武將卡底部：四槽已裝備的合計加成（w7-cocos-render3） */\n"
    "  private labelGenBonus: Label | null = null;\n",
    "labelGenBonus field",
)

# ── 3. 建立 Label ──────────────────────────────────────────────────────
add(
    "    this.labelGenCity = this.makeLabel('ItemsGenCity', '', LAYOUT.genCity, 13, COLORS.textDim, 'left');\n",
    "    this.labelGenCity = this.makeLabel('ItemsGenCity', '', LAYOUT.genCity, 13, COLORS.textDim, 'left');\n"
    "    this.labelGenBonus = this.makeLabel('ItemsGenBonus', '', LAYOUT.genBonus, 12, COLORS.textDim, 'left');\n",
    "labelGenBonus create",
)

# ── 4. 字級角色 ────────────────────────────────────────────────────────
add(
    "    applyTextRole(this.labelGenCity, 'tip', 13);\n",
    "    applyTextRole(this.labelGenCity, 'tip', 13);\n"
    "    applyTextRole(this.labelGenBonus, 'badge', 12);\n",
    "labelGenBonus role",
)

# ── 5. rowParts：多一個「合併行」矩形 ─────────────────────────────────
add(
    "  /** 列表行的 4 塊：圖示 / 名稱 / 描述 / `Lv n · 加成`。y 由分頁游標決定。 */\n"
    "  private rowParts(y: number): { row: Rect; icon: Rect; name: Rect; desc: Rect; meta: Rect } {\n"
    "    const { x, w, h } = LAYOUT.row;\n"
    "    return {\n"
    "      row: { x, y, w, h },\n"
    "      icon: { x: x + 4, y: y + 6, w: 44, h: 44 },\n"
    "      name: { x: x + 56, y: y + 2, w: w - 64, h: 21 },\n"
    "      desc: { x: x + 56, y: y + 23, w: w - 64, h: 16 },\n"
    "      meta: { x: x + 56, y: y + 38, w: w - 64, h: 16 },\n"
    "    };\n"
    "  }\n",
    "  /**\n"
    "   * 列表行的 4 塊：圖示 / 名稱 / 描述 / `Lv n · 加成`。y 由分頁游標決定。\n"
    "   *\n"
    "   * `merged` 是「描述與 meta 合併成一行」時 meta 落的位置（w7-cocos-render3）：\n"
    "   * 多數裝備的 `Description` 只是把加成換句話說（「武力上昇1點。」對 `武力 +1`），\n"
    "   * 兩行並排等於同一句話印兩遍。此時描述行留空、meta 上移 15px 補位，整行讀成兩行。\n"
    "   */\n"
    "  private rowParts(y: number): { row: Rect; icon: Rect; name: Rect; desc: Rect; meta: Rect; merged: Rect } {\n"
    "    const { x, w, h } = LAYOUT.row;\n"
    "    return {\n"
    "      row: { x, y, w, h },\n"
    "      icon: { x: x + 4, y: y + 6, w: 44, h: 44 },\n"
    "      name: { x: x + 56, y: y + 2, w: w - 64, h: 21 },\n"
    "      desc: { x: x + 56, y: y + 23, w: w - 64, h: 16 },\n"
    "      meta: { x: x + 56, y: y + 38, w: w - 64, h: 16 },\n"
    "      merged: { x: x + 56, y: y + 25, w: w - 64, h: 18 },\n"
    "    };\n"
    "  }\n",
    "rowParts merged",
)

# ── 6. 去重 helper（放在 rowBonusText 之後） ───────────────────────────
add(
    "  if (isFormBook(item)) return desc.replace(/^學會/, '') || '—';\n"
    "  return desc || '—';\n"
    "}\n",
    "  if (isFormBook(item)) return desc.replace(/^學會/, '') || '—';\n"
    "  return desc || '—';\n"
    "}\n"
    "\n"
    "/**\n"
    " * 列表行的「第三行」：只留 `Description` 裡 meta 行沒說過的條目。\n"
    " *\n"
    " * 原作資料的 `Description` 是「條目式」的一句話，例如\n"
    " * `\"速度上昇5點，無法退兵無效，使用等級40。\"`。前後兩段 meta 行已經有\n"
    " * （`Lv 40 · 速度 +5`），只有中間那段是真正的額外資訊，所以剝掉前兩類：\n"
    " *   ① `<屬性>上昇 N 點` —— meta 的加成欄在講同一件事；\n"
    " *   ② `使用等級 N`      —— meta 的 `Lv N` 在講同一件事。\n"
    " * 全被剝光就回空字串，呼叫端把 meta 上移補位（見 `rowParts().merged`）。\n"
    " */\n"
    "function rowExtraText(item: ItemLike): string {\n"
    "  if (slotOf(item) === null) return '';\n"
    "  const desc = typeof item.Description === 'string' ? item.Description : '';\n"
    "  if (!desc) return '';\n"
    "  const kept = desc\n"
    "    .split(/[，、。]/)\n"
    "    .map((part) => part.trim())\n"
    "    .filter((part) => part.length > 0)\n"
    "    .filter((part) => !/^[^0-9]{1,6}(上昇|上升|增加)\\s*[+-]?\\d+\\s*點?$/.test(part))\n"
    "    .filter((part) => !/^使用等級\\s*\\d+$/.test(part));\n"
    "  return kept.join(' · ');\n"
    "}\n",
    "rowExtraText helper",
)

# ── 7. renderList：合併行 ─────────────────────────────────────────────
add(
    "      if (desc) {\n"
    "        this.placeNode(desc.node, parts.desc);\n"
    "        desc.string = typeof item.Description === 'string' ? item.Description : '';\n"
    "      }\n"
    "      if (meta) {\n"
    "        this.placeNode(meta.node, parts.meta);\n"
    "        meta.string = `Lv ${textOrDash(item.Level)} · ${rowBonusText(item)}`;\n",
    "      const extra = rowExtraText(item);\n"
    "      if (desc) {\n"
    "        this.placeNode(desc.node, parts.desc);\n"
    "        desc.string = extra;\n"
    "        desc.node.active = extra.length > 0;\n"
    "      }\n"
    "      if (meta) {\n"
    "        this.placeNode(meta.node, extra.length > 0 ? parts.meta : parts.merged);\n"
    "        meta.node.active = true;\n"
    "        meta.string = `Lv ${textOrDash(item.Level)} · ${rowBonusText(item)}`;\n",
    "renderList merge",
)

# 回收池：把 desc.active 也還原，避免上一頁的空描述把後面的行藏掉
add(
    "      if (desc) desc.string = '';\n"
    "      if (meta) meta.string = '';\n",
    "      if (desc) {\n"
    "        desc.string = '';\n"
    "        desc.node.active = true;\n"
    "      }\n"
    "      if (meta) meta.string = '';\n",
    "recycle pool",
)

# ── 8. renderGeneral：算出四槽合計 ────────────────────────────────────
add(
    "    for (let i = 0; i < POOL_SIZE; i += 1) {\n"
    "      const member = this.pool[i];\n"
    "      const label = this.pickLabels[i];\n",
    "    // 四槽合計（w7-cocos-render3）：填武將卡底部那條原本空著的帶。\n"
    "    // web 的 `items.html` 也在四槽底下給一行合計，玩家不必自己把四個槽的數字加起來。\n"
    "    if (this.labelGenBonus) {\n"
    "      const totals: Record<string, number> = {};\n"
    "      let count = 0;\n"
    "      for (const slot of SLOTS) {\n"
    "        const seq = clean[slot];\n"
    "        const equippedItem = seq === undefined ? null : itemOf(seq);\n"
    "        if (!equippedItem) continue;\n"
    "        count += 1;\n"
    "        const bonus = bonusOf(equippedItem);\n"
    "        for (const key of STAT_KEYS) totals[key] = (totals[key] ?? 0) + (bonus[key] ?? 0);\n"
    "      }\n"
    "      const parts: string[] = [];\n"
    "      for (const key of STAT_KEYS) {\n"
    "        const value = totals[key] ?? 0;\n"
    "        if (value !== 0) parts.push(`${STAT_NAMES[key]} ${value > 0 ? '+' : ''}${value}`);\n"
    "      }\n"
    "      this.labelGenBonus.string = count === 0\n"
    "        ? '裝備總加成　—　四槽皆空　·　右側選一件，按「裝 備」' \n"
    "        : `裝備總加成　${parts.length > 0 ? parts.join('　') : '無'}　·　已裝備 ${count}/4`;\n"
    "      this.labelGenBonus.color = rgba(count === 0 ? COLORS.textFaint : COLORS.textDim);\n"
    "    }\n"
    "\n"
    "    for (let i = 0; i < POOL_SIZE; i += 1) {\n"
    "      const member = this.pool[i];\n"
    "      const label = this.pickLabels[i];\n",
    "renderGeneral totals",
)

# ── 9. drawFrame：在空帶上方補一條分隔線（讓它不是「沒畫完」而是「有分區」） ──
add(
    "    for (let i = 0; i < SLOTS.length; i += 1) {\n"
    "      const rect = this.slotRect(i);\n",
    "    // 摘要帶的分隔線（web `items.html` 的 `.genfoot{border-top:1px solid var(--line-soft)}`）\n"
    "    this.hline(g, LAYOUT.genBonus.y - 3, LAYOUT.genBonus.x, LAYOUT.genBonus.w, COLORS.line, 170);\n"
    "\n"
    "    for (let i = 0; i < SLOTS.length; i += 1) {\n"
    "      const rect = this.slotRect(i);\n",
    "drawFrame divider",
)

for old, new, why in PATCHES:
    n = s.count(old)
    assert n == 1, ("PATCH NOT UNIQUE", why, n)
    s = s.replace(old, new)

io.open(P, "w", encoding="utf-8", newline="\n").write(s)
print("patched", len(PATCHES))
