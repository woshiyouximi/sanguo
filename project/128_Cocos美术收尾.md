# 128 Cocos 美术收尾（`ArtLayer.addVeil()` 双倍偏移根治 · `bg/env` 台账 · 静态守卫）

> 执行者：子 agent `d5-artveil`（cwd `F:\sanguo`，仓库无 git）
> 修复依据：r88 报告 `project/118_Cocos版式对齐.md` §5
> 证据脚本：`work/cocos_artveil/veil_math.mjs`（105 条对拍断言）、`work/cocos_artveil/art_guard.mjs`（788 条静态断言 / 63 文件）
> 结论：**bug 已在源头根治**；`bg/env` 已确认零引用、31 档 2,716,537 B 归档在 `game/cocos-park/res/bg/env`；`tsc -p tsconfig.check.json` **EXIT=0**。

---

## 0 速览

| 项 | 结果 |
|---|---|
| 根因 | `addVeil()` 先把节点摆到矩形中心（第一次换算），又用「节点在父原点」的写法画 Graphics 矩形（第二次换算） |
| 修前闭合式 | 实际画出 `x' = 2x + w/2 − 375`，`y' = 2y + h/2 − 667` |
| 修后 | 只做一次换算：`node = (x + w/2 − 375, 667 − (y + h/2))`，局部矩形 `= {−w/2, −h/2, w, h}` ⇒ 设计矩形原样落地 |
| 代码 diff | `ArtLayer.ts:164-192`（新增 `veilLocalRect()` 177-179，重写 `addVeil()` 182-192）＋ `CampaignRoot.ts:1438-1453`（只改 `veilRectOnMap()`，函数体 1446-1453） |
| 影响面 | 6 个 `addVeil` 调用点：4 个整屏（零变化）、地图蒙版（改为精确对齐）、编成蒙版（修好，旧版被上移 7px） |
| 验证 | `veil_math.mjs` 105/105；`art_guard.mjs` 788/788；`tsc` 全量 09:37:47 EXIT=0（期间曾被并行 agent 新文件 `GeneralBookPanel.ts(1001,82)` TS5076 打断一次，对方修好后转绿），隔离 tsc 恒绿 |
| 没做到 | 无真机构建/截图；地图蒙版旧 ±2px 外扩已取消；`game\tests\city_rules.test.ts:405` 过期断言（禁改文件）仍会红 |

---

## 1 bug：一次换算被做了两次

### 1.1 坐标约定

设计分辨率 **750×1334**，设计坐标**左上原点**、Y 向下；Cocos 节点锚点 `(0.5, 0.5)`、局部坐标**以节点中心为原点、Y 向上**。

一次正确的换算（`ArtLayer.ts:52-58 placeNode()` 与 `UiSkin.ts:543-545 placeDesign()` 都是这个口径）：

```
node.setPosition(x + w/2 − 375, 667 − (y + h/2))
```

节点已经把矩形中心摆到父坐标的目标点上，因此 **Graphics 在节点局部坐标里要画的矩形只有一个正确答案**：

```
rect(−w/2, −h/2, w, h)        // 以节点原点为中心，尺寸不变
```

### 1.2 修前代码（`work/cocos_artveil/backup/ArtLayer.ts.orig:165-176`）

```ts
export function addVeil(parent: Node, name: string, rect: DesignRect, color: Color, radius = 0): Graphics {
  const node = newLayerNode(parent, name);
  placeNode(node, rect);                     // ← 第一次换算：节点中心 = rect 中心
  const g = node.addComponent(Graphics);
  g.fillColor = color;
  const x = rect.x - HALF_W;                 // ← 第二次换算：这是「节点在父原点」时的写法
  const y = HALF_H - rect.y - rect.h;
  if (radius > 0) g.roundRect(x, y, rect.w, rect.h, radius);
  else g.rect(x, y, rect.w, rect.h);
  g.fill();
  return g;
}
```

把两次位移叠起来（`HALF_W=375`、`HALF_H=667`）：

```
节点中心（父坐标）  = (x + w/2 − 375, 667 − (y + h/2))
局部矩形中心        = (x − 375 + w/2, 667 − (y + h) + h/2)
─────────────────────────────────────────────────────────────
画出矩形的中心      = (2x + w − 750, 1334 − 2y − h)       ← 父坐标
换算回设计坐标      = (2x + w − 375, 2y + h − 667)       ← 加回半个屏幕
⇒ 画出的设计矩形    = { x: 2x + w/2 − 375, y: 2y + h/2 − 667, w, h }
```

### 1.3 为什么整屏蒙版一直看不出问题

旧公式的不动点是 **水平居中且垂直居中**：

```
x + w/2 = 375 且 y + h/2 = 667   ⇒   x' = x, y' = y
```

`{0, 0, 750, 1334}` 恰好满足，所以 `CampaignRoot` 的整屏蒙版、`ItemsPanel` 的整屏蒙版一直是「碰巧对」；只有地图蒙版（`y=198.75`、`h=562.5`）暴露成硬边——`CampaignRoot` 当年被迫反解 `y = 290.25` 绕开。

### 1.4 修后（`ArtLayer.ts:177-192`）

```ts
export function veilLocalRect(rect: DesignRect): { x: number; y: number; w: number; h: number } {
  return { x: -rect.w / 2, y: -rect.h / 2, w: rect.w, h: rect.h };
}

export function addVeil(parent: Node, name: string, rect: DesignRect, color: Color, radius = 0): Graphics {
  const node = newLayerNode(parent, name);
  placeNode(node, rect);                     // 唯一一次「设计 → 本地」换算：节点中心 = rect 中心
  const g = node.addComponent(Graphics);
  g.fillColor = color;
  const local = veilLocalRect(rect);         // 局部坐标下相对节点原点画，别再套一次位移
  if (radius > 0) g.roundRect(local.x, local.y, local.w, local.h, radius);
  else g.rect(local.x, local.y, local.w, local.h);
  g.fill();
  return g;
}
```

`addVeil()` 函数体内已**不再出现** `HALF_W / HALF_H / 375 / 667`（旧 bug 的唯一入口），`art_guard.mjs` 会用结构化断言把这条钉死。

### 1.5 六样本矩阵（设计坐标，`veil_math.mjs` 实测输出）

| 矩形 | 修前实际落地 | 修后落地 = 参考实现 |
|---|---|---|
| 地图矩形 `{0, 198.75, 750, 562.5}` | `x0 y11.75 w750 h562.5` | `x0 y198.75 w750 h562.5` |
| 整屏 `{0, 0, 750, 1334}` | `x0 y0 w750 h1334` | `x0 y0 w750 h1334`（不动点） |
| 左上角小块 `{0, 0, 40, 40}` | `x−355 y−647` | `x0 y0` |
| 右上角小块 `{710, 0, 40, 40}` | `x1065 y−647` | `x710 y0` |
| 左下角小块 `{0, 1294, 40, 40}` | `x−355 y1941` | `x0 y1294` |
| 右下角小块 `{710, 1294, 40, 40}` | `x1065 y1941` | `x710 y1294` |

（参考实现不共享被改代码：它把矩形四角分别过 `toLocal(px, py) = (px − 375, 667 − py)`，再相加回父坐标，是独立路径。）

---

## 2 diff（file:line）

> 行号：运行时行号来自当前工作树；「修前」行号来自备份副本 `work/cocos_artveil/backup/*.orig`（当前 `CampaignRoot.ts` 因并行 agent 改动，行号已与备份不同）。

### 2.1 `game/cocos/assets/scripts/ArtLayer.ts`

- **修前**：`ArtLayer.ts:165-176`（备份 `work/cocos_artveil/backup/ArtLayer.ts.orig:165-176`）
- **修后**：`ArtLayer.ts:164-192`
  - `ArtLayer.ts:164-176` 新增根治点文档注释（写明旧闭合式与不动点）
  - `ArtLayer.ts:177-179` 新增 `export function veilLocalRect(rect: DesignRect)`
  - `ArtLayer.ts:182-192` 重写 `addVeil()`：`placeNode(node, rect)` 后改为 `g.rect(local.x, local.y, local.w, local.h)` / `g.roundRect(...)`

净变化：**+16 行（文件 496 → 512 行）**，其中旧 5 行自算位移的画图代码被删掉、换成 `veilLocalRect(rect)` + 2 行画 `local.*`，其余是 13 行根治注释与 3 行新函数。`placeNode()`、`ArtBg`、`ArtSprite`、`loadFrame()`、atlas 系列**一行未改**。

### 2.2 `game/cocos/assets/scripts/CampaignRoot.ts`（只允许改 `veilRectOnMap()`）

**修前**（备份 `work/cocos_artveil/backup/CampaignRoot.ts.orig:1302-1329`）：

```ts
  /**
   * 蒙版矩形：**补偿 `ArtLayer.addVeil` 的座標 bug**（本檔不能改 ArtLayer.ts）。
   * …（1305-1313 推导旧公式，结论：想让它画在 target 上就传
   *   `rect.x = (target.x - 2 + 375 - w/2) / 2`、`rect.y = (target.y - 2 + 667 - h/2) / 2`）
   */
  private veilRectOnMap(target: { x: number; y: number; w: number; h: number }): {
    x: number; y: number; w: number; h: number;
  } {
    const w = target.w + 4;
    const h = target.h + 4;
    return {
      x: (target.x - 2 + HALF_W - w / 2) / 2,
      y: (target.y - 2 + HALF_H - h / 2) / 2,
      w,
      h,
    };
  }
```

**修后**（`CampaignRoot.ts:1438-1453`，函数体 `1446-1453`）：

```ts
  /**
   * 蒙版矩形：**按地图矩形直传**（r89 根治）。
   *
   * `ArtLayer.addVeil()` 的双倍偏移已在源头修掉（`ArtLayer.ts:veilLocalRect()`），
   * 这里不再需要反解；旧版为绕开那个 bug 传的是 `y = (target.y - 2 + 667 - h/2) / 2`
   * （地图 rect 时算出 290.25）。保留这个函数只为调用端不必改：日后要给蒙版加内缩/外扩，
   * 也只改下面这一行。
   */
  private veilRectOnMap(target: { x: number; y: number; w: number; h: number }): {
    x: number; y: number; w: number; h: number;
  } {
    return { x: target.x, y: target.y, w: target.w, h: target.h };
  }
```

实际改动 = **函数体 11 行 → 1 行**（+ doc 注释重写），`CampaignRoot.ts:1255` 的调用点 `addVeil(this.node, 'CampaignVeil', this.veilRectOnMap(rect), …)` 未动；本文件其他任何行未动。

### 2.3 数值核对（反解常量 → 直传）

| | 传入 `veilRectOnMap` | 它返回的 rect | 修前 `addVeil` 实际画出 | 修后实际画出 |
|---|---|---|---|---|
| 地图蒙版 | `{0, 198.75, 750, 562.5}` | `{−2, 290.25, 754, 566.5}` | `{−2, 196.75, 754, 566.5}` | `{0, 198.75, 750, 562.5}` |

`290.25` 就是旧 workaround 的常量：`(198.75 − 2 + 667 − 566.5/2) / 2 = 290.25`；代回旧公式正好得到 `196.75 = 198.75 − 2`。这也解释了 118 §5 里「反解 y=290.25」的出处。

---

## 3 共用层影响面（语义不变核查）

`addVeil()` 全仓 6 个调用点（`grep 'addVeil('`，排除定义）。其中 `CityListPanel`、`ItemsPanel`、`EndingPanel` 是并行 agent 期间新出现/行号漂移的面板，传入的都是**整屏**矩形——整屏恰好是旧公式的不动点，所以修不修都一样：

| 调用点 | 传入 rect（设计坐标） | 修前落地 | 修后落地 | 结论 |
|---|---|---|---|---|
| `CampaignRoot.ts:1255` 地图蒙版 | `veilRectOnMap(mapImageRect())` | `{−2, 196.75, 754, 566.5}` | `{0, 198.75, 750, 562.5}` | 位置精确对齐地图；**取消旧 ±2px 外扩**（唯一观感变化） |
| `CampaignRoot.ts:1258` 整屏蒙版 | `{0, 0, 750, 1334}` | `{0, 0, 750, 1334}` | 同左 | 零变化（旧公式不动点） |
| `ItemsPanel.ts:512` 背包蒙版 | `LAYOUT.screen = {0, 0, 750, 1334}`（`ItemsPanel.ts:120`） | `{0, 0, 750, 1334}` | 同左 | 零变化 |
| `CityListPanel.ts:275` 城市列表蒙版 | `SCREEN = {0, 0, 750, 1334}`（`CityListPanel.ts:58`） | `{0, 0, 750, 1334}` | 同左 | 零变化 |
| `EndingPanel.ts:270` 结局蒙版 | `SCREEN = {0, 0, 750, 1334}`（`EndingPanel.ts:59`） | `{0, 0, 750, 1334}` | 同左 | 零变化 |
| `DeployRoot.ts:440` 编成蒙版 | `{0, 120, 750, 1080}`（`:443`） | `{0, 113, 750, 1080}` | `{0, 120, 750, 1080}` | **修好**：旧版被 bug 悄悄上移 7px，从未有人 workaround |

> 结论：6 个调用点里 5 个是「零变化 / 精确对齐」，只有 `DeployRoot` 从错的 113 变成对的 120；没有一处需要调用方改代码，也没有一处语义被打乱。

`ArtBg` / `ArtSprite` 构造器、`loadFrame()`、`placeDesign()` 的调用方（`CampaignRoot.ts:1170,1187`、`SkinLab.ts:86,183,195,199,203,207,214,218,220`）都走 `placeNode`/`placeDesign` 的**一次**换算，本次未动一分一毫；`art_guard.mjs` 逐条断言其公式与设计基准。

副产物：`DeployRoot` 那个 7px 的旧偏移被顺手修掉——这是源头修复的红利，不是单独改动。

---

## 4 `bg/env` 处置清单

### 4.1 本轮移动量：**0 档 / 0 B**

`game/cocos/assets/bundles/res/bg/env` **在本轮开始前就已不存在**（此前轮次已归档），本轮无文件可移。实际动作是**复核 + 钉台账**：

| 检查项 | 实测 |
|---|---|
| `game\cocos\assets\bundles\res\bg\env` | 不存在 ✓（bundle 的 `bg\` 只剩 `orig\`、`policy\` 两个目录 + `deploy_bg.png` 300,989 B、`hud_bar.png` 123,416 B、`map_bg.png` 599,443 B 及各自 `.meta`） |
| `game\cocos\assets` 下任何名为 `env` 的目录 | 0 个（递归查过，含孤立 `env.meta` 已无） |
| 归档位置 | `game/cocos-park/res/bg/env`（**可逆**：原样搬回即可） |
| 归档资源 | **31 档 / 2,716,537 B** = jpg 18 档 2,329,378 B + png 13 档 387,159 B |
| 归档 `.meta` | 31 个 / 30,447 B ⇒ 目录合计 **62 条目 / 2,746,984 B** |
| 与 `project/114_Cocos美术收尾.md:65` 台账 | 31 档 2,716,537 B —— **逐字节吻合** |

### 4.2 引用普查（`game\cocos\assets\scripts\**\*.ts`）

- **代码 0 处**：剥注释后全文没有 `bg/env`（`art_guard.mjs` 规则①，逐文件断言，失败会打 `file:line`）。
- **注释 2 处**，均为历史说明，**刻意保留**：`CityModel.ts:405`、`CityModel.ts:406`（解释「旧值 `assets/bg/env/hall_0N.jpg` 是 AI 生成图，从未进包」）。它们不参与加载，`art_guard.mjs` 把注释命中列为 info 打印而不是失败。
- 其它形态的残留：无 `env/`、无 `hall_0N` 路径拼接（见下）。

### 4.3 `CityModel.hallImageOf()` 复核

`CityModel.ts:411-416`（复核，未改）：

```ts
export function hallImageOf(cityDef: CityDef | null | undefined): string {
  const n = Math.max(1, Math.min(5, hallIndexOf(cityDef)));
  return `assets/bg/policy/palais_0${n}.webp`;
}
```

- 已指向 `bg/policy/palais_0N`（正确，1..5 clamp；`hallIndexOf` 会返回 6 但 POLICY 只有 PALAIS01..05）。
- `hallImageOf` 全仓 **0 调用方**；`CityPanel` 直接拼 `bg/policy/palais_0N`。
- 该函数的旧行为已被 `project/114_Cocos美术收尾.md` §7.1 记账。

### 4.4 遗留：一条过期测试（**禁改文件**，只能上报）

`game\tests\city_rules.test.ts:405`：

```ts
assert.equal(M.hallImageOf({ RATE: 3 }), 'assets/bg/env/hall_03.jpg');
```

这条断言钉的是**旧路径**，现函数返回 `assets/bg/policy/palais_03.webp` ⇒ **必红**。该文件属于禁改清单（`game\tests\**`），本 agent 未动；`game\tests\cocos_art_paths.test.ts:16-22` 反而断言 `hallImageOf` 返回值不得含 `bg/env/` —— 两条测试互相矛盾，需 lead 按 114 §7.1 的补丁一并处理。

---

## 5 静态守卫 `work/cocos_artveil/art_guard.mjs`

```
node work\cocos_artveil\art_guard.mjs
```

扫描 `game\cocos\assets\scripts\**\*.ts`，三条规则 + 一段自检，失败打印 `文件:行号` 与上下文片段，退出码 1：

| 规则 | 断言方式 | 断言数（本轮末次运行） |
|---|---|---|
| ① `bg/env` 清账 | bundle 目录不存在 / 归档 ≥31 档 ≥2,716,537 B / 每文件剥注释后无 `bg/env` / `CityModel` 指向 `bg/policy/palais_0` 且无 `hall_0` | 73 |
| ② 无双倍偏移特征 | 8 条闭合式正则 × 每文件（`2*x+w/2−375`、`−667`、`HALF_W/HALF_H` 版本及反向 `375−2*x`）；**结构性检查**：ArtLayer 中凡是调用 `placeNode()` 的函数体，不得再出现 `HALF_W/HALF_H/375/667` | 512 |
| ③ 锚点约定统一 | `placeNode()`/`placeDesign()` 的 `setPosition` 实参逐字等于 `x+w/2-HALF_W,HALF_H-(y+h/2),0`；`addVeil()` 用 `veilLocalRect(rect)` 且只画 `local.*`；`veilRectOnMap()` 直传且无 `/2`；63 个调用点（`addVeil`/`new ArtBg`/`new ArtSprite`/`placeDesign`）实参无 `HALF_W/HALF_H/375/667` 预位移；45 处设计基准声明全部 750×1334/375/667 | 186 |
| ④ 守卫自检 | 拿修前备份 `backup/ArtLayer.ts.orig` 的 `addVeil()` 回归：守卫**能识别** `rect.x − HALF_W` / `HALF_H − rect.y − rect.h`，并且②的结构性规则本可拦住它；注释剥离器等长性、检测器冒烟（不误报 `local.x`、`p.x − HALF_W`） | 17 |
| **合计** | | **788 条 / 63 文件 / 1,749,293 B ⇐ 全过（0 失败）** |

> 文件数在并行 agent 工作期间会漂（同一脚本多次重跑：57 → 58 → 61 → 62 → 63 个文件）；断言数随之线性增长，规则本身不变。这是扫描式守卫的预期行为，**以脚本当次输出为准**。

失败样例（把修前 `addVeil` 放回去就会长这样，`art_guard.mjs` 自检已对备份验证过检测器）：

```
✗ [② 无双倍偏移特征] ArtLayer.ts 的 addVeil() 调用 placeNode() 后不再自算 HALF_W/HALF_H（无第二次位移）
    @ game\cocos\assets\scripts\ArtLayer.ts:186
    体内出现 HALF_W
```

---

## 6 对拍脚本 `work/cocos_artveil/veil_math.mjs`

```
node work\cocos_artveil\veil_math.mjs   →  OK 断言 105 条全过（0 失败）
```

结构（脚本内所有「对拍副本」都有显式标注，且末尾用源码断言钉住「副本 = 真身」）：

1. **① 修前复现（33 条）**：6 个样本 × 4 值（x/y/w/h）与闭合式 `{2x+w/2−375, 2y+h/2−667}` 逐值相等（24 条）；每样本「是否不动点」判定（整屏必须是不动点、其余 5 个必须偏，6 条）；地图矩形 `y=11.75`、反解常量 `y=290.25`、代回后 `y=196.75`（3 条）。
2. **② 修后 vs 参考实现（48 条）**：6 样本 × 4 值，与独立参考实现（四角过 `toLocal`）**逐值严格相等**（24 条）+ 参考实现本身等于原矩形（12 条）；另 12 条证明 `node.setPosition` 修前修后一致（只删了多余位移）。
3. **③ 直传重合（14 条）**：`veilRectOnMap` 直传语义下 6 个样本蒙版与矩形**误差 0 ≤ 0.5px**（6 条 + 1 条最大偏差汇总）；整屏修前=修后（4 条）；`DeployRoot` 113 → 120（3 条）。
4. **④ 源码钉住（10 条）**：`stripComments` + 大括号配平取函数体，断言 `veilLocalRect` 返回式、`addVeil` 体内无 `HALF_W/HALF_H/375/667` 且用 `veilLocalRect(rect)`、`veilRectOnMap` 无 `/2` 且直传。

合计 **33 + 48 + 14 + 10 = 105 条**（脚本末尾逐节打印，验收要求 ≥20 条）。

---

## 7 验证命令与结果（原样）

### 7.1 全量类型检查（验收项 1）

```
cd F:\sanguo\game\cocos
node F:\sanguo\game\node_modules\typescript\bin\tsc -p tsconfig.check.json --noEmit
→ EXIT=0（无输出）
```

> 备注：并行期间曾因**他人正在改的文件**报错（`ItemsPanel.ts` 缺 `buildSkin/addPlate/applyRoles`、`ScenarioSelect.ts` 三处类型不符；随后变成 `BootRoot.ts(170,56)` 与 `ScenarioSelect`），重跑后一度 **EXIT=0**。09:37 又一次 EXIT=2，唯一报错是并行 agent 的新文件 `assets/scripts/GeneralBookPanel.ts(1001,82): error TS5076: '??' and '||' operations cannot be mixed without parentheses.`；对方修掉后 **09:37:47 复跑 EXIT=0**（无输出）。这些报错文件都不在本 agent 改动清单里，隔离检查（§7.2）全程 EXIT=0。

### 7.2 只含本次改动文件的隔离检查（证明 tsc 绿不是靠运气）

`work/cocos_artveil/tsconfig.artveil.json`：`files = [ArtLayer.ts, CampaignRoot.ts, cc.engine.d.ts]`，严格模式同 `tsconfig.check.json`：

```
node game\node_modules\typescript\bin\tsc -p work\cocos_artveil\tsconfig.artveil.json --noEmit
→ EXIT=0
```

### 7.3 断言脚本

```
node work\cocos_artveil\veil_math.mjs   → OK 断言 105 条全过（0 失败）
  ① 修前公式复现（bug）  33 条
  ② 修后公式 vs 一次换算参考实现  48 条
  ③ CampaignRoot 直传语义：蒙版与矩形重合  14 条
  ④ 源码钉住：副本 = 真身  10 条
node work\cocos_artveil\art_guard.mjs   → OK 断言 788 条全过（0 失败）；扫描 63 个文件 / 1,749,293 B
  ① bg/env 清账  73 条
  ② 无双倍偏移特征  512 条
  ③ placeDesign 系列锚点约定  186 条
  ④ 守卫自检（对修前备份做回归）  17 条
```

### 7.4 备份 / 回滚

| 文件 | 大小 | 用途 |
|---|---|---|
| `work\cocos_artveil\backup\ArtLayer.ts.orig` | 18,777 B / 496 行 | 修前 `ArtLayer.ts` 全文，回滚直接覆盖 |
| `work\cocos_artveil\backup\CampaignRoot.ts.orig` | 113,101 B / 2,727 行 | 修前 `CampaignRoot.ts` 全文；回滚只需摘取 `veilRectOnMap()` 那 28 行 |

---

## 8 没做到 / 风险 / 交接

1. **没有构建、没有真机截图。** `tools\build_wechat.ps1` 按任务书禁跑；所有结论来自 `tsc` + 纯函数对拍 + 静态断言。地图蒙版「少 2px 外扩」的**观感**未经截图确认——数值上是 `{0,198.75,750,562.5}` 精确压住地图，但若美术上需要盖住地图描边，需要目视一下。
2. **旧 ±2px 外扩被取消。** 旧 workaround 自带「四周外扩 2px」；按验收 ③（直传语义下误差 ≤0.5px）改成精确对齐后，蒙版边比旧观感小 2px。若 lead 决定保留外扩，改法是在 `veilRectOnMap()` 里返回 `{x: target.x-2, y: target.y-2, w: target.w+4, h: target.h+4}`——但那样验收 ③ 的 ≤0.5px 断言必须同步放宽到 2px，两者二选一，不要各改一半。
3. **`game\tests\city_rules.test.ts:405` 仍然过期**（钉 `assets/bg/env/hall_03.jpg`），必红；`game\tests\**` 禁改，只能上报（见 §4.4，114 §7.1 有现成补丁）。
4. **`bg/env` 注释 2 处保留**（`CityModel.ts:405-406`）。若要求 `grep 'bg/env'` 在 scripts 下严格 0 命中，可把这两行注释改写为「见 `project/114_Cocos美术收尾.md` §3」，但会丢掉「旧值叫什么」的历史线索——我倾向保留，守卫已按「剥注释后 0 命中」判定。
5. **`art_guard.mjs` 是文本级守卫，不是 AST。** 注释剥离、大括号配平、实参切分都是启发式；TS 语法极端写法（函数体内嵌模板字符串里出现 `bg/env`、返回类型里再套对象类型）可能漏检。已知不足已在脚本内注释标注。
6. **`ItemsPanel` / `DeployRoot` 未改一行**，它们的新落点是从公式推出来的（§3 表），`art_guard` 的调用点断言保证它们传的仍是设计坐标。
7. **并行改动风险**：`CampaignRoot.ts` 在本次工作期间被他人改动（行号 1119 → 1255），我的 `veilRectOnMap` 改动仍在（`CampaignRoot.ts:1438-1453`）。合并时请只 review 该函数 + `ArtLayer.ts`，不要整文件覆盖。
8. **行号会漂**：本报告所有「当前行号」是 2026-11-25 09:38 前后的工作树快照；`ArtLayer.ts` 行号稳定（我的改动之后无人再动，mtime 09:29:07），`CampaignRoot.ts` 已从 113,101 B 涨到 119,510 B（并行 agent 持续加内容），行号可能继续变化。
9. **并行 agent 曾短暂打断全量 `tsc`**：09:37 唯一报错是对方新文件 `assets/scripts/GeneralBookPanel.ts(1001,82): error TS5076: '??' and '||' operations cannot be mixed without parentheses.`，与本次改动无关；对方修掉后 09:37:47 复跑 **EXIT=0**。期间 `work/cocos_artveil/tsconfig.artveil.json`（只含 `ArtLayer.ts` + `CampaignRoot.ts` + `cc.engine.d.ts`）**始终 EXIT=0**，证明我的文件类型干净。合并时若再见该报错，属于并行分支未同步，不是本次改动。

---

## 9 复现

```powershell
# 修前 bug 的数值：脚本里对「修前公式」的 33 条断言就是复现
cd F:\sanguo
node work\cocos_artveil\veil_math.mjs

# 静态守卫（规则 ① ② ③ + 对修前备份的自检回归）
node work\cocos_artveil\art_guard.mjs

# 类型检查
cd F:\sanguo\game\cocos
node F:\sanguo\game\node_modules\typescript\bin\tsc -p tsconfig.check.json --noEmit
```

**回滚**：`Copy-Item work\cocos_artveil\backup\ArtLayer.ts.orig game\cocos\assets\scripts\ArtLayer.ts -Force`，并把 `CampaignRoot.ts:1438-1453` 还原为备份 `1302-1329` 的反解版；随后 `addVeil` 的四条调用语义会回到「地图靠 290.25 反解、整屏碰巧对、编成上移 7px」的旧状态。
