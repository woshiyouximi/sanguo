# 212 · Cocos 叫阵落地 + 出征兵源契约 + Cocos 版 APK

> 一句话：**Cocos 战斗也有了开场叫阵**（敵将先喊、我方接话、镜头逐句硬切到说话方，播完回我方主将 −2 行），
> **出征到城下不再退回「用城里剩下的兵」**（抵達 URL 带上 `troops/a/officers`，5 条源碼契约测试钉住），
> 并出了**第二个 APK：Cocos 构建版**（同一 WebView 壳，`assets/www` = `game\cocos-build\web-mobile`）。
> 测试 1685 → **1690**（+5 契约），两道 tsc 与 Cocos 类型检查全 0。

| 项 | 改前 | 改后 |
|---|---|---|
| Cocos 战斗开场 | 直接开打，无台词框 | 两段叫阵 + 台词框（`TauntBanner`）+ 切镜 |
| Cocos 叫阵镜头 | —（`camera()` 48.40 会把镜头拖回中场） | `camX` 13（敵）→ 58（我）→ 播完 56 |
| 出征到城下 | 兵團已 `removeArmy`，deploy 退回 city 模式拿城里余兵 | URL 带 `troops/a/officers`，与出发城一致 |
| APK | 只有 web 主包 1.4 | 多一个 `sanguo-cocos.apk`（1.5 / `com.sanguo.webview.cocos`） |
| 测试 | 1685 | **1690** |

---

## 1. Cocos 叫阵（`BattleHud.ts` + `BattleRoot.ts`）

复用 web 侧同一份逻辑源——`game/src/core/open_taunt.ts` 已经同步到
`game/cocos/assets/scripts/core/open_taunt.ts`（`sync_core3.mjs` 22/22），所以 Cocos 只做「取序列 + 切镜 + 画框」：

| 位置 | 改动 |
|---|---|
| `BattleHud.ts:191` | `export const TAUNT_BANNER = { x: 40, y: 790, w: 670, h: 138 }`（与 `battleView.ts:2359` 同几何） |
| `BattleHud.ts:634-666` | `TauntBanner` 节点 + Graphics（`#06080E` @219 / 金描边 @235 / 2px / r8）+ `TauntWho`(subtitle) + `TauntTag`(caption「叫 陣」) + `TauntLine`(subtitle 居中) |
| `BattleHud.ts:1239-1262` | `showTaunt(who, line)` / `hideTaunt()` / `setTauntLabels(on)` |
| `BattleRoot.ts` | `tauntOn = tauntEnabled(queryValue('taunt'))`；`beginTaunt()` 取 `buildTauntSeq(...)`、`camX = generalX(seq[0].side)`；`tickTaunt(dt)` 到点换句并硬切镜头；`endTaunt()` 收框 + `camX = camera(world)` + `accumulator = 0` |
| `BattleRoot.update()` | 叫阵期间 `tickTaunt → redraw → weather.update → return`，**不 step 世界**（tick 恒 0） |

`queryValue(key)`：先读 `location.search`（浏览器/`?taunt=0`），再退 `wx.getLaunchOptionsSync()/getEnterOptionsSync()`（微信）。
种子 `((launch?.seed ?? 20261124) * 2654435761) >>> 0`——**没有用 `world.seed`，`World` 上根本没这个字段**（第一次编译就是死在这）。

### 实体证据（`work\r212_cocos\`）

```
taunt: { seen: 41, cams: [13, 58],
         lines: [ {side:'B', text:'誰敢和我張角交手！'}, {side:'A', text:'和我關羽交手是你一生最大的錯誤！'} ],
         ticks: [0], bannerActive: true, who:{text:'張角',size:22}, text:{text:'誰敢和我張角交手！',size:22} }
end:   { camX: 56, tick: 6, genA: 58, genB: 13, bannerActive: false }   result: OK
```

- 截图 `t01_cocos_taunt_enemy.png`：敵方黄巾整阵 + 底部通栏台词框「張角　叫 陣　誰敢和我張角交手！」。
- 截图 `t02_cocos_after_resume.png`：我方 11 排大刀阵 + 骑马主将，台词框与三个 Label 全部收起。
- 投影口径：Cocos 线性 12.60 行/屏（`ROW_PX=71.43`），web 透视 13.327 行；两端 `camX` 与「我将 −2」一致。

### 两个真坑

1. **Label 不在 `tauntRoot` 下**：三个 Label 挂在 `consoleRoot`（为了摆位不受父节点缩放影响），
   首验只关了底板 ⇒ 播完还剩「關羽 / 叫 陣 / 台词」浮在阵上（`t02` 实拍）。修法：`setTauntLabels(on)` 逐个关。
2. **CDP 后台窗口 rAF 被节流**：`Page.bringToFront` 之前，叫阵 13 秒都停在第一句——不是产品 bug，
   是验证环境（web 侧 `steps_e2e.mjs` 也踩过同一条，已写进 §6 坑 7）。

---

## 2. 出征兵源契约（deploy 不该拿城里的余兵）

**根因**：`campaign.html` 「3) 我軍抵達敵城下」先 `removeArmy(a.id)` 再跳 `deploy.html`；
`deploy.html:346-353` 判 `MARCH_MODE` 的三个依据（`?army=` / `?troops=` / `save.armies` 里已抵達的兵團）**全没了**，
于是退回 city 模式，兵力取「城里剩下的兵」——玩家带 40 兵出门、城留 10，到了城下反而变成 10。

**改法**（`campaign.html:4596` 之前，即 `removeArmy` 之前）：

```js
q.set('troops', String(Math.max(0, Math.trunc(Number(a.troops) || 0))));
const leader = (a.general || (mine && mine.name) || '').trim(); if (leader) q.set('a', leader);
const offs = (Array.isArray(a.officers) ? a.officers : []).filter(Boolean); if (offs.length) q.set('officers', offs.join(','));
```

**测试** `game/tests/march_arrival_contract.test.ts`（5 条，源碼契约）：
① 抵達 URL 带 `troops` 且赋值在 `removeArmy` 之前；② 主將取 `a.general`；③ `officers` 逗号连接；
④ 战斗入口用 `enemySetup(a.to, a.troops)`；⑤ deploy 侧 `ARMY_QUERY` / `MARCH_MODE` / `parseOfficerList` / `MARCH_POOL` 双向对准。
首跑挂在自己的正则上（`const MARCH_POOL` vs 实际 `let MARCH_POOL`），改 `/(?:let|const) MARCH_POOL .../` 后 5/5。

---

## 3. Cocos 版 APK（`tools\build_apk.ps1 -Variant cocos`）

原生 cocos2d-x 路线先否掉：本机无 gradle、无 NDK（`F:\devtools\android\sdk` 只有 build-tools/platforms），
`game\cocos` 也没有 `native/` 模板——要几小时 + 数 GB。所以走「同一个 WebView 壳 + Cocos 产物」：

| 项 | 值 |
|---|---|
| 清单 | `apk\AndroidManifest.cocos.xml`（`com.sanguo.webview.cocos` / versionCode **5** / versionName **1.5**） |
| 应用名 | `res\values\strings.xml` 新增 `app_name_cocos` = 「三國群英傳2 COCOS」 |
| assets | `apk\cocos\www` ← `game\cocos-build\web-mobile`（**独立目录**，不覆盖主包 `apk\assets\www`） |
| 入口 | 壳的 `ENTRY` 写死 `/campaign.html?rel=1` ⇒ 生成一张 475 B 跳转页 `location.replace('index.html')`，**dex 不改** |
| 产物 | `dist\android\sanguo-cocos.apk` · **25,456,415 B** · 3,058 条目 · SHA-256 `FF41A339995300D1B37D2488BBE0F861D84D0E389AFFB3D888E5F0905D5B2FF4` |
| 内容 | `index.html` 2,187 B / `application.6f040.js` / `cocos-js\cc.20d95.js` 1.57 MB / `src\*` 6 个 / bundle 资源 3,039 条 22.67 MB |
| 断言 | 条目清单 + `web 散件泄漏 0`（不许混进 `main.js`、`data/meta.json`、`dist/*`）+ `resources.arsc` stored |
| 构建 | `powershell -NoProfile -File tools\build_apk.ps1 -Variant cocos`，7.5 s |

主包（web 版 1.4 `sanguo-debug.apk`）与烟雾包（`sanguo-smoke.apk`）数字不变，三个变体共用同一份 `classes.dex`。

---

## 4. 验证（2026-11-26 08:09）

| 项 | 结果 |
|---|---|
| `cd game; npm.cmd exec -- tsc --noEmit` | **0** |
| `node --test "tests/*.test.ts"` | **1690 tests / 87 suites / 1690 pass / 0 fail**（10.2 s） |
| `node node_modules\typescript\bin\tsc -p cocos\tsconfig.check.json` | **0** |
| Cocos preview 构建 | `BUILD_EXIT=0`，`web-mobile\index.html` **2026-11-26 08:08:20**、23.19 MB |
| Cocos 叫阵实机 | `result: OK`（上文 dump），两图见 `work\r212_cocos\` |
| Cocos 版 APK | `APK_EXIT=0`，`aapt2 dump badging` = `com.sanguo.webview.cocos` / `versionCode='5' versionName='1.5'` / label `三國群英傳2 COCOS` |
| 遗留验证浏览器 | **0**（`cdpweb close` + `reap --kill --match=edgeprof_r212`） |

### 复跑

```powershell
cd F:\sanguo\game; npm.cmd exec -- tsc --noEmit
cd F:\sanguo\game; node --test "tests/*.test.ts"
cd F:\sanguo\game; node node_modules\typescript\bin\tsc -p cocos\tsconfig.check.json
cd F:\sanguo; powershell -NoProfile -File tools\build_wechat.ps1 -AppId wxf631d432ca7abcee -Mode preview
cd F:\sanguo\game; node web/serve.mjs 5299        # 站点根 = game\
cd F:\sanguo; $env:PAGE_URL='http://127.0.0.1:5299/cocos-build/web-mobile/index.html'; $env:MATCH='5299'; `
  $env:PORT='9333'; $env:PROFILE='F:\sanguo\work\.edgeprof_r212'; $env:OUTDIR='F:\sanguo\work\r212_cocos'; `
  node work\cocos_verify\cdpweb.mjs launch; node work\cocos_verify\cdpweb.mjs run work\r212_cocos\steps_taunt.mjs
cd F:\sanguo; powershell -NoProfile -File tools\build_apk.ps1 -Variant cocos
```

---

## 5. 本轮踩到的坑

1. **`edit` 工具写 `.ps1` 会掉 UTF-8 BOM** ⇒ `powershell -File` 整篇按 GBK 读，报 `Unexpected token '" }`。
   每次改完 `.ps1` 都要补 BOM（`[System.IO.File]::WriteAllText($p,$t,(New-Object System.Text.UTF8Encoding($true)))`）再 `Parser::ParseFile` 验 `parseErrors=0`。本轮连踩两次。
2. **`Copy-Item -Path xxx\* -Destination (不存在的目录)`** 会把第一个子目录改名成目标名，报
   `Container cannot be copied onto existing leaf item`。先 `New-Item -ItemType Directory` 再复制。
3. **Cocos web-mobile 的文件名带 hash**（`application.6f040.js`、`cc.20d95.js`、`settings.ffbeb.json`），
   APK 断言不能钉全名，只能钉 `index.html` + 「有 `application.*.js`」+ 目录计数。
4. **`World` 上没有 `seed`**：Cocos 叫阵种子只能取 `launch.seed`（web 侧是 `cfg.seed`），别照 web 抄。
5. **台词框的 Label 与底板要一起开关**（见 §1 坑 1）。

---

## 6. 还剩什么

见 `project\44_交接简报.md` §6。本轮消掉的：deploy 兵源契约（1h）、Cocos 叫阵（2h），另加了 Cocos 版 APK（不在原清单里）。
剩下约 **29h**：APK 复测 0.2 / F16 钱包 2 / F19·F20 1.2 / 内政 P1 8 / R115 剩余消费点 2 / R83 4 / R81 4 / R91 3 / R103 4 / 音频 CDN 0.5 / `dist\ub*` 0.1。
微信 0.2.1 仍卡在 23.08 MB > 20 MB（png→webp 瘦 3.1 MB 后才传）。
