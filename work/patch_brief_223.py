# -*- coding: utf-8 -*-
"""第 223 轮：交接简报追加增量节 + 改标题（不重写正文，避免误伤）。"""
import io, re, datetime

P = r'F:\sanguo\project\44_交接简报.md'
s = io.open(P, encoding='utf-8').read()

title = '# 交接简报 · 第 223 轮（2026-11-26 12:55）'
s = re.sub(r'^# .*第 \d+ 轮.*$', title, s, count=1, flags=re.M)

SECTION = """
---

## 216. 第 223 轮增量（R216–R223，接在第 214 轮之后）

> 第 214 轮之后又推了 8 轮，主线是「web/Cocos 双端差距」的批量收口。**以本节为准**，上文 214 轮的工时表已过期。

### 216.1 已落地（全部已提交并 push）

| # | 事 | 关键点 | 守门 |
|---|---|---|---|
| R216 | 双端口径定调 | `project/215_双端口径与调试开关.md`：**Cocos = 正式版/发版物，web = 调试台**；web 调试设施不进 Cocos | 门禁 scope |
| R217 | 内政 P1 移植 Cocos | F4 一年推进 / F7 月令 7 主+2 副 / F10 自治代行 / F16 国库=Σ每城 / F19 武将上限 10 | APK 2.0 实机 |
| R218 | 胜负改主将阵亡 | 原作只有三出口：主将死 / 全军离场 / 11880 tick 平手，**没有「兵多者胜」** | `battle_end.test.ts` 6 |
| R219 | 技力恢复原作口径 | 只有军师技「恢復技力」置位才回，0.30/0.50/0.70 点/秒，体力优先 | `jili_regen.test.ts` 4 |
| R220 | 内政九项审计 + 修复 | Cocos 搜索不进包/剧本号硬编码/无钱变兵/无逐将年令 → 全修 | `cocos_affairs.test.ts` 9 |
| R221 | F-01/F-02/F-03/F-04/F-06/F-07/F-09/F-10/F-14 | 俘虏胜者门、面板数据源改存档、月推进流水线收 core、遭遇战真打、编成三列、存档迁移 | 1865 绿 + 门禁 12 条 |
| R222 | F-05 装备加成 | core `equip_bonus.ts` 单源，名册与出征同值（关羽 80→110） | `equip_bonus.test.ts` 9 |
| R223 | 编成主将错 + 出征 5 兵 | 主将改读出发城运行时人事；出征兵数按剧本等级上限（244 兵 + Lv2 ⇒ 10 兵） | `march_deploy_ctx`/`march_troops` 12 |

### 216.2 当前硬指标（2026-11-26 12:55 实测）

- `tsc --noEmit` **0**；`tsc -p cocos/tsconfig.check.json` **0**
- `node --test "tests/*.test.ts"` → **1886 tests / 1885 pass / 0 fail / 1 todo**
- 双端门禁 `node work\check_parity.mjs` → **12 条 · Cocos 缺 0 处 · 调试项 7（不判红）· 失败 0 · OK**
- 保真网 `node work\fidelity\check.mjs` → PASS 459 / FAIL 0 / SKIP 3 / WARN 0（上轮实测，改动未触及数据层）
- 原生包 **2.6**：`dist\\android\\sanguo-native.apk` **57,507,620 B / SHA-256 `7BC4985E…4C4EC7`** / versionCode 16 / versionName 2.6
- 微信小游戏 **0.2.1 已上传**（19.65 MiB，png→webp 省 3.44 MiB）

### 216.3 实机验收（MuMu `127.0.0.1:16384`，APK 2.6）

- 内政页：武將 5/10、年令 0/5、國庫 4762、九宫七主二副、紀錄「第 1 年 · 已行動 0/5 將」
- 出征：`平原 → 樂陵 (10 兵, 1 個月)`（第 223 轮前是 5 兵）
- 出征編成：主将 **劉備**、将列 劉備/關羽/張角/張飛/簡雍（出发城存档名单）、前/中/後 三档按钮、兵 10/10
- 证据：`work\\native_debug\\r223_dispatched.png`、`r223_deploy.png`、`r221_interior.png`

### 216.4 还欠什么（按优先级）

1. **F-08** web 侧结局面板/统一判定（Cocos 已有战斗页结算）
2. **F-11** 大地图/内政/编成/道具 BGM（AudioHost 目前只有 BattleRoot 用）
3. **F-12** 出征兵力池是否含预备兵（当前口径同 web：只读 `city.troops`）
4. **F-13** 键盘输入（web 调试台已弃用 Cocos 侧不需）
5. `sync_core3.mjs` 的 `SKIP_FILES`（roster/field）假绿——要改成「不同步但 diff 告警」
6. 真机继续走「出征→编成→攻城战→叫阵→战后处置」整链取证
7. 用户侧真机复测 2.6

### 216.5 交付纪律（本轮新增）

- 每轮提交前跑 `node work\\check_parity.mjs`；`cocos` 条缺 = 红，`web-debug` 条缺不算
- 新功能先写 Cocos；逻辑单源进 `game/src/core/**`（core 由 `sync_core3` 镜像到 `game/cocos/assets/scripts/core`）
- 原生包版本号在 `game/cocos/native/engine/android/app/build.gradle`；构建用 `& .\\tools\\build_native.ps1`（需 pwsh 7）
- 模拟器截图必须 `adb shell screencap -p /sdcard/x.png` + `adb pull`（`exec-out >` 会写坏 PNG）
"""

if '## 216. 第 223 轮增量' not in s:
    s = s.rstrip() + '\n' + SECTION
else:
    s = re.sub(r'\n---\n\n## 216\. 第 223 轮增量.*$', '\n' + SECTION, s, flags=re.S)

io.open(P, 'w', encoding='utf-8', newline='\n').write(s)
print('LINES', len(s.splitlines()))
