# A2 · 原作战场背景接线（battleView）

目标：把**原作**的 12 套战场背景（地面平铺 + 三层视差条）接进竖屏战斗画面，替换现在的纯色底。
`project/40` 里的 12 张云图是"没素材时的替代品"；**原作 BG 素材其实早已抽好**（`export/png/…`），原图优先，云图降为对照。

## 环境
- 根 `F:\sanguo`。服务已跑：`http://127.0.0.1:5173/web/campaign.html`。
- 改 `game/src/**` 后：`cd F:\sanguo\game; npm.cmd exec -- tsc -p tsconfig.build.json`，再 `npm.cmd exec -- tsc --noEmit`。
- 截图模板 `F:\sanguo\work\shots.ps1`（Edge headless，`--virtual-time-budget=4000`）；战斗页必须 `?sim=N&freeze=1`。
- 没有 git。

## 你拥有的文件（其他一律不改）
`game/src/view/battleView.ts`、`game/src/view/battleBg.ts`（新建）、`game/web/assets/bg/orig/**`（新建）、`work/bg_orig*/**`、`project/47_原作战场背景.md`（新建）。
**不要改** `game/web/main.js`、`game/src/core/**`、`project/37a|31|44`、其他 agent 的文件。

## 素材（已解码，只读；拷到 `game/web/assets/bg/orig/` 时保持小写原名）
- 地面 512×512 **无缝平铺**：`export\png\tga\SHAPE_BG_FLOOR00.png` … `FLOOR11.png`
- 远 `BG{00..11}{A,B}.png` 730×96、中 `MG{00..11}{A,B}.png` 880×96、近 `FG{00..11}{A,B}.png` 1000×96（FG03 是 2000×96 船上）
- 件：`TREE01/02.png` 142×178、`STONE01.png` 171×60、`FIRE*.png`
- 地形编号含义：`game/data/terrains.json`（0/1/2 三种城、3 船上、4 草原、5 平原、6 山地、7 森林、8 雪原、9 沙漠、10 關卡、11 長城）
- 依据：`docs/02-美术资源与格式.md` §161-168、`docs/04_引擎架构与代码逻辑总览.md` §247-258、`docs/08_新游戏设计参考.md` §206/215/283
- 现成 12 张云图对照：`game/web/assets/bg/env/terrain_XX.jpg`

## 交付
1. 素材入库 `game/web/assets/bg/orig/`，总体积 ≤ 3.5 MB（PNG；地面**不许** JPEG，会毁接缝）。
2. `game/src/view/battleBg.ts`：按 `world.terrain` 选套；地面按 `camera(world)` 的 x 无缝平铺并缩放；BG/MG/FG 各按自身宽度循环、不同视差速率（近景最快）；A/B 两张的真实关系（左右半幅？两相位？两变体？）**用像素比对确认后写结论**，不许猜。
3. `battleView.ts` 的 `render()` 只在战场区 `FIELD_TOP..FIELD_BOTTOM` 内替换底色，HUD、单位、特效、命中框、站位一律不动。
4. 截图：12 个地形各一张 750×1334 → `work/bg_orig/terrain_NN.png`（`?sim=120&freeze=1&terrain=N`；`?terrain=N` 已由 lead 接进 `createWorld`，`world.terrain` 直接读）。再拼 `work/bg_orig_contact.jpg` 12 宫格。
5. 报告 `project/47_原作战场背景.md`：素材清单/体积、A/B 结论、地平线高度与视差速率的依据（无据标 `[推测]`）、12 张截图索引、与原云图版的取舍说明。

## 硬约束
- 性能：60fps / 750×1334。地面用 `CanvasPattern` 或预渲染离屏，不许每帧几百次 drawImage。给出实测（跑 300 帧耗时或等价证据）。
- 不许遮住单位、不许破坏 A 下 B 上的站位与命中框坐标。
- 不引入新依赖；`dist/` 只由 tsc 生成。
- 完成后回话里直接贴：改了哪些 file:line、12 张截图路径、性能数字、没做到的部分。
