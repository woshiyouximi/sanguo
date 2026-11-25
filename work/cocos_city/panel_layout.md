# 內政面板（CityPanel）節點樹與尺寸

> 對應 `game/cocos/assets/scripts/CityPanel.ts`（1142 行）與 web `game/web/city.html` + `city_app.js`。
> **未在 Creator 里實機驗證**：本文所有數字都來自代碼常量與 tsc 靜態檢查，沒有在 Cocos Creator 3.8.8 的場景裡跑過一幀，
> 也沒有截圖。實機（尤其是中文字體、Label SHRINK 後的實際換行）可能有偏差，見 project/69 §5。

## 0. 坐標口徑

- 設計解析度 **750 × 1334**（`view/layout.ts` 的 `DESIGN_W/DESIGN_H`），`fitHeight`。
- 本文件所有矩形都是**設計座標、左上原點、y 向下**，與 web CSS 的 `getBoundingClientRect` 同一個方向。
- 落節點時統一走 `toLocal(sx, sy) = { x: sx - 375, y: 667 - sy }`（`view/layout.ts`），
  節點 `anchorPoint = (0.5, 0.5)`，位置取矩形**中心**：`node.x = rect.x + rect.w/2 - 375`、`node.y = 667 - (rect.y + rect.h/2)`。
- 觸控反算與 `CampaignRoot` 完全一致：`getUILocation()` → `convertToNodeSpaceAR` → `x = local.x + 375`、`y = 667 - local.y`，
  然後用同一批設計座標矩形做命中。

## 1. 節點樹（共 64 個節點）

`CampaignRoot` 在 `openCityPanel()` 裡建 1 個根節點，`CityPanel.ensureBuilt()` 在其下建 63 個子節點。

```
CampaignRoot            (Node, 750×1334, layer=UI_2D, pos=(0,0))      ← .scene 里已有，不是我建的
└── CityPanel           (Node, 750×1334, anchor=.5/.5, pos=(0,0))     ← addComponent(CityPanel)
    ├── [0]  CityPanelBg     (Node + UITransform 750×1334 + Graphics)  背景 / 面板 / 按鈕 / 分隔線
    ├── [1]  CityPanelLbl    ← 返回            R_BACK
    ├── [2]  CityPanelLbl    城名              R_TITLE
    ├── [3]  CityPanelLbl    月份              R_MONTH
    ├── [4..15]  CityPanelLbl ×12   HUD 名（人口…月令，2 列 × 6 行）
    ├── [16..27] CityPanelLbl ×12   HUD 值
    ├── [28..36] CityPanelLbl ×9    命令主標（開　發 / 徵　兵 / … / 自　治）
    ├── [37..45] CityPanelLbl ×9    命令副標（金 400 · 民防共增 / …）
    ├── [46] CityPanelLbl    紀錄標題（紀　錄）
    ├── [47] CityPanelLbl    月令態（本月令 已用／可下）
    ├── [48..53] CityPanelLbl ×6    日誌行（新的一條在最上）
    ├── [54] CityPanelLbl    底部提示
    ├── [55] CityPanelSheet  (Node + UITransform 750×1334 + Graphics)  抽屜底板
    ├── [56] CityPanelLbl    抽屜標題
    └── [57..62] CityPanelLbl ×6    抽屜行（第 6 行固定「取　消」）
```

節點數校驗：`1（根）+ 1（Bg）+ 61（Label）+ 1（Sheet）= 64`。
Label 明細：3（返回/城名/月份）+ 12 + 12 + 9 + 9 + 2（紀錄標題/月令態）+ 6（日誌）+ 1（提示）+ 1（抽屜標題）+ 6（抽屜行）= 61。

### 兄弟序為什麼要緊

`Graphics` 與 `Label` 都是 `UI_2D` 渲染，**同層按兄弟序從下往上畫**：

- `CityPanelBg` 必須是**第 0 個**子節點，否則它會在 Label 之上，把字全蓋掉。
- `CityPanelSheet` 必須是**最後一組**，才能蓋住日誌區與提示；抽屜的 6 行 Label 又必須在 `CityPanelSheet` **之後**建，
  才能浮在抽屜底板上。
- 抽屜沒開時 `gSheet.clear()` + 6 行 Label 置空，所以抽屜節點常駐但不顯示。

## 2. 矩形表（設計座標）

| 常數 | x | y | w | h | 節點位置（局部） | 對應 web |
| --- | --- | --- | --- | --- | --- | --- |
| `R_HEADER` | 0 | 0 | 750 | 118 | — | `.top` 標題帶 |
| `R_BACK` | 18 | 26 | 104 | 64 | (-305, 609) | `#back`（`← 返回`） |
| `R_TITLE` | 136 | 22 | 330 | 46 | (-74, 622) | `#cityName` |
| `R_MONTH` | 470 | 26 | 262 | 42 | (226, 620) | `#headSub`（`第1年1月`） |
| `R_HUD` | 18 | 126 | 714 | 340 | (0, 511) | `.stats` 面板 |
| HUD 名 col0/col1 | 26 / 374 | 132+56i | 112 | 48 | (-293, 511-56i) / (55, 511-56i) | `.stat .k` |
| HUD 值 col0/col1 | 134 / 482 | 132+56i | 224 | 48 | (-129, 511-56i) / (219, 511-56i) | `.stat .v` |
| `R_CMD` | 18 | 478 | 714 | 312 | (0, 141) | `.grid` |
| 命令鈕 (c,r) | 18+242c | 478+108r | 230 | 96 | (-242+242c, 141-108r) | `button.cmd` |
| 命令主標 | 同鈕 x | 鈕 y+8 | 230 | 46 | 鈕中心上移 28 | `button.cmd .tag` |
| 命令副標 | 鈕 x+4 | 鈕 y+54 | 222 | 30 | 鈕中心下移 21 | `button.cmd .sub` |
| `R_LOG` | 18 | 798 | 714 | 416 | (0, -339) | `.log` |
| `R_LOG_TITLE` | 34 | 802 | 220 | 34 | (-224, -152) | `.log h3` |
| `R_LOG_STATE` | 512 | 804 | 206 | 30 | (240, -152) | `.log .state` |
| 日誌行 i | 32 | 842+60i | 686 | 52 | (0, -201-60i) | `.log .row` |
| `R_HINT` | 18 | 1222 | 714 | 56 | (0, -583) | `#cmdHint` |
| `R_SHEET` | 18 | 772 | 714 | 442 | (0, -326) | 抽屜 `.drawer` |
| `R_SHEET_TITLE` | 42 | 778 | 400 | 36 | (-166, -129) | 抽屜標題 |
| 抽屜行 i | 40 | 824+64i | 670 | 60 | (0, -187-64i) | 抽屜按鈕 |

（HUD 第 i 行 i=0..5：人口 / 金 / 兵 / 預備兵 / 防務 / 太守，col1 再 6 項：軍師 / 內政效率 / 武將 / 疲勞 / 士氣 / 月令。）

## 3. 與 web 的對應關係

| web 元素 | Cocos 節點 | 說明 |
| --- | --- | --- |
| `#cityName` | `[2]` | 城名，空則 `（無城）` |
| `#headSub`（`劇本 · 第x年x月`） | `[3]` | **只搬了月份**，劇本名沒有（`systemName()` 依賴 `scenario.system`，Cocos 的 `CampaignScenario` 沒這個欄位） |
| `#back` | `[1]` | 命中 `R_BACK` → `close()` → `CampaignRoot` 刷大地圖 |
| `.stats` 12 項 | `[4..27]` | 名/值成對；值顏色按狀態（預備兵滿=gold、疲勞≥60=danger、士氣<30=textFaint、月令可下=ok） |
| `.grid` 9 鈕 | `[28..45]` + `cmdRects` | 3×3，`CMD_ORDER`(8) + `CMD_EXTRA`(自治) |
| `.log` 6 行 | `[46..53]` | `M.recentLog(save, 6)`，行內把 `t · cmd · text` 串成一行 |
| `#cmdHint` | `[54]` | 月令鎖住時 `本月已行動 · 回大地圖推進一月` |
| 抽屜（徵兵/移動/任命/物品/情報/出征/自治） | `[55..62]` | 統一 6 行：5 行內容 + 1 行「取　消」 |
| `?unlimited=1` 調試 | — | **沒搬**（面板固定 `monthLocked(save, false)`） |

## 4. 繪製（純 Graphics，零圖片）

面板**不用任何 bundle 圖**，全部由 `CityPanelBg` / `CityPanelSheet` 兩個 `Graphics` 畫：

1. 全屏底 `#0B0E13` alpha 253（內政頁是整頁，必須蓋掉大地圖）
2. 標題帶 `COLORS.panelHi` + 底部 2px 金線
3. 返回鍵：`COLORS.panel` 底 + `COLORS.gold` 描邊
4. HUD 面板 `COLORS.panel` + 5 條行線
5. 9 個命令鈕：一般 `COLORS.panel` / 自治 `COLORS.panelHi`+金邊 / 月令鎖住全部 `COLORS.bgDeep`+`COLORS.line`
6. 日誌區 `COLORS.bgDeep` + 標題下 70 alpha 金線 + 5 條行線
7. 提示條 `COLORS.panel` 半透明
8. 抽屜：`COLORS.bgDeep` alpha 250 + 金邊 + 標題分隔線 + 6 個行框（最後一行「取消」用 `COLORS.panel`）

> 背景圖：`bundles/res/bg/policy/` 的 PALAIS01..05 + PALAIS_YIELD 本來最適合當內政頁朝堂底圖，
> 但這 6 個檔（2.12 MB）已被 lead 移到 `game/cocos-park/res/` 讓包體進 20 MB 預算，
> 所以面板走純 Graphics。要恢復成朝堂圖的話，路徑寫成 `bundles/res/bg/policy/palais_03`（需 lead 先搬回）。

## 5. 觸控命中順序（`CityPanel.onTouch`）

1. 面板沒開（`!opened`）→ 直接返回（`CampaignRoot.onTouch` 另有 `isOpen()` 攔截，雙保險防穿透）
2. 抽屜開著 → 只掃 `sheetRects`（6 行），**不掃**命令鈕，也不掃返回；掃不到就吞掉這次點擊
3. `R_BACK` → `close()`
4. `cmdRects[0..8]` → `runCommand(i)`
5. 其餘點擊吞掉（面板是全屏的，不該漏到大地圖）

`input.on(Input.EventType.TOUCH_END, this.onTouch, this)` 在 `open()` 時註冊、`hide()` 時註銷，
`onDestroy` 兜底再註銷一次（不依賴 `onEnable/onDisable`，因為節點 `active` 的切換時機不確定）。
