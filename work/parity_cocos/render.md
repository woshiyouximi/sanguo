# 渲染层能力差距（8 项，以 Cocos 为验收目标）

被测口径与 `pages.md` §0 完全相同：**Cocos 产物 = 08:36:14 构建**，**Cocos 源码快照 = 09:15:01**，截图 750×1334。
统计命令都在本文件里可复现（`grep` 路径 / `imgstat.py` / `bands.py`）。

## 0. 一页汇总

| # | 能力 | web 的实现规模（实测） | Cocos 产物里的规模（实测） | 差距 | 一次能改善几页 |
|---|---|---|---|---|---|
| 1 | 九宫图元 | `border-image` 声明 **40+ 处**（city 14 / items 11 / deploy 8 / index 7） | **0 处** `Sprite.Type.SLICED`（全树只有 `sizeMode=CUSTOM` 拉伸） | ❌ 整层缺 | **4 页**（大地图/内政/物品/编成）+ 战斗 1 页 |
| 2 | 字体层级 | 21 档字号 / 133 处声明 | theme 9 档，但每页实测 4–19 档、**14px 一档占 47–69%** | 🟡 有档无层 | 10 页 |
| 3 | 阴影 / 描边 | `text-shadow` 22 + `box-shadow` 24 | `addOutline()` **2 处**，0 处阴影 | ❌ 近零 | 10 页 |
| 4 | 渐变 | `linear-gradient` 52 + `radial-gradient` 6 | Graphics 无渐变，只能**分段切 8 段**模拟 | 🟡 靠硬编码 | 5 页 |
| 5 | 遮罩 | 每页 overlay 层 + 39 处 `pointer-events` | `addVeil()` 圆角遮罩 1 个通用件 | 🟡 有件无规范 | 6 页 |
| 6 | 动画缓动 | `transition` 6 处、**`@keyframes` 0、`animation` 0** | 全树 `tween` **3 处**（全在 CampaignRoot） | ❌ 几乎无 | 10 页（但优先级最低） |
| 7 | 滚动容器 | `overflow-y` 5 + `overflow:auto` 3 + `scrollbar` 8 | `ScrollView` **0 处实际使用**；物品页用「分頁代替滾動」 | ❌ 无 | 2 页（物品/列表） |
| 8 | `pointer-events` 穿透 | 39 处声明，index 单页 **11 个** `pointer-events:none` 元素 | 全部走**全局 `input.on`**，0 处 `BlockInputEvents` | ❌ 无节点级命中测试 | 6 页（所有弹层） |

---

## 1. 九宫图元

**web 怎么做**
- 全部内联在 HTML（`game\web\` 目录里**没有任何 .css 文件**），用 CSS `border-image` + `slice`：
  - `city.html` 14 处：`:58,60,64,69,94,98,197,205,221,233,261,274,285,293`，其中 `ui_btn_wood_normal.png` 28 fill（木牌命令键）、`plate_chip` 8、`frame_panel` 12、`orn_corner` 12；
  - `items.html` 11 处：`:35,41,53,69,80,84,93,109,127,153`（`frame_panel 8/8px`、`plate_sq 12/6px`、`plate_sel 12/8px`、`bar_div 100% 11px no-repeat`）；
  - `deploy.html` 8 处：`:42,52,64,72,99,117`（`plate_btn 16/10px`、`plate_sq 12/6px`）；
  - `index.html` 7 处：`:85,86,101,108,118,126,135,143`（`battleui/port 14`、`slot 14`、`slot_off 8`、`msg 10`、`cmd_off 14`、`cmd_on 16`）。
- 图元来源：`game\web\assets\ui\orig\`（`frame_panel.png` 2,424 B / `plate_btn.png` 3,019 B / `plate_sq.png` 1,304 B / `plate_sel.png` 1,206 B / `bar_div.png` 617 B / `gem_gold.png` 642 B / `force_01..13.png`）。

**Cocos 现在怎么做**
- 08:36 产物：`grep 'SLICED|insetLeft|insetRight|insetTop|insetBottom|sizeMode|trim'` 在 `game\cocos\assets\scripts\*.ts` 只命中 `sizeMode = Sprite.SizeMode.CUSTOM` —— **0 处 SLICED、0 处 inset**。面板与按钮全是 `Graphics` 手绘：`CityPanel.ts` 只有 4 个原语 `fillRect(:674) / strokeRect(:680) / hline(:687) / vline(:696)`，**没有 roundRect、没有贴图底**。
- 源码里已经写好了完整九宫层 **【源码已有·未进包】**：`game\cocos\assets\scripts\UiSkin.ts`（545 行，09:11:01）
  - `SKINS: Record<string, NineSliceSpec>` 共 **26 条**，insets 直接取 web 的 `border-image` slice 值（`frame_panel [8,8,8,8] 241×73`、`plate_btn [16,16,16,16] 308×40`、`plate_sq [12]*4 64×68`、`plate_sel [12]*4 100×120`、`bar_div [0]*4`、`slot [14]*4`、`slot_off [8]*4`、`cmd_on [16]*4`、`cmd_off [14]*4`、`port [14]*4`、`msg [10]*4`、`sep [0]*4 tile:true`、`gem_gold` 图标、`force_01..13` 图标）；每条 `note` 都记了对应 web 的 `file:line`。
  - `makeNineSlice(parent,key,w,h)`：`sprite.sizeMode=CUSTOM` + `sprite.type=SLICED`（`tile`→TILED，`icon`→SIMPLE），运行期把 insets 写回 `SpriteFrame`；**加载失败降级 Graphics 描边，绝不抛**（`drawFallback`，`:403-414`）。
  - `makePanel` / `makeBtn`（按钮自带 1px 近黑描边 + 1px 投影，`:500-506`）。
  - 素材已经在包内：`game\cocos\assets\bundles\res\ui\` **26 张 png + 26 个 .meta**（如 `frame_panel.png` 2,424 B、`plate_btn.png` 3,019 B）。
  - **接线状态：0 处调用**。全树只有 `SkinLab.ts:33-39,177-219` 引用它；`CityPanel.ts` / `CampaignRoot.ts` / `ItemsPanel.ts` / `DeployRoot.ts` 一处都没换。

**要补什么**
1. 四个 Root 把「Graphics 面板底 + 自绘按钮」换成 `makePanel()/makeBtn()`（约 40 处：内政 9 键 + 信息卡 12 格、物品 7 tab + 底栏 3 键、编成 8 分区 + 26 个网格单元、大地图 3 命令 + 2 顶键）。
2. 城点/头像框换 `makeNineSlice`（`plate_sq` / `port`）。
3. 构建一次让 26 张图元进 `settings` 的 bundle（现在 `res/ui` 只在源码 bundle 里，08:36 产物是否含需构建后验）。
4. 验收：CDP 节点普查里出现 `Skin_*` / `Panel_*` / `Btn_*` 节点，数量 ≥ 面板数；截图色数上升（内政 21,959 → 目标 ≥ 25,000，对标 web 25,687）；`grep 'Sprite.Type.SLICED'` ≥ 3 个文件。
5. 估时 **6h**（含 4 个文件重排、九宫尺寸对位、构建后逐页复查）。

---

## 2. 字体层级

**web 怎么做**
- CSS 里 **133 处 `font-size` 声明、21 个不同值**：11px×4、12×7、13×18、14×19、15×20、16×8、17×15、18×7、19×8、20×5、21×1、22×2、23×3、24×2、25×3、26×4、27×2、28×2、30×1、32×1、34×1。
- 每页实际用到的档数（DOM 普查）：`index` 4 档、`campaign` 6 档、`city` 9 档、`deploy` 9 档、`items` 11 档。
- 层级靠「**同屏 4–11 档 + 颜色/字重配合**」，标题 30–34、分区标题 22–26、正文 15–19、注释 11–13。

**Cocos 现在怎么做**
- `fontSize = <数字>` 字面量 **0 处**（全部经 `makeLabel(text,rect,fontSize,color,align)` 传参：`CityPanel.ts:444`、`CampaignRoot.ts:1332-1344`、`ItemsPanel.ts:640-657`、`DeployRoot.ts:394-406`）。
- 字号来源两类：`view\theme.ts` 的 `FONT = {hero:64, title:34, h1:30, h2:24, body:20, small:16, tiny:12, num:26, float:20}`（9 档）+ 各文件本地常量（`CityPanel.ts:123-124 HUD_NAME_FONT=14 / HUD_VALUE_FONT=24`、`CampaignRoot.ts:196 CITY_LABEL_FONT=14`）。
- **实测问题不是「档数少」，而是「一档吃满」**：
  - 大地图 88 个 Label 里 **14px 占 61 个（69%）**，全屏只 7 档：`{14:61, 15:1, 16:1, 17:1, 19:1, 20:5, 32:1}`；
  - 内政 149 个 Label 里 14px 占 70 个（47%），13 档；
  - 物品 19 档但 14px 占 86/259（33%），10–12px 小字共 65 个；
  - 战斗页只有 4 档 `{14,16,18×2,22}` —— HUD 数字与说明文同尺寸。
- 【源码已有·未进包】`BattleHud.ts:77-118` 定义了 `TextRole = 'hero'|'subtitle'|'body'|'num'|'caption'` 与 `TEXT_ROLES`（hero 40/58/描边2/阴影、subtitle 22/32/描边1、body 18/26、num 20/28/描边1、caption 12/17），`applyTextRole(label, role)` 一把套用 —— 但没人 import。

**要补什么**
1. 把 `BattleHud.TEXT_ROLES` 上提到 `view\theme.ts` 变成全工程唯一字号表（页面标题 34 / 分区标题 24 / 正文 18 / 数字 26 / 注 12），删掉各文件的 14px 硬编码。
2. 大地图城名标签 14px → 12px（38 城标签同屏，14px 会互相咬）；顶部年份/势力名 → 12px 灰。
3. 验收：CDP 普查「最大单档占比 ≤ 35%」「每页档数 8–12」；截图 `bands.py` 暗带不增。
4. 估时 **4h**。

---

## 3. 阴影 / 描边

**web 怎么做**
- `text-shadow` **22 处**、`box-shadow` **24 处**（全部内联）；单页 `city.html` 有 **52 个**带阴影/描边的可见元素（DOM 普查字段 `shadow`），`deploy` 20 个、`items` 12 个、`index` 2 个、`campaign` 2 个。
- 典型用法：深底上标题 0 1px 2px 黑、金框外发光、面板 0 2px 8px rgba(0,0,0,.5)。

**Cocos 现在怎么做**
- `ArtLayer.addOutline(label,color,width)`（`:267-271`，写 `label.enableOutline/outlineWidth`）**全工程只用了 2 处**：`CityPanel.ts:286`（标题）、`CampaignRoot.ts:1025`（君主名，`new Color(6,8,12,210), 1`）。
- `box-shadow` 等价物 **0 处**（`Graphics` 只能描边，不能模糊投影）。
- 【源码已有·未进包】`UiSkin.ts:500-506` 的 `makeBtn` 给按钮字加了 1px 描边 + 1px 投影；`BattleHud.ts:124-125` 按 `TextRoleSpec.outlineWidth` 批量开描边。

**要补什么**
1. 所有 Label 出厂即带描边（`makeLabel` 里默认 `addOutline(label, #06080C, α235, 1)`），只在「小字/灰字」时降到 0 —— 一次性解决内政「灰标签叠红帷幔看不清」。
2. 面板投影用「半透明黑描边 2px + 8px 偏移实心暗带」近似（`Graphics` 无 blur）；或 `Sprite` 用一张 9 宫暗角图（可复用 `frame_panel` 的 α 层）。
3. 验收：把 `grep addOutline` 从 2 处提到 ≥ 4 个文件；截图对比度 RMS 目标：内政 28.2 → ≥ 31（对标 web 31.4）。
4. 估时 **3h**（和 #2 一起做）。

---

## 4. 渐变

**web 怎么做**
- `linear-gradient` **52 处**、`radial-gradient` **6 处**；单页 `city.html` 有 21 个渐变元素。用于：页面底色、面板底、金色按钮高光、地图边缘淡出、遮罩径向暗角。

**Cocos 现在怎么做**
- `Graphics` **没有线性渐变**（`BattleBg.ts:19` 注释自认：「—— Cocos 的 Graphics 没有线性渐变。」），只能用**分段实色近似**：
  - `BattleBg.ts:273`「顶 60px 0.30→0、底 110px 0→0.30，各切 8 段（Graphics 无渐变）」；
  - `CampaignRoot.ts:297-304` 装饰带 `#1D1710 →(0.55) #15110C → #100D09` 用 `t∈[0,1]` 取色分段；
  - `BattleRoot.ts:519` 战场地面「自上而下的暖灰渐变」也是分段。
- 没有通用件 → 每处各写一遍。

**要补什么**
1. `ArtLayer` 加一个通用件：`addVGradient(parent, rect, from, to, steps = 12)` / `addRadialVeil(parent, rect, center, r0, r1, color)`，内部按 12–16 段 `fillRect` 叠（实测 8 段已看不出台阶，12 段安全）。
2. 用它替换内政页朝堂图下沿的硬接缝（`CityPanel.ts` 的 `artSeam` Graphics，`:223`）与大地图上下边缘淡出（`CampaignRoot.ts:233` 注释「地圖上下邊緣做出漸變淡出，避免 813×610 的矩形和氛圍底圖之間一道硬邊」）。
3. 验收：截图 `bands.py` 里「暗带边缘突变行数」下降；内政 y=470 接缝处 3 行内亮度差 < 8。
4. 估时 **3h**。

---

## 5. 遮罩

**web 怎么做**
- 每个浮层都有 overlay（`rgba(6,8,12,.78)` 级）+ 独立的 `#xxxSheet` 容器；`pointer-events` 39 处用来控制「遮罩吃点击、内容不吃」。
- 面板底是 `rgba(16,20,26,.72)` 半透明叠在美术图上（`items.html:32`、`UiSkin.ts:67-69` 也抄了这个值 `PANEL_FILL='#10141A' / α184`）。

**Cocos 现在怎么做**
- `ArtLayer.addVeil(parent,name,rect,color,radius=0)`（`:165-177`）能画圆角遮罩，但**没有一个统一的「弹层 = 遮罩 + 面板 + 焦点锁定」封装**；各面板自己 `fillRect` 整屏。
- 面板底用的是 `COLORS.panelAlpha = rgba(20,24,31,0.94)`（**冷灰蓝、不透明度 0.94**），而 web 是 `rgba(16,20,26,.72)` 叠暖色美术 → 这是内政页「信息压在朝堂图上、对比度差」的**根因候选**：0.94 几乎不透，底下朝堂图被抹成一块冷灰。

**要补什么**
1. 统一 `openSheet(scene, {dim: 0.72, panel: 'frame_panel', focus: true})`：遮罩 + 面板 + 焦点（配合 #8）。
2. 面板底改 `PANEL_FILL #10141A + α184`（与 web 完全同值，`UiSkin.ts` 已经定义好常量）。
3. 验收：内政页截图「信息区平均亮度」不高于 web 同区 +10%；RMS 对比度 ≥ 30。
4. 估时 **2h**。

---

## 6. 动画缓动

**web 怎么做**
- **几乎没有 CSS 动画**：`@keyframes` **0 处**、`animation` **0 处**、`cubic-bezier` **0 处**，只有 `transition` **6 处**（都是面板/tab 的 120–200ms 透明度与位移）。真正的动效全在 canvas（`game\src\view\animSelect.ts`、`battleView.ts`）。
- 也就是说：**web 本体的「动画」不是验收重点**，它只有 6 处过渡。

**Cocos 现在怎么做**
- 全树 `tween` **3 处**，全在 `CampaignRoot.ts`（浮动数字/提示）。
- 面板开合是**瞬显/瞬隐**（`panel.node.active = true/false`），没有过渡；用户实际感知是「点一下就换页，硬切」。

**要补什么**
1. 低优先级，但便宜：面板开合加 140ms `easeOut` + `UIOpacity` 0→255，关闭 100ms；按钮按下 scale 0.97/60ms。
2. 不要做列表逐项入场（Cocos 每帧 Label 重排会掉帧，实测战斗页 118 节点已 30Hz 稳定，不值得冒险）。
3. 验收：CDP 里 `tween` 调用次数 ≥ 8；截图无变化（动效不进静态截图）。
4. 估时 **2h**。

---

## 7. 滚动容器

**web 怎么做**
- `overflow-y` **5 处**、`overflow:auto` **3 处**、`scrollbar` 样式 **8 处**。
- 实测三个真滚动容器：`#itemlist` `scrollHeight 5,826 / clientHeight 761`（物品列表，一屏约 11 行，**无分页**）、`#detail` `827/806`、`#list` `5,826/761`（大地图列表视图，60 城）。
- 滚动条被重新配色（`scrollbar` 8 处），与暗色 UI 一体。

**Cocos 现在怎么做**
- `ScrollView` **0 处实际使用**。`ItemsPanel.ts:13` 注释写明了原因：
  > `1. **分頁代替滾動**：Cocos 這套工程沒有 ScrollView 型別（`types/cc.d.ts` 沒宣告，且場景是…）`
- 所以物品页是 `◀上頁 第 1/8 頁 下頁▶`（`pages=8`，`ItemsPanel.ts` 分页逻辑）；大地图列表视图根本不存在，所以也没有滚动需求。

**要补什么**
1. **先做一个决策**（lead 定）：
   - A. 补 `types/cc.d.ts` 的 `ScrollView` 声明 + `Mask` + 内容容器，做真滚动（物品 77 件 / 未来列表 60 城都要用）→ 估 4h，风险：`Mask` 在 3.8.8 web 端有已知 stencil 性能问题，60 城行同屏可能掉帧；
   - B. 承认分页，把分页控件做像样（统一 `◀ 第 N/M 頁 ▶`，行高固定 96），并给列表视图也用分页 → 估 2h，风险：与原作观感不符。
   - **建议 B**：web 侧列表本来就靠滚动，但 Cocos 上分页已经能跑通（物品页 143 断言 0 失败），改滚动是纯风险。
2. 验收：物品页翻页后 header 与列表首行一致；列表视图 60 城分页每页 10 行无重影。
3. 估时 **2h（B）/ 4h（A）**。

---

## 8. `pointer-events` 穿透

**web 怎么做**
- `pointer-events` 声明 **39 处**。典型：战斗页 HUD 是一层 `position:absolute` 的叠层，**11 个元素标 `pointer-events:none`**（DOM 普查 `index` 页 `pointerNone: 11`），这样 HUD 文字不会吃掉 canvas 的点击/拖拽；`campaign` 页 2 个（地图上的标签层）。
- 另一方向：遮罩用 `pointer-events:auto` 吃掉点击，弹层内容用 auto，背景用 none —— 一套三层规则。

**Cocos 现在怎么做**
- **没有节点级命中测试**，全部走全局输入：
  - `BattleRoot.ts:131` `input.on(Input.EventType.TOUCH_END, this.onTouch, this)`
  - `BootRoot.ts:47` 同款
  - `DeployRoot.ts:350-351` `TOUCH_START` + `TOUCH_MOVE`（滑条拖动）
- `BlockInputEvents` **0 处**、`swallowTouches` **0 处**（全树 grep）。
- 后果：**弹层打开时底层按钮仍可能收到同一个点击**（同一帧内两层都响应）；战斗页「点一下」是全局的，未来加了技能槽必须改成节点事件，否则点技能格会同时触发「结束回大地图」。

**要补什么**
1. 所有按钮改 `node.on(Node.EventType.TOUCH_END, …)`（引擎按 UITransform 命中，天然不穿透）；`input.on` 只保留给「全屏点击推进」这一种。
2. 弹层打开时在遮罩节点挂 `BlockInputEvents` 罩全屏，关掉时移除。
3. 验收：CDP 里点数叠层与底层各一次，console 只打一条 handler 日志；战斗页加技能槽后点技能格不触发 `onTouch`。
4. 估时 **4h**（涉及 4 个 Root 的事件迁移）。

---

## 9. 一句话结论

- **能一次改善多页的只有 #1 九宫**（4 页 + 战斗 HUD），而且**代码已经写好**（`UiSkin.ts` 545 行 + 26 张图元进包），剩下的是**接线 + 构建**，是全场性价比最高的一张工单。
- #2 字体 + #3 描边 应该合并成一张「文字层」工单（7h），否则每页各改一遍会重复劳动。
- #7 滚动、#8 穿透 是**结构性决定**（分页 vs 滚动、全局 vs 节点事件），要在开工前定，不是纯工时问题。
- 战斗页的 HUD/结算（#1+#2+#3 的合成品）已经有 `BattleHud.ts` 写好了，**它一个人就吃掉 3 项能力**，是第二高性价比工单。
