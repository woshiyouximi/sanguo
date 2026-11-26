import io

ADD = r'''## 9. R225 补丁：ui-sweep 的两个 P0

真机全界面巡检（`work/ui_sweep/REPORT.md`，15 类界面逐按钮）在 2.9 上抓到两个「一局打不完」的必踩项，已在 **3.0** 修掉。

### 9.1 P0-1 出征确认 → 同帧穿透 → 换月崩溃 → 输入链永久死亡

- 复现：出征编成页点「出征」（设计 561,1235 / 设备 1085,2370），同一个 `TOUCH_END` 又被下方大地图 `CampaignRoot.onTouch` 处理，正好落到「內政終了」→ `advanceMonth → advanceOneMonth → civic → CityPanel.mergeSave` 对 `null` 调 `.slice()` 抛 `TypeError`；异常沿 `Input._emitEvent` 冒出后整条输入链断掉（之后所有点击 0%），只能强杀。
- 修法两道：
  1. 新增 `game/cocos/assets/scripts/InputLatch.ts`：`latchTap()` / `tapLatched()` 用 `director.getTotalFrames()` 做**同帧闩锁**；`DeployRoot` 的「出征 / 返回」导航前 `latchTap()`，`CampaignRoot.onTouch` 开头 `if (tapLatched()) return;`。
  2. `CityPanel`：空背包解析出的 `null` 统一收敛成 `[]`（`bag: Array.isArray(this.bag) ? this.bag.slice() : []`；赋值处 `this.bag = Array.isArray(parsedBag) ? parsedBag : []`），即使别处再传 `null` 也不会炸。

### 9.2 P0-2 战斗点技能格 → `toLowerCase` 崩溃 → 战斗永久卡死

- 复现：点技能格 → `jsb-adapter/web-adapter.js:350` 抛 `Cannot read properties of undefined (reading 'toLowerCase')`（栈：`loadMagicProgram → newSkillRun → startSkill → cast → BattleInput.castAt`），之后所有命令灰「當前狀態不可下令」，无法撤退。
- 根因：Cocos native 的 `URL` 是 jsb-adapter 垫片（`document.createElementNS('a')` 取 `protocol`），而 core 的 `loadMagicProgram()` 同步 XHR 兜底与 `initMagicProgram()` 都会 `new URL(...)`。预加载其实**早就在同一处失败**（`[shim/host] magic_so 預加載失敗`），只是被 catch 成「法术退化占位」；一旦真去施放，异常就抛到输入链上。
- 修法：
  - core `runtime.ts` 新增 `primeMagicProgram(bin, symbols)` 直接塞字节（跳过 URL/fetch）；`initMagicProgram` 改用 `resolveBase()`（真 `URL` 优先、native 手拼兜底）与字符串拼接；XHR 兜底改用 `dataUrl()`，不再 `new URL`。
  - `shim/host.ts` 的 `preloadMagicProgram()` 改为从 bundle 读 `BufferAsset` / `JsonAsset` 后 `primeMagicProgram()`，**全程不碰 URL、不发请求**。
  - 新测试 `tests/magic_program_prime.test.ts`（2 条）：prime 之后 `loadMagicProgram()` 不发请求；把全局 `URL` 换成「必抛的 native 垫片」时仍能拿到 400+ 函数的程序。

### 9.3 3.0 包与门禁

| 项 | 值 |
|---|---|
| APK | `dist\android\sanguo-native.apk` = **57,516,577 B** / SHA-256 `2B20A4542EC8C7DA27BABB9F3CC21D2998D9E0859B336041F14C247DB82B3EA2` / versionCode **20** / **3.0** |
| tests | **1888 / 1887 pass / 1 todo / 0 fail** |
| tsc | `--noEmit` 0、`-p cocos` 0 |
| fidelity / parity / devtools / scan | 459-0-3-0 / 12 条 0 失败 / 7 条 0 漏出 / 605 files 0 BAD |

### 9.4 ui-sweep 其余发现（未修，按优先级）

- **P1**：编成页「上陣 110 兵」是敌方数、我方可带 10 兵（`troopCapOf = 5×等级`，189 剧本 Lv2；口径与原作 `0x409FB6` 一致，问题在「关卡 110 兵 vs 10 兵」的难度曲线，待定是否调关卡守军）；`deployQueue` 兵数显示错乱；**「開始新局」未重置旧局**（新局第 1 年势力图显示「存續 7 · 滅亡 11」）；戰報年份标错；名冊淳于瓊「在職」但 garrison 是野将。
- **P2**：說明页开发者口吻、物品「原作欄位」调试区、`garrison.json` 文件名暴露、`[新設計]` 标注暴露、图例不是筛选、战斗敌方主将入镜、叫阵横幅未观察到、物品底欄空按钮位。
- **覆盖缺口**：赢时「武將招降」面板未验（因技能 P0 战斗打不完）、自治/情報/移動武將未逐项跑完。
'''

for path, marker in [
    (r'F:\sanguo\project\217_触控根因与双端收编.md', None),
    (r'F:\sanguo\project\44_交接简报.md', '\n## 217. 第 224 轮增量'),
]:
    s = io.open(path, encoding='utf-8').read()
    if '## 9. R225 补丁' in s:
        s = s.split('## 9. R225 补丁')[0].rstrip('\n') + '\n\n' + ADD
    else:
        s = s.rstrip('\n') + '\n\n' + ADD
    io.open(path, 'w', encoding='utf-8', newline='\n').write(s)
    print('updated', path.split('\\')[-1], len(s.split('\n')), 'lines')
