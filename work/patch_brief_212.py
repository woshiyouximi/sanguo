import re, io, sys
p = r'F:\sanguo\project\44_交接简报.md'
s = io.open(p, encoding='utf-8').read()
orig = s

# 1) 标题 + §0
s = s.replace('# 交接简报 · 第 211 轮（2026-11-26 07:53）', '# 交接简报 · 第 212 轮（2026-11-26 08:14）', 1)
old0 = s[s.index('《三國群英傳 2》竖屏重制：'):s.index('\n\n\n---')]
new0 = (
 '《三國群英傳 2》竖屏重制：**web 版可完整通关**（1690 条测试全绿、三道 tsc 干净、原作保真网 459 条 0 失败）；'
 '**战斗流程已按原作重定标**（开场两段叫阵 + 逐句切镜、镜头钉主将、不穿阵 + 斜前贴打、真实攻击帧与受击），'
 '**Cocos 版可跑且战斗也有叫阵**（两段台词 + 镜头硬切说话方，播完回我方主将 −2 行；HUD 头像框與名册行都是真肖像；战场已删「把敌将贴进画面」的 `clampShift`）；'
 '**内政/经济 P0 十条已落地**（正月窗口、逐将年令、钱变兵、守军月补删除、大地图第三套「開發」口径删除）+ 出征兵源契约；'
 '**微信小游戏 0.2.0 已上传**（18.1 MB；0.2.1 卡在 23.08 MB > 20 MB，要先瘦身）；'
 '**两个 APK**：web 主包 1.4（待真机复测）+ **Cocos 构建版 1.5**（`sanguo-cocos.apk`，同一 WebView 壳，`assets/www` = Cocos 产物）。'
 '对照原作还剩约 **29h ≈ 3.6 人日**，明细见 `project/199` 与下方 §6。'
)
s = s.replace(old0, new0, 1)

# 2) §1 硬指标
s = s.replace('| 单元/集成测试 | `node --test "tests/*.test.ts"` | **1685 tests / 87 suites / 1685 pass / 0 fail**（10.3 s，`work\\test_r211.log`） |',
              '| 单元/集成测试 | `node --test "tests/*.test.ts"` | **1690 tests / 87 suites / 1690 pass / 0 fail**（10.2 s） |', 1)
s = s.replace('| 内政专项 | `node --test tests/affairs_f13.test.ts tests/affairs_f14.test.ts tests/affairs_f2f3.test.ts tests/affairs_f1f8.test.ts tests/march_flow.test.ts` | **6 + 2 + 6 + 6 + 28 PASS** |',
              '| 内政专项 | `node --test tests/affairs_f13.test.ts tests/affairs_f14.test.ts tests/affairs_f2f3.test.ts tests/affairs_f1f8.test.ts tests/march_flow.test.ts` | **6 + 2 + 6 + 6 + 28 PASS** |\n| 出征兵源契约 | `node --test tests/march_arrival_contract.test.ts` | **5 PASS**（抵達 URL 带 `troops/a/officers`） |', 1)
s = s.replace('| Cocos 类型 | `node node_modules\\typescript\\bin\\tsc -p cocos\\tsconfig.check.json` | **exit 0** |',
              '| Cocos 类型 | `node node_modules\\typescript\\bin\\tsc -p cocos\\tsconfig.check.json` | **exit 0** |\n| Cocos 叫阵实机 | `node work\\cocos_verify\\cdpweb.mjs run work\\r212_cocos\\steps_taunt.mjs` | **result: OK**（cams 13→58、tick 冻 0、播完 camX 56） |\n| Cocos 版 APK | `powershell -File tools\\build_apk.ps1 -Variant cocos` | **exit 0**，25,456,415 B / 3,058 条目 / SHA-256 `FF41A339…2FF4` |', 1)

# 3) §2 产物表
s = s.replace('| 1685 绿；四页 + 战斗 + 名册/势力图/城池一览/招降全可用', '| 1690 绿；四页 + 战斗 + 名册/势力图/城池一览/招降全可用', 1)
s = s.replace('→ `game\\cocos-build\\web-mobile`（当前 **2026-11-26 07:39:22**）',
              '→ `game\\cocos-build\\web-mobile`（当前 **2026-11-26 08:08:20**）', 1)
s = s.replace('**叫阵尚未移植到 Cocos**（`BattleRoot` 不 import `open_taunt`） |',
              '**叫阵已移植到 Cocos**（`BattleRoot.beginTaunt/tickTaunt/endTaunt` + `BattleHud.TauntBanner`；实机 cams 13→58、播完 56、`?taunt=0` 关） |', 1)
s = s.replace('| **APK（WebView 壳）** | `dist\\android\\sanguo-debug.apk`（**1.4 / versionCode 4**，50,317,555 B / SHA-256 `8956D07C0B60013D78D8DE5726B3E78E527BA3501CF6640DEC56DA3936954C81`，2026-11-26 07:55）<br>`dist\\android\\sanguo-smoke.apk`（82,470 B / `A1CE2169A8BDEE983AFA5D35F9199EED5FB08DE5530E4B47B274038AF1EF2856`） | **1.4 等用户复测**（含 R207–R211 全部改动：真肖像、叫阵、镜头钉主将、Cocos 脱贴边、内政 P0）。⚠️ `tools\\build_apk.ps1` 原先**没有 UTF-8 BOM**，用 `powershell -File` 跑会整篇 mojibake 报 `Unexpected token`；已补 BOM（S-007）。 |',
              '| **APK（WebView 壳）** | ①`dist\\android\\sanguo-debug.apk`（**web 版 1.4 / versionCode 4**，50,317,555 B / SHA-256 `8956D07C…54C81`）<br>②`dist\\android\\sanguo-cocos.apk`（**Cocos 版 1.5 / versionCode 5**，25,456,415 B / 3,058 条目 / SHA-256 `FF41A339995300D1B37D2488BBE0F861D84D0E389AFFB3D888E5F0905D5B2FF4`，包名 `com.sanguo.webview.cocos`、桌面名「三國群英傳2 COCOS」）<br>③`dist\\android\\sanguo-smoke.apk`（82,470 B / `A1CE2169…F2856`） | 两个都**等用户真机复测**。Cocos 版 = 同一个壳 + `assets/www` 换成 `game\\cocos-build\\web-mobile`（`campaign.html` 是 475 B 跳转页 → `index.html`）。⚠️ `edit` 工具写 `.ps1` 会掉 BOM，改完必须补（§5 第 2 条）。 |', 1)

# 4) §3 标题与新增第 14 条
s = s.replace('## 3. 这一阶段（R193→R211）做完的事', '## 3. 这一阶段（R193→R212）做完的事', 1)
item13_end = '实测现在金不变、人口 +11530、防御 +41）。出征经济闭环（`web/march_flow.js`：deploy 按出发城实有兵扣兵、战后按存活比回写）。'
item14 = ('\n14. **Cocos 叫阵 + 出征兵源契约 + Cocos 版 APK**（R212，`project/212`）：①`BattleHud.TAUNT_BANNER` + `TauntWho/TauntTag/TauntLine`，`BattleRoot` 取 `buildTauntSeq`、逐句硬切 `camX`、播完 `camX = camera(world)`；实机 cams 13→58、tick 冻 0、播完 56、框与 Label 全收。'
          '②出征抵達城下时在 `removeArmy` **之前**补 `troops/a/officers`（旧码删了兵团才跳 deploy ⇒ 退回 city 模式拿城里余兵），5 条源碼契约测试钉住。'
          '③`tools\\build_apk.ps1 -Variant cocos`：独立 `apk\\cocos\\www`、`AndroidManifest.cocos.xml`（1.5 / `.cocos` 后缀）、跳转壳页，产物 25.46 MB / 3,058 条目。')
s = s.replace(item13_end, item13_end + item14, 1)

# 5) §4 命令块补 cocos APK
s = s.replace('powershell -File tools\\build_apk.ps1            # 输出 dist\\android\\sanguo-debug.apk + sanguo-smoke.apk',
              'powershell -File tools\\build_apk.ps1                     # web 主包 → dist\\android\\sanguo-debug.apk\npowershell -File tools\\build_apk.ps1 -Variant smoke      # 烟雾包 → sanguo-smoke.apk\npowershell -File tools\\build_apk.ps1 -Variant cocos      # Cocos 版 → sanguo-cocos.apk（先跑 -Mode preview）', 1)

# 6) §5 坑表：改第 2 条 + 追加 19/20
s = s.replace('2. `.ps1` 必须带 UTF-8 BOM，否则 WinPS 5.1 按 ANSI 读会报满屏 `Unexpected token`；改完用 `[Parser]::ParseFile` 验 `parseErrors=0`。',
              '2. `.ps1` 必须带 UTF-8 BOM，否则 WinPS 5.1 按 ANSI 读会报满屏 `Unexpected token`；改完用 `[Parser]::ParseFile` 验 `parseErrors=0`。**`edit` 工具写 `.ps1` 会顺手把 BOM 去掉**（R212 连踩两次）——每次 `edit` 之后都要补：`$t=[IO.File]::ReadAllText($p,[Text.Encoding]::UTF8); [IO.File]::WriteAllText($p,$t,(New-Object Text.UTF8Encoding($true)))`。', 1)
s = s.replace('18. **镜头与叫阵必须同源**', '18. **镜头与叫阵必须同源**', 1)
extra = ('\n19. **`Copy-Item -Path dir\\* -Destination (不存在的目录)`** 会把第一个子目录改名成目标名，报 `Container cannot be copied onto existing leaf item`；先 `New-Item -ItemType Directory` 再复制。'
         '\n20. **Cocos web-mobile 的文件名带 hash**（`application.6f040.js` / `cc.20d95.js` / `settings.ffbeb.json`），打包断言不能钉全名；`World` 上也没有 `seed` 字段（叫阵种子只能取 `launch.seed`）。'
         '\n21. **叫阵台词框的 Label 与底板要一起开关**：Label 挂在 `consoleRoot`（摆位需要），只关 `tauntRoot` 会留下「名字 / 叫 陣 / 台词」三条浮在阵上。')
s = s.replace('（用户「喊完没回到己方武将」的根因）；两处都要用「主将 − 2」。', '（用户「喊完没回到己方武将」的根因）；两处都要用「主将 − 2」。' + extra, 1)

# 7) §6 剩余待办
old6 = s[s.index('> 已完成：**Cocos 战斗 HUD 真肖像**'):s.index('\n\n\n---\n\n## 7.')]
new6 = ('> 已完成：**Cocos 战斗 HUD 真肖像**（R207，2h）、**名册列表行头像**（R208，1h）、**原作乱数流复刻 + web/Cocos 接线**（R209+R211，8h）、'
        '**战斗流程重定标**（R211：叫阵/镜头/不穿阵/动作帧/俘虏归属，约 14h）、**内政经济 P0 十条**（R211，约 10h）、**出征经济闭环**（R211，2h）、'
        '**Cocos 叫阵 + deploy 兵源契约**（R212，3h）。下面合计约 **29h**。\n\n'
        '| # | 项 | 工时 | 说明 |\n|---|---|---|---|\n'
        '| 1 | **APK 真机/模拟器复测**（web 1.4 + Cocos 1.5） | 0.2h | 用户侧；先 `sanguo-smoke.apk` 看「SHELL OK」再装主包，命令见 §4/`project/206` |\n'
        '| 2 | F16 钱包分裂 | 2h | F13 用每城 `st.money`，顶栏 `save.gold` 仍单钱包 |\n'
        '| 3 | F19/F20 + 情報占令 | 1.2h | 武将上限字段、chip 上限后缀；情報若该占一令改 `openIntel` 一行 |\n'
        '| 4 | 内政 P1（F4/F5/F7/F10/F26、F28 旗帜与色板） | 8h | 见 `work/internal_affairs/REPORT.md` §4 |\n'
        '| 5 | R115 剩余消费点 | 2h | 战后招降 `capture.ts`、脚本 VM `runtime.ts`（1769/1938/2256）接 `world.roll` |\n'
        '| 6 | R83 部队指令精确步长 | 4h | `project/155` 已有权重表，缺「一次命令走几格」的正证 |\n'
        '| 7 | R81 Exec34「3 後選出陣」三槽 | 4h | 仍 `[推测]` |\n'
        '| 8 | R91 撤退不还手正证 | 3h | `project/160` 证据不足 |\n'
        '| 9 | R103 微信真机帧率 + 编成页色数守护 | 4h | 需真机 |\n'
        '| 10 | 音频 CDN 真 base | 0.5h | 用户给根地址后填 `tools\\audio_cdn_config.json` 的 `base` 并重出包（否则静音） |\n'
        '| 11 | `dist\\ub*` 清理 | 0.1h | 被开发者工具占用，关掉工具后删 |\n'
        '| 12 | 微信 0.2.1 瘦身并上传 | 1h | png→webp 瘦 ~3.1 MB（`res/bg` 3.84 / `res/hero` 3.03 / `res/face` 2.64） |')
s = s.replace(old6, new6, 1)

# 8) §7 第 6 条
s = s.replace('6. Cocos 原生 APK（NDK+gradle）是否需要——当前只有 WebView 壳。',
              '6. Cocos 原生 APK（真 cocos2d-x，要 NDK+gradle，几小时/数 GB）是否需要——当前给的是「WebView 壳 + Cocos 构建产物」的 `sanguo-cocos.apk`（1.5），请先试这个。', 1)

# 9) §8 基线
s = s.replace('**基线不是 1685 就先修基线再动功能**', '**基线不是 1690 就先修基线再动功能**', 1)
s = s.replace('1. 读本文件 → `project/211_战斗流程与内政P0.md`（本轮八路并行做了什么、数字与坑）',
              '1. 读本文件 → `project/212_Cocos叫阵与Cocos版APK.md`（叫阵移植/兵源契约/两个 APK）→ `project/211_战斗流程与内政P0.md`（八路并行做了什么、数字与坑）', 1)

# 10) §9 索引
s = s.replace('`211` 战斗流程重定标与内政 P0。', '`211` 战斗流程重定标与内政 P0 · `212` Cocos 叫阵与 Cocos 版 APK。', 1)

io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('changed', len(orig), '->', len(s))
