# 双端门禁 scope 标签报告

- 对应规划：`project/215_双端口径与调试开关.md` §4（正式/调试标签；§3 不合并清单是判定依据）
- 日期：2026-11-26（R215）
- 改动文件（仅此 3 个，未碰 `game/**`、未用 git）：
  - `work/check_parity.mjs`（改：按 scope 判红 + `--json=` / `--no-core`）
  - `work/parity/features.json`（改：每条加 `scope`；新增 7 条 web-debug）
  - `work/parity/scopes_selftest.mjs`（新增：两道 scope 自测）

## 1. 标签表

`scope` 取值：`cocos` = 正式版功能（Cocos 必须有）；`web-debug` = web 专用调试/取证设施（§3 明确不搬到 Cocos）；`both` = 双端都必备。所有现有条目按实情标 `cocos`，调试设施单列 `web-debug`（只记录，不判红）。

### 1.1 正式功能（5 条，判红）

| 条目 | 功能 | scope | Cocos 判定依据 | web 判定依据 |
|---|---|---|---|---|
| core 单源 | `game/src/core/**` 与 Cocos core 必须 0 差异 | `cocos` | `sync_core3.mjs --diff-only`：相同 24 / 差异 0 / 缺 0 / 多出 0 | —（同源） |
| F4 | 内政終了 = 推进一年 | `cocos` | `game/cocos/assets/scripts/CampaignRoot.ts` `advanceMonth(12)` / `advanceYear(` | `game/web/campaign.html` `advanceMonth(12)` |
| F16 | 国库 = Σ 每城 money | `cocos` | `CampaignRoot.ts` `國庫\|totalGoldOf\|treasuryOf` | `campaign.html` `國庫` |
| capture | 俘虏只有胜者能处置 | `cocos` | `game/cocos/assets/scripts/SurrenderModel.ts` `hasPendingCaptures\|won`（:330 `const won = opts.won !== undefined … decideBattleWon(save);`） | `campaign.html` `settleBattleReturn`；`game/src/core/roster.ts` `won === false` |
| taunt | 开场叫阵 | `cocos` | `game/cocos/assets/scripts/BattleRoot.ts` `beginTaunt` | `game/web/main.js` `beginTaunt` |

> core 单源行由 `check_parity.mjs` 内置生成并显式打 `scope=cocos`，不写进 `features.json`（避免重复）；因此 features.json 是 4 条正式 + 7 条调试 = 11 条，门禁报表是 12 行（含 core）。
>
> 复核结论：**capture 已由 S-026 接好，现在两端都 ✓**，门禁实际输出为 `Cocos 缺 0 处 · 失败 0`（任务描述里的「缺 1 处 · 失败 1」是旧状态）。F4 的 Cocos 侧也已跟上（`CampaignRoot.ts:2152 endInterior()` 按 `GameState.advanceSteps` 逐月循环，:2160 每月 `advanceMonth`），原 note「Cocos 仍是单月」已过时，改成 R214d 逐月说明。

### 1.2 调试设施（7 条，只记录、永不判红）

| 条目 | 功能 | scope | web 标记 |
|---|---|---|---|
| D1 | `?taunt=0` 关闭开场叫阵 | `web-debug` | `game/web/main.js` `tauntEnabled(QUERY.get('taunt'))`（core `open_taunt.ts` 缺省开，0/off/false/no 关） |
| D2 | `?from=campaign` 出征入口标记 | `web-debug` | `main.js` `QUERY.get('from') === 'campaign'`；`campaign.html` `from: 'campaign'`（3 处） |
| D3 | `?seed=` 固定随机种子 | `web-debug` | `main.js` `devNum('seed')`；`campaign.html` 注释 `?seed=N`（需 `?dev=1`） |
| D4 | `window.__sanguo` 调试 API | `web-debug` | `main.js` `window.__sanguo = {`（发布形态 `__RELEASE__` 不挂） |
| D5 | 战斗页预览开场卡 | `web-debug` | `game/src/view/battleView.ts` `drawReady()`「豎屏重製 · Canvas2D 預覽」；`game/web/index.html` 同文案 |
| D6 | `web/*.mjs` 自检脚本 | `web-debug` | `city_selftest.mjs` / `items_selftest.mjs` / `saves_selftest.mjs` / `smoke.mjs` |
| D7 | `?dev=1` 调试总开关 | `web-debug` | `game/web/devflags.js` `dev=1`（R115 发布卫生：调试参数一律需 `?dev=1`） |

这 7 条在 Cocos 侧没有对应规则 —— 按 §3 结论「不搬」，属于**预期差异**，不是缺口。门禁把它们的 Cocos 侧记为合成 ✗（原因写死为「Cocos 不搬（web-debug 预期，§3）」），只汇总进「调试项（不判红）」一行。`both` 目前没有条目，但脚本已支持（任一端 ✗ 即判红）。

## 2. 判定规则（`work/check_parity.mjs`）

1. **逐条求值**：每条 feature 的 `cocos[]` / `web[]` 规则逐条 `new RegExp(re, flags).test(源文件)`，全部命中才算该端 ✓。
2. **scope 语义**：
   - `cocos`：`!cocos.ok` → 计入 `Cocos 缺` 且按 `optional/strict` 计入 `失败`；`!web.ok` 只显示不判红（web 落后不算回归）。
   - `both`：`!cocos.ok || !web.ok` → 计入 `失败`。
   - `web-debug`：无论哪端 ✗ 都**不进失败计数**；没有写 `cocos` 规则时合成预期 ✗；整行汇总到调试行。若 web 侧真缺，调试行会追加 `；web 缺 N：id 列表`，便于发现问题又不阻断门禁。
   - `scope` 缺省 = `cocos`；未知 scope 打印 `⚠ 未知 scope` 后按 `cocos` 判，**不静默放行**。
3. **exit code**：`失败 === 0` → `exit 0`；否则 `exit 1`（`失败` 只由 `cocos`/`both` 产生，所以 web-debug 缺不会红，真回归一定红）。
4. **汇总格式**：
   - 报表行：`功能 | scope | Cocos | web | 说明`（调试行 Cocos 显示合成 ✗，web 显示实测）。
   - 调试行（非 `--quiet` 且有调试条目时）：`调试项（不判红）: 7 条 web 专用 · ✗ 7 处（Cocos 预期不搬 7）`。
   - 总结行：`parity: 12 条 · Cocos 缺 0 处 · 调试项 7（不判红） · 失败 0 · OK`（12 = core 1 + 正式 4 + 调试 7）。
5. **参数**：

| 参数 | 作用 |
|---|---|
| `--quiet` | 只打总结行 |
| `--strict` | `optional` 条目也判红（兼容旧行为） |
| `--json=<file>` | 换一份 feature 矩阵（相对 `F:/sanguo` 解析；自测用） |
| `--no-core` | 跳过 core 单源检查（自测用，避免无关差异干扰断言） |

## 3. 自测（`node work/parity/scopes_selftest.mjs`）

设计：两种情况的矩阵**形状完全相同**（一条 feature：web 侧命中、Cocos 侧缺），只有 `scope` 不同，用来证明「红不红只看 scope」。临时矩阵写 `work/parity/_tmp.json`，`finally` 里删除，并断言已删。

- 自测①：`scope=web-debug`，web 规则命中、无 cocos 规则 ⇒ 期望 **通过**（exit 0、失败 0、调试项行 1 条、✗ 归调试项）。
- 自测②：`scope=cocos`，web 命中、cocos 规则故意不命中 ⇒ 期望 **失败**（exit 1、失败 1、Cocos 缺 1 处）。

实跑输出：

```text
[自测 ①] 只有 web-debug 缺 ⇒ 应通过
  ✓ ① exit 0
  ✓ ① 总结「失败 0」
  ✓ ① 调试项行收到 1 条
  ✓ ① web-debug 的 ✗ 记进调试项行（1 处）
  ✓ ① 结论 OK

[自测 ②] 有 cocos 缺 ⇒ 应失败
  ✓ ② exit 1
  ✓ ② 总结「失败 1」
  ✓ ② 总结「Cocos 缺 1 处」
  ✓ ② 结论 FAIL
  ✓ ② 无 web-debug 条目时不打调试项行
  ✓ 临时矩阵 work/parity/_tmp.json 已删除

scopes_selftest: 11/11 过
OK
exit=0
```

`node --check work/check_parity.mjs` 与 `node --check work/parity/scopes_selftest.mjs` 均通过；`_tmp.json` 已确认不存在。

## 4. 当前门禁输出（`node work\check_parity.mjs`，exit 0）

```text
  功能                                   scope      Cocos  web    说明
  -----------------------------------  ---------  -----  -----  ----------------------------------------
  core 单源                              cocos        ✓      ✓    24 个 core 文件一致
  F4 内政終了=推进一年                         cocos        ✓      ✓    Cocos endInterior() 逐月跑 12 步（R214d 已跟上 web；此前只跑 1 月）
  F16 国库=Σ每城 money                     cocos        ✓      ✓    web 改成每城 money + 国库=总和
  capture 俘虏只有胜者能处置                    cocos        ✓      ✓    core roster.ts 已同步，UI 门要双端各查一次
  taunt 开场叫阵                           cocos        ✓      ✓    R212 已移植
  D1 ?taunt=0 关闭开场叫阵                   web-debug    ✗      ✓    web 回归对拍开关（?taunt=0/off/false/no）；Cocos 只保留原版叫阵，不搬
  D2 ?from=campaign 出征入口标记             web-debug    ✗      ✓    跳过预览卡直接叫阵开打；Cocos 由大地图/内政直接进战斗，不搬
  D3 ?seed= 固定随机种子                     web-debug    ✗      ✓    截图/回归可复现（需 ?dev=1）；Cocos 用 work/*cocos*/ 自己的 CDP 探针
  D4 window.__sanguo 调试 API            web-debug    ✗      ✓    state/startBattle/skipTaunt 等 DevTools 口（发布形态不挂）；Cocos 用 console.log('[Rxxx] …') 诊断
  D5 战斗页预览开场卡                          web-debug    ✗      ✓    drawReady() 的「開 戰」引导卡（竖屏重制 · Canvas2D 预览）；Cocos 直接进大地图/内政，不搬
  D6 web/*.mjs 自检脚本                    web-debug    ✗      ✓    纯 Node 自检（城市/物品/存档/冒烟）；Cocos 用 work/*cocos*/ 自己的探针，不搬
  D7 ?dev=1 调试总开关                      web-debug    ✗      ✓    R115 发布卫生：所有调试参数须 ?dev=1，APK 壳/?rel=1 强制关；不搬 Cocos

  调试项（不判红）: 7 条 web 专用 · ✗ 7 处（Cocos 预期不搬 7）

parity: 12 条 · Cocos 缺 0 处 · 调试项 7（不判红） · 失败 0 · OK
exit=0
```

- 7 个调试行的 Cocos ✗ 是**合成预期值**（§3 不搬），web 侧全部实测 ✓。
- 顺手修掉旧脚本的显示 bug：`core 单源` 行的 detail 原来把 `23` 写死（实际 `same=24`），现在用 `${cd.same}`，输出「24 个 core 文件一致」。
- `--quiet` 实跑同样 exit 0：`parity: 12 条 · Cocos 缺 0 处 · 调试项 7（不判红） · 失败 0 · OK`。

## 5. 备注 / 边界

- 本任务只动 `work/` 下 3 个文件，`game/**` 未改；无 git 操作。
- 门禁里 web-debug 条目仍然会**报出来**（web 侧 ✗ 会出现在调试行），只是不判红 —— 调试设施本身坏掉时不会静默消失。
- 后续新增功能：默认 `cocos`（先写 Cocos，再考虑 web）；web 独特设施标 `web-debug`；双端都要求的标 `both`。
- 两道 tsc 与全量测试不在本任务改动面内（只改 `work/` 下 Node 脚本与 JSON），未执行。
