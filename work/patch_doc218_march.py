# -*- coding: utf-8 -*-
"""R225d：把「行军逐帧」补进 project/218。"""
import io

P = r'F:\sanguo\project\218_原作时间流反汇编.md'
s = io.open(P, encoding='utf-8').read()

add = """
## 6. 行军也改成逐帧（R225b）

原作的兵团**每帧**移动，与日历无关：`0x41AFAB` 里 `+0x9A` 递减，到 0 推一格（`+0x86++`、`+0x92-=100`），
再用 `4980/[+0x82]` tick 重装；`+0x9E=2` 表示行军状态。我们原来只在月边界走 1/3 段（`advanceArmiesMonth()`），
所以「兵团按月份瞬移」。

改法（`CampaignRoot.ts`）：

- `advanceArmiesMonth()` 的实体抽成 `advanceArmies(stepFor)`（步长外部给）；
- 新增 `stepArmiesFrame(n)`：每 tick 走 `n / (marchMonths*300)`（整段路摊到 tick），
  抵达 / 被驻紮敌军封锁 / 对峙 / 遭遇战仍沿用 `planArmyMoves()` 与 `stationStandoff()` 的规则；
- `stepClock()` 每 tick 先 `stepArmiesFrame(n)`，遇遭遇战立刻暂停时钟并切战场；
- `monthTick()` 只剩经济与 AI（不再推兵团）；
- 抵达提示按 `arrivedNoticed` 去重（免得每帧刷提示条）。

契约测试同步更新：`cocos_p1_port.test.ts`（monthTick 不再推行军）、`encounter_battle.test.ts`
（`advanceArmies` 改名 + 遇战早退移到 `stepArmiesFrame`）。

**验证**：`node --test "tests/*.test.ts"` → 1888 tests / 1887 pass / 1 todo / 0 fail、`tsc -p cocos` 0；
原生包 3.2（versionCode 22）。实机：时钟按 5 秒/月推进、满年自动进内政（`第 2 年 1 月`），0 JS error；
**「行军进度百分比」的实机截图没抓到**——MuMu 的 `input tap` 反复点错城市，把验证流程打乱了。

## 7. 还差

- web 调试台的 `campaign.html` 仍是「内政終了跑 12 个月」，要同步成时钟（否则双端不一致）；
- 行军「到达/进城/遭遇」的结算函数仍未在反汇编里定位（我们用 `planArmyMoves()` 的规则近似）；
- 原作开场不限帧，「一年多少秒」无硬证据，我们用 `clockSpeed=1`（60 tick/s）取可玩节奏。
"""
s = s.rstrip() + "\n" + add
io.open(P, 'w', encoding='utf-8', newline='\n').write(s)
print('218 updated')
