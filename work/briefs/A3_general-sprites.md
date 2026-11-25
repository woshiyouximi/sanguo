# A3 · 武将战场小人装配（MAJOR BODY+WEAPON+HORSE）

目标：把**原作**的主将战场造型接进渲染，替掉现在的矢量小人。`project/37b` 记的「武将战场小人 0/3601」**不是缺美术**——`F:\sanguo\export\png\SHAPE\MAJOR\BODY` 里 3601 个 PNG 一个不少，缺的是"装配 + 接线"。

## 环境
- 根 `F:\sanguo`。没有 git。Python 用系统 python（`python --version` 先确认），图像用 Pillow（已装）。
- 你**不碰** `game/src/**`、`game/web/**` 的现有文件（除新建 `game/web/anim/general/**`）。产物先自证，接线由 lead 做。
- 截图/对比图统一放 `work\gen_sprites\`。

## 你拥有的文件
`work\gen_sprites\**`（新建）、`work\*.py` 里新建你自己的脚本（文件名前缀 `gs_`）、`game/web/anim/general/index.json` + 图集 png（新建）、报告 `project/48_武将小人装配.md`（新建）。
**不要改** 别人的脚本、`project/37a|31|44`、`game/src/**`、`game/web/main.js`。

## 已知（省你一半时间，别再重新挖）
- 素材：`export\png\SHAPE\MAJOR\BODY\*.png`（3601，`L0A10002.png` 形式）、`WEAPON\*.png`（2585，`A1A10002`）、`HORSE\*.png`（185，`HAA10002`）。
- 命名与对象表：`docs/05b_动画与造型目录.md` §3.1（BODY：120 对象 = 15 造型 × 4 武器位 × 2 阵营；`{L|R}{造型号}{动作码}{武器位}{4位帧号}`；Sequence `600+4×造型+(武器位−1)` 蓝军 / `800+…` 红军；动作码 `W`=wait、`D`=walk(走)、`H`=马、`A1..A8`=攻击/招式）、§3.2（WEAPON：34 对象、`{A|B|C|D}{武器序号}{动作码}{类别数字}{帧号}`）、§3.3（HORSE：8 匹）。
- 动作序列与 `#N`（帧停留 tick）在 `work\things_parsed.json`（5.5 MB，620 个 [OBJECT]，字段见 05b §2）；解析脚本 `tools\export_things.py`、`tools\parse_ini.py`。
- 三层叠放的 offx/offy 语义**官方未解**（05b 第 515 行）。已有前人的探索脚本可读（别直接改）：`work\body0_sheet.py`、`work\body_naming.py`、`work\body_naming2.py`、`work\major2.py`、`work\major3.py`、`work\majorfix.py`、`work\split_layers.py`、`work\flat_frames.py`、`work\install_actions_atlas.py`、`work\hero_small.py`、`work\ref_sheet.py`；`export\png\SHAPE\MAJOR\lr_compare.png` 是前人比对图。

## 要做的事
1. **摸清 BODY 的实际内容**：3601 张按 {阵营, 造型, 动作, 武器位} 归类，输出一张覆盖表（15 造型 × 4 武器位 × 动作 × 帧数），指出哪些格子是空的。图尺寸/透明通道也统计（有些 SHP 可能带裁边，需要拼回原坐标）。
2. **解决装配锚点**：BODY/WEAPON/HORSE 各自 offset 的语义未定。用**像素比对**定：同一对象同一动作同一帧，武器应该接在手上、马应该在身下。给出你的对齐算法（例如：先按帧号配对 → 用 alpha 掩膜互相关求最佳 dx,dy → 在 20 组样本上取众数）与**残差统计**（中位绝对误差 px、对齐成功率 %）。这是本任务最硬的一步，做不出来就如实写"没解"，不要用"看着还行"糊过去。
3. **产出图集**：`game/web/anim/general/index.json` + 若干 `sheet_NN.png`（横向排列、每帧记 w/h/ox/oy/srcX/srcY），格式对齐现有 `game/web/anim/atlas.json` 与 `units.json`（先读它们，保持一致：`frames`/`groups` 字段）。**总条数上限**：每造型至少要 Wait/Walk/Attack 三套；体积 ≤ 6 MB（必要时按阵营各留一套，说明舍弃了什么）。
4. **动画表**：把 `things_parsed.json` 里该对象的动作 → 帧序列 + `#N` tick 停留，导出成 `index.json` 里的 `actions` 段，给 view 直接用。
5. **自证 demo**：`work\gen_sprites\demo.html`（纯前端，读 `game/web/anim/general/`），一屏同时显示：蓝/红各 3 个造型的 Wait→Walk→Attack 循环、骑马一套、4 种武器位对比；页面要显示当前帧号与动作名。用 Edge headless 截图 `work\gen_sprites\demo_*.png`（模板见 `F:\sanguo\work\shots.ps1`）。
6. **映射到武将**：`game/data/generals.json`（15 字段，含造型/类型相关字段）→ BODY 造型号。找出原作"武将 → 造型"的规则（TYPE 字段？武力档？固定表？），给覆盖率和出处；定不了就 `[推测]` 并写清下一步怎么解。
7. **给 lead 的接线说明**（写进报告末尾，写成可直接照抄的片段）：`battleView.ts` 里该在哪里、用什么参数画 BODY/WEAPON/HORSE，需要 `index.json` 的哪些字段。

## 验收
- 报告含：覆盖表、锚点算法 + 残差数字、图集体积与帧数、demo 截图路径、武将→造型映射与覆盖率、接线说明。
- 所有"猜"的地方标 `[推测]`，所有"取巧/降级"的地方标 `[新设计]` 并说明代价。
- 不许改游戏源码来"让它看起来对"；对齐对了是数据对，不是代码对。
