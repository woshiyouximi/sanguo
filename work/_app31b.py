import io
p = r"F:\sanguo\project\31_还原清单.md"
add = """

### §一之補 18（R178 落地：战斗行为重写 + 界面量化对齐）

| # | 项 | 落地 | 证据 |
|---|---|---|---|
| 193 | 开局待機 | `battle.ts` 默认不下令；无命令 600 tick 位移 0、攻击 0 | `tests/action_model.test.ts` 18 条 |
| 194 | 战斗 AI 60 tick | 新建 `src/core/battle_ai.ts`（w0=100/+12/+150/+1000、case2 双命令） | `tests/battle_ai.test.ts` 12 条；20 seeds 接触 618–985 tick |
| 195 | 同排扫描 | `battle.ts` 同排 ±x 扫描 1..射程，异排/0x2000/友军挡 3 条阴性 | 同上 |
| 196 | 攻击锁定表 | atkLock `[1,1,1,3,1,2,1,1,1,1,1,3,1]`，主将恒 1 | 3→2→1→0 |
| 197 | 补间抖动 | `slide.gx/gy`，x −24..23 / y −18..17，未走成 40 帧回格心 | 200 次实测 |
| 198 | 轴向基向量 | `planToward` 改 `sx!==0 ⇒ sy=0` | 直前 80.1%（改前斜前 42.7%） |
| 199 | 布阵 6 条 | `formationCells` + A 侧 **71−gx** + `formations.json` formula 70→71 | 方形 N=100：A 51..61 / B 10..20 / **最近 31 格** |
| 200 | 战斗硬时限 198s | `BATTLE_TICK_LIMIT=5940`、`endReason='time'` | `0x4AC35C`=11880；4 条测试 |
| 201 | 战斗 HUD 四字段 | 疲勞/士氣/武力/智力（左右镜像），`行 40/40` 压 3px 条 | `project/180` |
| 202 | 顶部中文倒计时 | `ceil((5940−tick)/60)`，起始 99、0.5/秒 | 同上 |
| 203 | 招降标题 | `武 將 招 降` | `campaign.html:383` |
| 204 | 纪元口径 | `game/web/era.js`、`toADYear(y)=184+(y-1)`、`eraText` | `tests/era_save.test.ts` 17 条 |
| 205 | 存档槽 | `記錄01..10` + 4 段、`SLOT_DELETE_UI=false` 去「刪」 | `project/181` |
| 206 | 内政 8 字段 | 含关卡数（`RATE===0`）、去千分位、人口带「人」 | 同上 |
| 207 | 大地图部队层 | `save.armies[]` 画在道路上、圆形命中 r=16 | `tests/march_ui.test.ts` 16 条 |
| 208 | 兵团指令 5 项 | 武将资料/变更目的/进入城内/部队驻扎/任命军师 | `project/182`、`project/185` |
| 209 | 部队驻扎 | 进度冻结 + 同段阻挡（接触点夹 `1−ps−0.005`）+ 对峙走唯一开战链 | `tests/march_station.test.ts` 22 条 |
| 210 | 任命军师 | `officers` 随军（≤5）、可点性 = `officers.length>=2`、`?wise=` 生效 | 截图 `work/station/07_battle_wise.png` |
| 211 | 法术域五红 | 兜底目标从 `castAim` 改 `g3`（引擎解析目标），原作用 `Hurt@0x12B8` 只打主将 | `project/183`、`tests/spell_reds.test.ts` |
| 212 | Cocos 内核同步 | 21 文件、dry-run 0 写入、`verify_core3` 165/165 | `project/184` |
| 213 | Cocos HUD | 中文牌 `九十六`、双卡四字段 | 截图 `work/cocos_hud/*.png`、`work/r178cocos2/cb01_battle.png` |

**当前硬指标**：web `tsc --noEmit` exit 0；全量 **1486 tests / 1486 pass / 0 fail**；fidelity **PASS 459 / FAIL 0 / SKIP 3 / WARN 0**；cocos `tsc -p tsconfig.check.json` exit 0；`-Mode preview` 出包 exit 0。

**已改金标准 2 条（附证据）**：606 帧数 562→559（m4 布阵改动后 8 seed 实测 553–564）、606 指令数 358333→358312（`358291+21n` 恒等式，`n=2→1` 的改动未能定位）。
"""
s = io.open(p, encoding="utf-8").read()
io.open(p, "w", encoding="utf-8", newline="\n").write(s + add)
print("ok")
