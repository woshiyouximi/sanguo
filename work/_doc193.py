import io

# ---------- 1) project/31 追加 §一之補 22 ----------
p31 = r'F:\sanguo\project\31_还原清单.md'
add31 = """

### §一之補 22（R193：透视 / 俘虏字段 / Cocos HUD·色数 / 音频 base 配置化）

| # | 项目 | 结论与落点 | 证级 |
|---|---|---|---|
| 237 | 战斗透视投影 | `game/src/view/projection.ts`（331 行）新增单点投影 `projectUnit(gx,gy,camX)->{sx,sy,scale}` 与反解 `screenToUnit`；标定端点 `PITCH_FAR_PX=53`、`PITCH_NEAR_PX=84.5`（R190 §5 实测），`rowScale=e^{k(r-r0)}` 折算 0.7420…1.1830；纵向格距 71.43 常数 → 53.0/68.75/84.5；可见行数 12.60→13.33。绘制/命中/弹道/特效/瞄准圈全部走同两函数（`hitTest` 一行未改，`screenToCell` 现为包装） | [确认] 端点 / [推测] 纵向分布形状 |
| 238 | 俘虏四字段真值 | 招降面板士氣 `[g+0x38]`(`0x44F222`)、疲勞 `[g+0x3A]`(`0x44F25F`)、勝場 `[g+0x9F]`(`0x44F3BE`)、敗場 `[g+0xA1]`(`0x44F3FE`)；勝/敗按武将持久化（累加 `0x4084C9`，写档 `0x431A7A`→`+0xC7`、读档 `0x43348B`）。本作落 `saves.js` 的 v3 可选 `generalRecord`（`generalRecordOf/noteGeneralResult`），旧档无记录返回 `null` 渲染「—」，**不再恒灰** | [确认] |
| 239 | 士氣/疲勞战后口径 | 战后 `gW+0x38=unitW+0x2C`、疲勞 `+=15+秒/10`（`0x41048D`）⇒ 面板显示战后残值；本作取 `save.morale/save.tire` 同名条目，缺条目保持「—」不拿缺省 60 冒充 | [确认] |
| 240 | Cocos 战斗 HUD 补 `體` | `BattleHud.ts` 卡行位对齐 web `GENERAL_CARD_Y`（兵 1040 / 體 1056、条 1034/1050、8px；`技` 10px 不占行；疲/士/智/武 13px 两列、敌卡镜像；`行` 3px），`hud_assert.mjs` 108 条、`input_assert` 386 条不退化 | [确认] |
| 241 | Cocos 招降十欄 | `SurrenderPanel.ts` 与 web `surFields` 同序十欄；Cocos 端 `SurrenderCard` 无这些字段 ⇒ 7 项灰「—」（未编数）。要跟上 web 需给 `core/roster.ts` 的 `SurrenderCard` 加字段 + `SurrenderModel.viewOf()` 带出（本轮禁改） | [确认]（缺口登记） |
| 242 | Cocos 编成页色数 | `Draw.gridWeave()`（蛇形排列）替代纯 `gridShade`：3143→**4241**（口径：半分辨率 375×667 NEAREST、≥8 次 RGB），过 3631 线；偏紫复核区域均值最大通道差 1.4、偏紫像素 1.42%→1.42% | [确认] |
| 243 | Cocos 物品页空带 | 详情区最长连续无墨 302px→**23px**、大圖框 111px→7px（空态补 12 行欄名 + 常驻注解带） | [确认] |
| 244 | 音频 CDN base 配置化 | `tools/audio_cdn_config.json` 为权威来源（`-AudioBase` 优先）；`example.com/your.com/localhost/127.0.0.1` 在构建与自检**双双硬拒**（构建 throw、`check_audio_cdn.mjs` exit 3）；未配置时显式 `Write-Warning` 静音出包 | [确认] |
| 245 | `build_wechat.ps1` 的 BOM 坑 | 该脚本必须 **UTF-8 with BOM**：丢 BOM 后 Windows PowerShell 5.1 按 ANSI 读、中文注释变乱码并 `Unexpected token '-AudioBase'` 直接不解析（R193 实际踩到）。改完用 `[Parser]::ParseFile` 验 `parseErrors=0` | [确认] |

出包实测（R193 终版）：主包 **2.49 MB / 28 档**、`subpackages\\res` **14.56 MB / 2919 档**、总计 **17.06 MB / 2947 档**；`verify_pkg` → `RESULT: PASS`（image native 1391 / bad 0 / import 缺 0）；`check_audio_cdn --pkg` → `RESULT: PASS`（base 空 = 包内静音，显式）。
"""

with io.open(p31, 'a', encoding='utf-8', newline='\n') as f:
    f.write(add31)
print('31 appended', len(add31))

# ---------- 2) project/44 整篇重写（第 193 轮） ----------
p44 = r'F:\sanguo\project\44_交接简报.md'
brief = """# 交接简报 · 第 193 轮（2026-11-25 晚）

> 一句话状态：战斗表现已按原作反汇编+实况录像逐项对齐（透视投影、先飞后判、60Hz、HUD 四字段+體），web 1544 测试全绿、打包门禁 13 PASS / 0 FAIL / 1 SKIP；**微信包已出**（17.06 MB），音频按用户口径走 CDN，当前 `base` 为空 ⇒ 包内静音（填一行就能有声）。

## 一、硬指标（2026-11-25 19:11 快照）

| 项 | 数字 |
|---|---|
| web 全量测试 | **1544 / 1544 pass / 0 fail**（`work\\test_r193.log`） |
| web tsc | `tsc --noEmit` exit 0、`tsc -p tsconfig.build.json` exit 0 |
| cocos tsc | `tsc -p tsconfig.check.json --noEmit` exit 0 |
| 保真网 | `node work\\fidelity\\check.mjs` → **PASS 459 / FAIL 0 / SKIP 3 / WARN 0** |
| 两端数值对拍 | 50,128 条目 / 1,257,643 字段 / **0 不一致**（退出码 0） |
| 数据逐字段审计 | 18 表 / 52,743 格 / **0 差异**（不可比 12 组已登记） |
| 打包门禁 | `tools\\gate_fidelity.ps1` → **PASS 13 / FAIL 0 / SKIP 1**（SKIP = `assert_layout.mjs` 需 devtools 9333） |
| 微信包 | 主包 **2.49 MB**（28 档）＋ 分包 **14.56 MB**（2919 档）＝ **17.06 MB**（2947 档），`verify_pkg` PASS |
| 音频 | `check_audio_cdn --pkg` PASS；`base` 空 ⇒ **包内静音**（显式告警，不是意外） |
| cocos 断言 | `input_assert` 386/386、`cmd_assert` 369/369、`skin_assert` 7691、`skin_nodes_assert` 107/107、`hud_assert` 108/108、`assert_army` 65/65 |

## 二、本轮改了什么（按用户「2、3、4 修完打包 + 1 也改」）

### 1) 战斗透视投影（第 2 项）`project\\193_透视投影.md`
- 新建 `game/src/view/projection.ts`：`projectUnit(gx,gy,camX) -> {sx,sy,scale}` + 反解 `screenToUnit`，**绘制/命中/弹道/特效/瞄准圈全部同源**。
- 端点取自录像实测（R190 §5）：远排 `53 px/格`、主将排 `84.5 px/格`，`rowScale` 0.7420…1.1830；纵向格距从常数 71.43 变成 53.0/68.75/84.5；可见行数 12.60→13.33。
- 已知代价：横向整体变窄 19%（`LANE_SQUEEZE` 换「14 条车道永不裁边」）；摄像机夹取仍在 core（禁改），camX 顶到边界时最近一排会低 34.6px。

### 2) Cocos 战斗 HUD 补 `體`、招降十欄（第 3 项之一）`project\\194`
- `BattleHud.ts`：兵/體 各 8px 条（88/72 宽）、`技` 10px 小字不占行、疲/士/智/武 13px 两列、`行` 3px 细条、敌卡整块镜像；`hud_assert.mjs` **108 条**全过。
- `SurrenderPanel.ts`：与 web `surFields` 同序十欄；Cocos `SurrenderCard` 没这些字段 ⇒ 7 项灰「—」（**不编数**）。

### 3) Cocos 编成页色数 + 物品页空带（第 3 项之二）`project\\195`
- `Draw.gridWeave()` 蛇形排列：编成页色数 3143→**4241**（过 3631 线），偏紫复核最大通道差 1.4。
- 物品详情区空带 302px→**23px**，大圖框 111px→7px。

### 4) 俘虏字段真值（第 4 项）`project\\196`
- 反汇编定死：士氣 `[g+0x38]`、疲勞 `[g+0x3A]`、勝場 `[g+0x9F]`、敗場 `[g+0xA1]`（面板 `0x44F222/0x44F25F/0x44F3BE/0x44F3FE`）；勝/敗按武将持久化（累加 `0x4084C9`、写档 `0x431A7A`→`+0xC7`、读档 `0x43348B`）。
- 本作落 `saves.js` v3 可选 `generalRecord`：有记录显真值、无记录「—」（旧档不崩）。截图里呂布 64/20/3/1、夏侯惇 81/12/5/0。

### 5) 音频 CDN base 改成配置驱动（第 1 项）`project\\142` §7
- `tools/audio_cdn_config.json` 是权威来源（`-AudioBase` 优先）；**占位/本机地址在构建与自检双双硬拒**（`example.com`/`your.com`/`localhost`/`127.0.0.1`）；未配置时显式 `Write-Warning` 静音出包。
- 顺带修：`build_wechat.ps1` 被编辑器丢了 UTF-8 BOM 后 Windows PowerShell 5.1 直接 parse error（`Unexpected token '-AudioBase'`）——已恢复 BOM 并写进坑表。

## 三、怎么跑

```powershell
cd F:\\sanguo\\game; npm.cmd exec -- tsc --noEmit
cd F:\\sanguo\\game; node --test tests/*.test.ts
cd F:\\sanguo\\game; node web/serve.mjs 5199   # → http://127.0.0.1:5199/web/campaign.html
node work\\fidelity\\check.mjs
$env:DOTNET_ROLL_FORWARD='LatestMajor'; & 'C:\\Users\\liutian\\.dotnet\\tools\\pwsh.exe' -NoProfile -File tools\\gate_fidelity.ps1
Remove-Item Env:\\ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
powershell -File tools\\build_wechat.ps1 -AppId wxf631d432ca7abcee -Mode upload
```

## 四、坑（接第 192 轮，新增 41–45）

41. **Cocos 页面在后台会停 rAF**：CDP 必须 `Page.bringToFront` 并确认 `getTotalFrames()` 在涨，否则截到上一帧、`getScene()` 还是 null，`loadScene` 报误导性的 `1209`。
42. **`build_wechat.ps1` 必须带 UTF-8 BOM**：丢 BOM ⇒ PS5.1 按 ANSI 读 ⇒ 中文注释乱码 + `Unexpected token` 不解析。改完跑 `[Parser]::ParseFile` 验 `parseErrors=0`。
43. **`-Mode preview -SkipWeb` 只出微信包、不重建 `game\\cocos-build\\web-mobile`**；要让本地页面看到改动就去掉 `-SkipWeb`。
44. **多个 CocosCreator 进程会抢同一 asset db**：并行 agent 各自建 `work/<x>/cocos-build` 更安全；共享 `game\\cocos-build` 只能一个人建。
45. **含中文的文件一律不要走 PowerShell 文本管线**（`Get-Content|Set-Content`）：已三次造成 GBK 乱码（`battleView.ts`、`gen_expect.mjs`、`DeployRoot.ts`），只能用 read/write/edit 或 python 显式 utf-8。

## 五、下一步（按阻塞程度）

1. **音频 CDN 真 base**：把 `dist\\audio-cdn`（110 档 16.86 MB）上传，根地址填 `tools\\audio_cdn_config.json`，重出包（2h，只需一行）。
2. **Cocos 招降十欄真值**：给 `core/roster.ts` 的 `SurrenderCard` 加 `morale/tire/wins/losses`、`SurrenderModel.viewOf()` 带出（2h，需放权 core/model）。
3. **摄像机夹取跟随透视**（core，禁改，需放权）：修 camX 顶边界时最近一排低 34.6px。
4. 横向 19% 变窄是否接受（把 `LANE_SQUEEZE` 置 1 则近处只见 ~9 车道，更接近原作；会红两条测试）。
5. 微信真机帧率实测（3h，需真机）。
6. Cocos 渲染与 web 的色数差距（web 39k vs Cocos 4k，`Graphics` 二维近似上限）。

## 六、交付物索引（本轮）

- 报告：`project\\193_透视投影.md`、`194_Cocos_HUD體与招降字段.md`、`195_Cocos色数与空带收口.md`、`196_招降字段真值.md`、`142_音频CDN上线.md` §7
- 截图：`work\\persp\\after_100v100.png`、`work\\cocos_hud2\\cards_closeup.png`、`work\\cocos_render4\\contact.png`、`work\\sur_fields\\after.png`、`work\\r193cocos2\\v193_battle.png`
- 包：`dist\\wechat-upload`（17.06 MB / 2947 档）
"""

with io.open(p44, 'w', encoding='utf-8', newline='\n') as f:
    f.write(brief)
print('44 rewritten', len(brief))
