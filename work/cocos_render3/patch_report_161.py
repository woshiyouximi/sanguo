# -*- coding: utf-8 -*-
"""161 报告收尾更新：b3g 口径 → b4c 口径（含 lead 追加的五项）。显式 utf-8 读写。"""
import io, re

P = r'F:\sanguo\project\161_Cocos渲染对齐3.md'
s = io.open(P, encoding='utf-8').read()


def rep(old, new, n=1):
    global s
    c = s.count(old)
    assert c == n, 'count=%d for %r' % (c, old[:60])
    s = s.replace(old, new)


# ── §1：追加「目标 4」（lead 第二轮追加的两项）与 DeployRoot 段落 ──────────────
rep(
    '## §2 三组前后数字',
    r'''### 目标 4：编成页二维色域 + 物品页版面（lead 第二轮追加）

**4.1 编成页**（`DeployRoot.ts` 解禁后，只动绘制，未碰出阵队列逻辑与文案）
编成页原本是四页里余量最薄的（2288 → 2905），因为 40 余格兵種/陣形是 Skin 九宫 Sprite、
底色只有一段 `vBands`。改成「每格一块二维色域」：

- `DeployRoot.ts:701` 之后新增 `private areaGrid(g, x, y, w, h, cols, rows, base, gDown, alpha)`
  → 调 `Draw.gridShade(...)`；同处新增 `private cellGrid(g, x, y, w, h, top, bottom, cols, rows, alpha)`
  （拿两个色算 G 下沉量，解析失败回落 `vBands`）。
- 六张卡：`DeployRoot.ts:930` 一带（`SECTION_CARDS` 循环内）`areaGrid(ui, r.x+7, r.y+9, r.w-14, r.h-18, 34, rows, '#221F1B', 10, 232)`。
- 兵種/陣形 13+9 格：`DeployRoot.ts:1014`（`drawGrid` 格底）改 `cellGrid(..., 10, 12)`；主將 12 格 `drawGenGrid`
  同款 `6×12`；軍師技 2 钮 `drawWise` `10×9`。
- 底栏两钮 `DeployRoot.ts:1130`/`:1134`（返回 / 出征）、出阵窄条 `:1211`、页头与底栏压条、
  立绘板 `:922` 全部换 `areaGrid/cellGrid`。
- 教训（决定成败的一条）：**第一版 4×3 粗格反而掉色**——`lightGrid` 每格只有一个平色，
  抹掉 12 段色带的过渡后，单元格 ≥8 的颜色数从 62 掉到 36（troop cell0 62→36、wise 57→16）。
  正解是「每格只差 1 个 8bit 单位、且每格仍 ≥60 半分辨率像素」。
- **偏紫事故（§5-A）**：把卡片基色从冷灰改成暖色字面量 `#241F18`，再让 20+ 行一路压 G
  （`span = max(rows+1, gDown)` = 23），深色区 G 掉到 6、B 还在 29 → 整页洋红。
  最终按 lead 裁决换中性基色（`#221F1B`/`#1E2024`/`#201A14`、G 下沉夹到 10）+ 列振幅 6/4、
  列池 28，色数 3179（紫）→ **3119 → 3134**（中性），比紫色版只低 1.9%。

**4.2 物品页空带 + 行内重复文案**（`ItemsPanel.ts`）
- 主将卡下方原本有 30px 纯空带（四槽结束 y=368、卡片底 398）。新增 `LAYOUT.genBonus = { x:34, y:369, w:682, h:24 }`
  （`ItemsPanel.ts:150` 一带）、`private labelGenBonus: Label | null = null`、`makeLabel('ItemsGenBonus', ...)`
  + `applyTextRole(this.labelGenBonus, 'badge', 12)`；`renderGeneral()` 里遍历四槽累加成
  「裝備總加成　武力 +N…　·　已裝備 n/4」，空槽时「裝備總加成　—　四槽皆空　·　右側選一件，按「裝 備」」；
  `drawFrame()` 在 `LAYOUT.genBonus.y - 3` 补一条 `hline` 分隔线（web `items.html` 的 `.genfoot{border-top}`）。
- 行内同义重复：原来一行同时有「武力上昇1點。」与「Lv1 · 武力+1」。新增
  `function rowExtraText(item): string`（`ItemsPanel.ts:1140` 一带）按 `[，、。]` 切条，
  **滤掉**「X上昇N點」「使用等級N」两类（它们已经由 `+N` 与 `Lv` 表达），只留其余关键词；
  无剩余时 desc 隐藏、meta 回到 `parts.merged` 单行居中。

## §2 三组前后数字''',
)

# ── §2.1：表头口径 + 数字改成 b4c ────────────────────────────────────────────
rep(
    '| 页面 | before（13:17 构建 / `b3_before_*`） | after（13:56 构建 / `b3g_*`） | 变化 | 25% 目标线 | 判定 |',
    '| 页面 | before（13:17 构建 / `b3_before_*`） | after（最终构建 / `b4c_*`） | 变化 | 25% 目标线 | 判定 |',
)
rep(
    '| 大地圖 campaign | **3301** | **4330** | **+31.2%** | 4126 | ✅ |\n'
    '| 內政 city | **3008** | **4708** | **+56.5%** | 3760 | ✅ |\n'
    '| 物品 items | **1240** | **2196** | **+77.1%** | 1550 | ✅ |\n'
    '| 編成 deploy | **2288** | **2905** | **+27.0%** | 2860 | ✅（餘量僅 45 色） |',
    '| 大地圖 campaign | **3301** | **4329** | **+31.2%** | 4126 | ✅ |\n'
    '| 內政 city | **3008** | **4708** | **+56.5%** | 3760 | ✅ |\n'
    '| 物品 items | **1240** | **2157** | **+74.0%** | 1550 | ✅ |\n'
    '| 編成 deploy | **2288** | **3134** | **+37.0%** | 2860 | ✅（lead 追加目标 3631 **未達**，見 §5-2） |',
)
rep(
    '同口径 `uniq`（不去重阈值，整页唯一 RGB 数，d2）：20433→21738、15634→22364、8790→10416、10519→11670。\n'
    '全分辨率（d1）≥8：8002→9267、6721→10583、3056→4333、5029→5895。',
    '同口径 `uniq`（不去重阈值，整页唯一 RGB 数，d2）：20433→21741、15634→22364、8790→10319、10519→12749。\n'
    '全分辨率（d1）≥8：8002→9266、6721→10583、3056→4291、5029→6393。\n\n'
    '四页 before/after 对照页（每格标「页名 · 色数 · 同屏字号数」）：\n\n'
    '![四页 before/after 对照](F:/sanguo/work/cocos_render3/contact.png)\n\n'
    r'生成脚本 `F:\sanguo\work\cocos_render3\make_contact.py`（`python make_contact.py b4c`），'
    '同目录还有 `b4c_campaign.png` / `b4c_city.png` / `b4c_items.png` / `b4c_deploy.png` 四张原图。',
)

# ── §3 起整段替换（新断言输出 + 截图清单 + §5 + §6 + 附录）────────────────────
i = s.index('## §3 六条断言的真实输出')
s = s[:i] + r'''## §3 六条断言的真实输出

（第 1 条为節選，15 条逐条结果在 `F:\sanguo\work\cocos_layout\assert_layout.json`；其余为完整尾段。）

```
1) assert_layout（CDP_PORT=9401，先跑 steps_helpers.mjs 装 window.__comp）
   PASS ①a 底圖左溢出 ≤ 1px   rect.x=0 → overflow=0.00px
   PASS ②a 戰報 ∩ 地圖 = 0    戰報={x:16,y:842,w:718,h:298} 交集面積=0
   PASS ③a 城點數 = 60        icons=60 cities=60
   PASS ④ 內政頁最底元素 bottom ≥ 1300  bottom=1334.00
   PASS ⑤a 加成表 10 標籤兩兩不重疊     最大交集面積=0
   PASS ⑤b 左欄數值右邊界一致          right=[590,590,590,590,590]
   PASS ⑤c 右欄數值右邊界一致          right=[728,728,728,728,728]
   PASS ⑤d 兩欄之間有淨空             左欄值右緣 590 → 右欄標籤 x 602，間距 12.00px
   15/15 PASS → F:\sanguo\work\cocos_layout\assert_layout.json

2) layout_guard（work\cocos_monarch84）
   region：CampaignRoot.ts:195–442（246 行）
     標籤：60 城 / 出界 0 / 重疊 0 對
     ✓ 版式純函數區契約完好（仍可獨立 import，四個導出答案不變）

3) hud_layout（work\cocos_monarch84）
     ✓ 頁頭文字都在 750 寬內
     ✓ 兩顆按鈕都在 750 寬內
     ✓ 第二列三塊兩兩不相交
     ✓ 兩顆按鈕與頁頭文字保持 ≥6px 安全距
     ✓ MONARCH_HIT 把君主名整段包住
     ✓ 勢力/物品兩顆按鈕間距 16px — 16px
     ✓ 物品按鈕右邊界 14px — 14px
     ✓ 標題與勢力按鈕之間 ≥20px — 29px
     ✓ 君主名左邊界 = 命中區左界 +6px — 24
     ✓ 按鈕底邊在第二列字身之上 — 66 < 80.0
   ✓ 頁頭版式自檢全部通過（0 出界 / 0 相交）

4) skin_assert（work\cocos_skin）
   九宫断言跑了 260 组（26 key × 10 档尺寸）
   ALL PASS · 断言 7691 条

5) skin_nodes_assert（work\cocos_skinapply）
   九宮 key：A 8 / B 15 / C 30 / D 10（靜態）；TextRole 6 級、降級 5 項
   斷言：107/107 通過
   全部通過 ✓
   （注：這行原本是腳本裏硬編碼的「TextRole 4 級」；按 lead 裁決改成
     `return Object.keys(roles).length;`（`skin_nodes_assert.mjs` 的 `checkTextRole()` 末尾，
     附中文註釋），**斷言值一條沒放寬**，`EXPECTED_ROLES` 仍是那四級的逐欄比對。）

6) tsc -p tsconfig.check.json（cd F:\sanguo\game\cocos; node ..\node_modules\typescript\bin\tsc -p tsconfig.check.json）
   EXIT=0
```

---

## §4 截图清单（`F:\sanguo\work\cocos_render3\`）

| 页面 | before（13:17 构建） | after（最终构建） | 说明 |
|---|---|---|---|
| 大地圖 | `b3_before_campaign.png` | `b4c_campaign.png` | 色数 3301 → 4329 |
| 內政 | `b3_before_city.png` | `b4c_city.png` | 3008 → 4708 |
| 內政（执行命令后） | `b3_before_city_after_cmd.png` | `b4c_city_after_cmd.png` | |
| 物品 | `b3_before_items.png` | `b4c_items.png` | 1240 → 2157（含空带 + 行去重） |
| 編成 | `b3_before_deploy.png` | `b4c_deploy.png` | 2288 → 3134 |
| 编成（中性基色复核） | — | `b4a_deploy_neutral.png` / `b4b_deploy_neutral.png` | 偏紫修复前/后 |
| 惯性 | — | `b3f_inertia_release.png` / `b3f_inertia_settled.png` | 松手瞬间 / 停稳（列表已滑到 Lv32 段） |
| 四页对照页 | — | **`contact.png`**（650×2472，四行两列） | 每格标「页名 · 色数 · 同屏字号数」，已嵌进 §2.1 |
| 对照裁切 | — | `cmp_deploy_bottom.png` / `cmp_items_band.png` / `cmp_items_rows.png` / `cmp_items_band2.png` | 局部 before/after |
| 中间迭代 | | `b3a_*`→`b3g_*`→`b4c_*` | 每轮色数见 §2.1 阶梯表 |

> 註：`b3f_campaign.png` 在最后一次 `PHASE=b3f` 的普查运行里被覆盖成了物品页那一帧（切场景与截图竞态），
> 别拿它当大地圖的 after；§2 阶梯表里 b3f 行的 4329 是覆盖前那一帧实测的。

复现命令：

```powershell
# 构建（约 75s，绝不能带 -SkipWeb）
cd F:\sanguo; Remove-Item Env:\ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
powershell -NoProfile -ExecutionPolicy Bypass -File tools\build_wechat.ps1 -AppId wxf631d432ca7abcee -Mode preview

# 截图（headless + SwiftShader；有头模式窗口被遮挡时 rAF 会被节流，页面停在 Boot）
cd F:\sanguo\work\cocos_verify
$env:PORT='9401'; $env:PROFILE='F:\sanguo\work\cocos_render3\.edgeprof12'
$env:OUTDIR='F:\sanguo\work\cocos_render3'; $env:PHASE='b4c'
$env:PAGE_URL='http://127.0.0.1:8912/cocos-build/web-mobile/index.html'
$env:GPU_ARGS='--headless=new --enable-unsafe-swiftshader'
node cdp.mjs launch; node cdp.mjs run F:\sanguo\work\cocos_render3\steps_pages3.mjs

# 计数 / 字号 / 对照页
$py='C:\Users\liutian\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe'
& $py cstat.py b4c_campaign.png b4c_city.png b4c_items.png b4c_deploy.png
& $py make_contact.py b4c
```

---

## §5 没做到与原因

### §5-A 偏紫事故（本轮最大的一个坑，留档避免重犯）

现象：给编成页铺二维色域后，整页从冷灰变成**洋红/棕紫**（`b3j`/`b3l`），卡片、底栏、按钮全变色，
肉眼一眼可辨（PNG 从 740KB 掉到 446KB，因为大片色块趋同）。

像素实证（同一个点，750×1334 全分辨率）：

| 位置 | before | 紫色版 b3l | 修好后 b4b |
|---|---|---|---|
| 卡片内 (120,600) | (21,23,26) | **(27,6,29)** | (26,22,30) |
| 底栏 (60,1240) | (29,36,44) | **(37,27,52)** | (32,29,37) |

真因不是「网格太密」，是两件事叠加：
① 我把卡片/按钮的**基色换成了暖色字面量**（`#241F18` 之类），而 web 的 `linear-gradient(165deg)`
是三通道**一起**往更暗的暖色走；
② G 下沉量取了 `span = max(rows+1, gDown)`，22 行的卡片就等于一路压掉 23 级 G，
基色 G=31 → 底部 G=8，B 却还在，于是读成洋红。
修法：基色回中性（`#221F1B`/`#1E2024`/`#201A14`）、G 下沉夹 10、列振幅改「小振幅交替」+ 行奇偶抖动 1 级。
代价：色数从紫色版 3179 掉到 3134（−1.4%）。

1. **`uniq`（唯一色）仍只有 web 的 55%**：21741 vs web 39274（campaign）。原因是硬體限制——
   `Graphics` 填純色矩形，要做到 web 那種「每像素 16.7M 可能的漸層」只能上 shader/材質或一張
   逐像素漸層貼圖。本輪的 `gridShade/lightGrid` 是「用最少矩形換最多色」，色數已與 web 齊平
   （4329 vs 4333），但離散色階在 400% 放大下仍看得出格子。要真正追平需要換渲染路徑（§6 第 3 條）。
   `[推測]` 這也是 157 報告說「色數離 web 52–69%」時沒找到的機制。
2. **編成頁沒達到 lead 追加的 3631 目標（現 3134）**：`DeployRoot.ts` 解禁後已鋪滿 40+ 格二維色域，
   但**偏紫修復把色數吃掉了一截**（紫色版 3179 → 中性 3134；更早的斜坡版曾到 4005/3914，代價是整頁變紫）。
   要同時「不偏紫」與「≥3631」只剩兩條路：
   ① 給每一格加**雙描邊**（`doubleEdge`）而不是繼續加色格——描邊是「額外的色」且不影響基色；
   ② 把 Skin 九宫的 `plate_sq` 底板換一張「已帶斜向漸層」的圖（`UiSkin.ts` 取圖層允許改，但屬新圖）。
   `[推測]` ① 約 40 行、風險低，預估能把 3134 推到 3600–3800（每格多 2 色 × 40 格 + 邊框交疊）。
3. **`cc.MathUtils` 沒有 `lerp`**（`F:\sanguo\tools\cocos\cc388\resources\resources\3d\engine\bin\.declarations\cc.d.ts:52962`
   只有 abs/signum/clamp/fmod/atan2/…/pow），任務書寫的「越界回彈用 `MathUtils.lerp`」無法照抄，
   改成 `ItemsPanel.ts:125` 自帶 10 行 `lerp()`。行為等價，已在註釋寫明原因。
4. **編成頁底部多出一行「出陣順序（n/5 槽）· 點此調整」**：不是本輪回歸。對照 `cmp_deploy_bottom.png`
   可見 before 那份存檔是 1 個槽位（沒有這一行），after 是 3/5 槽；頁面內容隨存檔狀態變，
   且該行由 `k1-attack-gate` 那條線的文案決定。`[推測]` 該行一直存在，只是 1 槽存檔時字符串為空。
5. **`skin_nodes_assert` 的「TextRole 4 級」已按 lead 裁決改成動態**（現在打印「TextRole 6 級」），
   改的是 `checkTextRole()` 的返回值 `return Object.keys(roles).length;`，**斷言值與 `EXPECTED_ROLES`
   一條沒動**（107/107 語義不變）。`[推測]` 若下輪再加 role，這行會自動跟上。
6. **色數口徑本身偏愛「大色塊」**：「出現次數 ≥8」在 dpr=2 截圖上等於要求每個 RGB 至少佔 8 個
   半分辨率像素。所以更細的漸層反而會被判為 0——`deploy` 從 2581→2759 卡住那次就是這個原因
   （`uniq` 6004 但多數只出現 1–5 次）。本輪靠「每格 1–6 個 8bit 單位差 + 保持大塊面積」繞過，
   但這個口徑不能當「觀感」的唯一指標，報告 §2 同時列了 `uniq`。
   反例也留檔：`b3f` 之後我把 `deploy` 的色格從 4×3 加密到 10×12 時，若格子太小（每格 <8 半分辨率像素）
   色數不升反降，這是「密度有最優值」的直接證據。
7. **慣性只在 CDP 鼠標模擬下取證**（`Input.dispatchMouseEvent`），沒有真機觸屏曲線；
   `[推測]` 真機 `dt` 抖動時 `frames=clamp(dt*60,0.2,3)` 的夾取可能讓滑行距離比桌面長 5–10%。
8. **微信小遊戲端未測帧率**：`vBands` 從 4 段提到 12–16 段 × 10 欄，`Deploy` 頁大約多出 4–6 千個
   `fillRect` 四邊形（再加本輪 40 格的色域）。web-mobile 端無感，`[推測]` 小遊戲低端機可能有 2–5 帧損耗。
9. **內政頁頁頭留白（157 遺留）沒收**：頁頭 y 0..120 的留白屬版式矩形（`CityPanel.ts` 的 `R_*` 常量），
   本輪只動繪製與文本，按紀律沒碰矩形；列為遺留（§6 第 4 條）。

---

## §6 剩余工时估算

| # | 事项 | 预估 | 说明 |
|---|---|---|---|
| 1 | 編成页「不偏紫且 ≥3631」：给 40 格加 `doubleEdge` 雙描邊（不是繼續加色格） | **1.5h** | 見 §5-2，風險低 |
| 2 | 微信真机帧率验证（Graphics 顶点暴涨的代价）+ 必要时把 `gridShade` 的 cols×rows 按面板面积自适应 | **1.5h** | 需要真机/开发者工具跑 4 页 60s 采样 |
| 3 | 追 `uniq` 到 web 水平：把面板底色從 `Graphics` 換成一張 64×64 逐像素漸層貼圖（九宫拉伸）+ `Sprite.color` 調色 | **6–8h** | 這是唯一能真正「逐像素漸層」的路；會動 `UiSkin.ts` 的取圖邏輯 |
| 4 | 版式遗留（157 已記）：物品第 8 頁 `pageTops[7]=4412` 被 `maxScroll=3824` 夾住；編成右側大空區；**內政頁頭留白** | **2h** | 屬矩形調整，需 lead 裁決「是否允許動版式」 |
| | **合計** | **11–13h** | 不含真机联调等待时间；本輪已消掉「改斷言腳本 0.5h」「做對照頁 1h」兩項 |

---

### 附：本轮改动的文件清单（全部在 `game/cocos/assets/scripts/`）

`Draw.ts`（204→365 行：`WARM`/`shiftHex`/`COL_SHIFT`/`mixT`/`wash`/`lightGrid`/`gridShade`/`doubleEdge`，
`vBands`/`hBands` 語義升級）、`TextRole.ts`（+`tip`/`badge` 兩級）、
`CampaignRoot.ts`（頁頭/控制台/戰報/月令按鈕 + 地圖面紗 + 雙描邊）、
`CityPanel.ts`（紀錄卡 + 朝堂帶 + 命令牌內疊光 + 雙描邊）、
`ItemsPanel.ts`（列表框/詳情卡 + 雙描邊 + 慣性/回彈/橡皮筋 + 四槽總加成帶 + 行內文案去重）、
**`DeployRoot.ts`**（lead 解禁後：`areaGrid`/`cellGrid` 兩支繪製 helper + 六卡/40 格/底栏/窄条/弹窗的色域，
未動出陣隊列邏輯與文案契約）。
未改：`Skin*.ts`、`UiSkin.ts`、`CityListPanel.ts`、`GeneralBookPanel.ts`、`ForcesPanel.ts`、
`SaveSlots.ts`、`EndingPanel.ts`。
腳本側另改一處（lead 特批）：`F:\sanguo\work\cocos_skinapply\skin_nodes_assert.mjs` 的
`checkTextRole()` 返回值 → `Object.keys(roles).length`（斷言值未放寬）。
'''

io.open(P, 'w', encoding='utf-8', newline='\n').write(s)
print('wrote', len(s), 'chars')
