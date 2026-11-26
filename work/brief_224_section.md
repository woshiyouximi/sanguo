
## 217. 第 224 轮增量（R224 · 2026-11-26 14:00）

### 一句话

**「面板按钮全灭」的真根因找到了：不是坐标，是 `BlockInputEvents` 把全局 input 吞掉了。** 已修并出 **2.9**；同时把 `roster.ts` 收编成单源、修掉「189 剧本复活张角」、加了调试痕迹门禁。

### 217.1 触控总根因（R224，最值钱的一条）

- 现象：打开 `城池一覽`/`勢力圖`/`存檔`/`名冊` 后所有按钮失效，画面照常 60fps 渲染。
- 根因：`CampaignRoot.showSheetScrim()` 给全屏暗幕 `addComponent(BlockInputEvents)`。Cocos 3.8 的 `PointerEventDispatcher` 优先级（UI=1）**先于**全局 `input`，它认领 touch 后返回 `false`，`Input._emitEvent()` 里 `if (!dispatcher.dispatchEvent(event)) break;` 直接中断派发 → 本项目所有面板与大地图的唯一入口 `input.on(TOUCH_END)` 再也收不到事件。
- 证据链（`work/hitfix/REPORT.md`，30 张实机截图）：① 探针证明坐标公式正确（关闭按钮 `design=(661,65)`，期望 661,60；己方 `(270,158)`；下一页 `(673,1142)`；点行 `(371,300)`）；② 像素量 2.8 截图，`LIST_BUTTON` 画在设备 y=1489..1558 = 设计 771..807，与常量 `y=776` 一致 ⇒ **布局/坐标常量一个字都没错**；③ 插桩显示面板打开后连 `touch-start` 都不进 JS，而 tick 仍 60fps。
- 修法（只碰输入层）：`showSheetScrim()` 移除 `BlockInputEvents`（暗幕只负责画）；`onTouch()` 开头 `if (this.node.children.some(c => c.name.startsWith('Scrim_'))) return;` 挡穿透；`openCityList().onPick` 不再提前收暗幕。
- 教训：**我上一轮判断的「装裱带矩形差 110px / getUILocation 语义不同」是错的**，实机探针把它否掉了。以后 UI 全灭先看「是否有节点吃了事件」，别先怀疑坐标。

### 217.2 roster.ts 收编成单源（消掉门禁假绿）

- `sync_core3.mjs` 的 `SKIP_FILES` 里 `roster.ts`/`field.ts` 从不参与同步，但 `--diff-only` 只报「相同 25 / 差异 0」⇒ `check_parity` 的 core 行是假绿，capture 逻辑双端各走一套。
- 收编：Cocos 多的约 300 行确认是**纯逻辑**（R197 招降十栏的存档读取层），已并入 web 唯一源 `game/src/core/roster.ts`（1014→1257 行）；`SKIP_FILES` 清空，镜像改由同步器生成。
- 结果：`--diff-only --strict-skip` = 文件 27 / 相同 27 / 差异 0 / SKIP-DIFF 0 / EXIT 0；`cocos_sur/assert_sur` 94/94、`verify_core3` 165/165。

### 217.3 门禁新增

- `work/check_devtools.mjs`：登记 7 类调试痕迹（`items-unlock-all` guard / `?unlimited`·`?autoenc`·`?taunt`·`skinlab`·`?lv` query / `Test01` fidelity），漏出即 exit 1。当前 `devtools: 7 条 · 漏出 0 · OK`。
- `check_parity.mjs` 会把 `sync_core3` 的 `⚠ SKIP 分叉` 打出来（不判红），避免再被误读成「全都同步」。

### 217.4 本轮其它修复

- **189 剧本复活张角**：`city_by_times[1]` 为空被当成「缺资料」→ 回落静态 `CITY='平原'`（184 年那份）；三处（`CityModel.ts`/`OfficersOfCity.ts`/web `city_model.js`）统一为「有这一项就以它为准，空＝这剧本不在任何城」。实机 内政页 武將 5→**4**。
- **「全部解鎖」调试按钮**：`devToolsOn()`（`cc.sys.isNative`/`?rel=1` 时 false）隐藏按钮+底板+提示；2.8 起生效。
- **编成主将变守方 / 出征只带 5 兵**（R223）：`DeployRoot` 不再取 `scenarios[0]`、我方池读出发城存档；`generalLevel()` 按剧本起始等级，`taken=min(cap, 城兵)`（244 兵 + Lv2 ⇒ 10 兵）。

### 217.5 验证（本轮实测）

| 项 | 结果 |
|---|---|
| tsc --noEmit / tsc -p cocos | **0 / 0** |
| tests | **1886 tests / 1885 pass / 1 todo / 0 fail** |
| fidelity | **PASS 459 / FAIL 0 / SKIP 3 / WARN 0** |
| parity | **12 条 · Cocos 缺 0 · 失败 0 · OK** |
| devtools | **7 条 · 漏出 0 · OK** |
| scan_utf8 | **602 files / 0 BAD** |
| sync_core3 | **27/27 相同 · SKIP-DIFF 0** |

### 217.6 2.9 原生包

`dist\android\sanguo-native.apk` = **58,130,106 B / SHA-256 `545016C7F150DEA51DDE9719B90BE1F13B853882F65D7A91138A3BEC27037D82` / versionCode 19 / versionName 2.9**，已 `install -r` 到 MuMu。修前 2.8：城池一覽任何按钮无反应；修后 2.9：關閉/全部·己方·敵方·無主/城名·勢力排序/上一頁·下一頁/點行選城/返回地圖全部生效，面板开着点「勢力」「存檔」无穿透，0 JS error。
