# G · 原作 FACE 肖像 vs 现有 AI 肖像（评估 + 映射表，不改代码）

## 已知事实
- 原作肖像：`F:\sanguo\export\png\SHAPE\FACE\FACE001..FACE400.png`，**每张 100×120**，共 400 张。
- 现有 AI 肖像：`game/web/assets/hero/` 下 800 个文件（`.webp`），由 `game/web/main.js:869` 的 `img.src='assets/hero/'+encodeURIComponent(name)+'.webp'` 使用（按**武将名**取图）。
- `game/data/generals.json` 是**对象**（不是数组），键是武将名，值里有逐字字段：`SEQUENCE`、`NAME`、`FACE`（如 `"FACE\\FACE349"`）、`STR`、`INT`、`BaseHP`、`BaseMP`、`Loyal`、`Spirit`、`POS[5]`、`BaseEXP`、`CITY`、`Status`、`Weapon`、`Horse`、`Thing`、`BattleArray`、`UseBattleArray`、`Force`、`UseForce`、`LoyalKing`、`BLOOD`、`CONSTANCY`、`TYPE`、`FLAGS`、`SKILL[[等级, 技]]`、`WISESKILL[[等级, 军师技]]`、`id`、`pos_by_times[5]`、`city_by_times[5]`、`status_by_times[5]`。`id`/`SEQUENCE` 到 400。
  → **`FACE` 字段直接给出 武将 → FACE 编号 的映射**，这条务必先确认覆盖率（400/400？）。

## 任务（**只读 + 产报告，不改任何代码**）
1. 确认 `FACE` 字段覆盖率与 `assets/hero/` 的覆盖率（武将名 → webp 存在？缺哪些？列清单）。
2. 抽 20–40 个代表武将（关/张/赵/诸葛/曹/孙…… 至少覆盖头部与冷门），做**并排对比图**（左原作 100×120，右 AI webp），放 `work\face_cmp\{名字}.png`，再拼一张 `work\face_cmp\contact.png`。
3. 判断并写结论：原作 100×120 在**750 宽竖屏**上的 84×100 / 100×120 尺寸下是否够看；AI 版是否明显更好/更差/风格割裂；给出**建议方案**（全换原作 / 全留 AI / 混合：列表与战斗 HUD 用原作、详情大图用 AI）并说明代价。
4. 产 `work\face_cmp\face_map.csv`：`武将名,id,FACE编号,hero_webp存在?,建议`。
5. 报告 `F:\sanguo\project\55_原作肖像评估.md`：方法、覆盖率数字、对比图索引、建议、风险。

## 规矩
- 不写/不改任何 `game/**` 源码或资源（只往 `work\face_cmp\` 写）。
- 图像处理用 `load_workspace_dependencies` 给的 Python + Pillow。
- 报告里的每个数字都要能复现（标明命令）。
