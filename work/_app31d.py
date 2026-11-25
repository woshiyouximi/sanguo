import io
p = r"F:\sanguo\project\31_还原清单.md"
add = """
### §一之補 20（R187–R190 批次：投射物、兵种尺寸、Cocos 部队层、HUD 體、招降、速度裁决）

| # | 项 | 结论 / 落地 | 证据 |
|---|---|---|---|
| 217 | 兵种→图集映射 | **13/13 正确**，不是映射错；三方（`unitFrames.ts:98-112` ↔ `units.json.groups[].letter` ↔ `build_atlas.py` TROOPS）逐条一致；13×13 交叉比对自匹配 IoU 全 1.000，次高 0.770 | `project/189`、`work/troopmap/probe_map.json` |
| 218 | 士兵二次重采样 | 屏宽 66→**75**（1:1，零重采样，`75x93->75.0x93.0`），兵体面积 +29%；根因是 `pushSpriteFrames` 写死 `w=66` | `unitFrames.ts:151/207`、`battleView.ts:1203-1240`、`work/troopmap/compare_sheet.png` |
| 219 | Cocos 兵种高度 | `BattleRoot.ts:1319` 原一律压 52（链锤/弩兵/朴刀 1:1:1），改按帧画布高 1:1 → **87:70:74**（极值 96/70/74），脚线不悬空 | `project/189` §5.5、`work/troopmap/cocos_size_compare.png` |
| 220 | 竖屏版面换算 | 原作 100/640=15.6%；折算到 750 宽 14 道 ≈1 道 56px；我们 75px 已比它大 34% ⇒「太小」不是缺陷，不上 k=1 | `project/189` §9 |
| 221 | Cocos 大地图部队层 | 新建 `ArmyLayer.ts` 1496 行；命中 r=16、画点同份、驻扎冻结+夹点 `1−ps−0.005`、军师两态、5 项矩阵；`tsc` 0、断言 **65/65**、CDP **22/22+6/6**、出包 exit 0 | `project/186`、`work/cocos_army/*.png` |
| 222 | 武将技投射物 | 110 条全表：**真投射物 12 条**（2/13/46/50/52/53/59/62/67/83/85/107）；原作**先飞后判**（`ShootObject@0x6998` 建弹→`0x2C` 挂回调→`ShootObjectCallback@0x5CA4` 撞 g3 才 `Hurt`）；落月弓结算从 tick 10 → **79**（born 70+life 10） | `project/187`、`work/proj/proj_table.csv`、`work/proj/{before,after}_seq18.png` |
| 223 | `0x012` 语义 | 原作「物件优先（活着=0）」被写反，导致弹丸出生当帧被销毁；已修 `syscalls.ts:285` | 同上 §2.5 |
| 224 | 战斗 HUD 補「體」 | 原作每侧 `兵 X/96` + `體 X/54` 两条；我们补 `體` 条（`COLORS.heal`）、`技` 降 10px 小字；`layout.ts:115-136` 新增 `GENERAL_CARD_Y` | `project/191`、`work/hud_vital/after_hud.png` |
| 225 | 招降面板 | 标题「武 將 招 降」、我方立绘 + 两句台词、**10 字段两栏**（等級/武力/智力/忠誠/武器 有值；士氣/疲勞/物品/勝敗場 只能「—」）、按钮序 `釋放/斬首/招降`（原作第三档「看押」`[新設計]`） | `project/191`、`work/hud_vital/after_surrender.png` |
| 226 | 主将与士兵速度 | **没有倍率**：共用 `0x43B5DE mov [ecx+0x34],0x28`（40 tick）、落点只写一格；录像 1.89× 像素比 = 透视 **1.59**（px/格 从远排 53 → 主将排 84.5）× 士兵行动失败 **1.19** | `project/190`、`work/speed_arb/fig1_tracks.png` |
| 227 | 引擎 tick 语义 | `+0x34` 单位是**引擎 tick**（`0x43AC79 call 0x468720` 读全局 tick、`0x43AC89 lock sub` 取 dt、`0x43ACF3` 累加）；录像实测 tick 率 **66–79 Hz** ⇒ 我们把 40 tick 映射到 30 Hz 是慢 ~2× 的根源 | 同上 §4 |
| 228 | 透视投影（待做） | 原作 px/格 是屏幕深度函数 `pitch(y)=9170/(283−y)`（53→85），我们是常数 `ROW_PX=71.43`；要做透视得改投影+命中 | 同上 §5，未做 |
"""
s = io.open(p, encoding="utf-8").read()
io.open(p, "w", encoding="utf-8", newline="\n").write(s + add)
print("ok")
