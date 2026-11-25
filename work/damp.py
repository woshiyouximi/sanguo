import pathlib, re
p = pathlib.Path(r'F:\sanguo\game\src\core\battle.ts')
t = p.read_text(encoding='utf-8')
old_c = """ * 士气项阻尼：1 = 原作系数；2 = 系数减半（(士气−50)/10）。
 * 只在"和相克项叠加后饱和、五档跨度超过 25 个百分点"时才调大，见
 * project/15_数值模拟报告.md §7。
 */
export const MORALE_DAMP = 2;"""
new_c = """ * 士气项阻尼：**1 = 原作系数**（`idiv 5`，`0x44302C`）。
 * 这里恒为 1 —— 曾一度设成 2（系数减半）来压跨度，那属于我们的手感调整，
 * 与「1:1 还原」冲突，已回退（docs/04b5 Q1 附注）。
 */
export const MORALE_DAMP = 1;"""
assert old_c in t
p.write_text(t.replace(old_c, new_c, 1), encoding='utf-8')
print('damp=1')
