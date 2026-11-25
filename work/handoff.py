import pathlib
p = pathlib.Path(r'F:\sanguo\project\44_交接简报.md')
p.write_text("""# 44 · 交接简报（新会话从这里开始）

> 用途：上下文压缩/换会话后，用这一页在 5 分钟内恢复工作状态。
> 最后更新：2026-11-25 01:40（第 80 轮）

## 0. 一句话状态

《三国群英传2》竖版重制：**web 版可完整闭环游玩**（选君主 → 大地图 → 内政/行军/守城 → 编成 → 100 人实时兵战（脚本 VM 逐帧驱动技能）→ 结算（招降/斩首/掉落/升级/疲劳/士气）→ 回大地图）；
**Cocos 版三屏可跑**、微信 upload 包 **主包 1.81 MB / 分包 9.14 MB**（可上传）；
**与原作对齐度**：逻辑 80 项里 ✅32 / 🟡28 / ❌13 / ⚠️5 / 在修 2；美术加权观感 **19.1%**；音频技能音映射 91.8%、BGM 10/17（7 首原作死曲目不装）。

## 1. 先读这三份（别的都可以晚点）

| 文档 | 为什么读 |
|---|---|
| `project\\31_还原清单.md` | **验收基线**：13 项取巧的现状 + 证据路径 + 轮次对比 |
| `project\\37a_逻辑对照.md` | 80 行逐系统差距表（原作文档依据 ↔ 我们的 文件:行 ↔ 等级 ↔ 代价） |
| `project\\37b_美术对照.md` / `37c_音效与音乐对照.md` | 美术覆盖率与三类最缺、音频 99 音效逐个归类 |

## 2. 目录与跑法

- 游戏（web）：`F:\\sanguo\\game\\web\\`，起服务 `cd F:\\sanguo\\game && node web/serve.mjs 5199` → `http://127.0.0.1:5199/web/campaign.html`
- 核心逻辑（与引擎无关）：`F:\\sanguo\\game\\src\\core\\**`（battle/capture/garrison/march/roster/unlock/wises/smartscript）
- 视图层：`game\\src\\view\\battleView.ts`（Canvas2D，唯一渲染入口）
- 数据：`F:\\sanguo\\data\\*.json`（13 个）→ 构建后落到 `game\\data\\`；**改数据必须按顺序跑**：`import_legacy.py --strict → export_slots.py → export_fx.py → gen_bundle.py → 拷到 game\\data`
- 测试：`cd F:\\sanguo\\game && node --test tests/*.test.ts`（当前 **186 条全过**）
- 类型：`npm.cmd exec -- tsc --noEmit`（必须用 `npm.cmd`，PowerShell 执行策略会拦 `npm`）
- 出包：`tools\\build_wechat.ps1 -AppId wxf631d432ca7abcee -Mode upload`
- Cocos：引擎在 `F:\\sanguo\\tools\\cocos\\cc388\\CocosCreator.exe`（**先 `Remove-Item Env:\\ELECTRON_RUN_AS_NODE`**，否则它变 node 解释器）

## 3. 必须知道的坑（都会让人白干半天）

1. **改 `game/src/**` 后必须 `tsc -p tsconfig.build.json` 重新出 `dist/`**，否则浏览器跑旧逻辑。
2. `?sim=N` 必须配 `?freeze=1`；`freeze` 会跳过 `frame()`，镜头要硬切 `state.camX = camera(world)`，否则画面全空。
3. 无头截图要加 `--virtual-time-budget=3000`，否则异步资源没到就截了。
4. INI 是 **cp950（Big5）**；PAK 索引名字段 **40 字节**、头部条目数不可信。
5. 同一个键在 INI 里**可以重复**（`SKILL=` 7 行），读取必须累积成数组，不能 dict 覆盖。
6. 云上 ComfyUI **不自启**（`bash /workspace/tools/launch_comfy.sh`）、**8188 不对外**、`run_batch.py` 必须带 `COMFY_OUTPUT=/workspace/ComfyUI/output`。
7. Cocos 的 Babel loose 模式把 `[...set]` 编成 `[].concat`——**Set/迭代器不展开**，必须写 `Array.from()`。

## 4. 正在跑 / 下一步该派的活

| 优先级 | 活 | 依据 |
|---|---|---|
| 高 | R22 步/骑分列、R54 败方全员处置、`stats.blocks` 精确格挡 | 37a R22/R54、37c 第 2 条（`fix-batch2` 在跑） |
| 高 | 调色板收敛 32 色 + 1px 描边（纯后处理） | 37b 第 2 条（`palette` 在跑） |
| 高 | 把云上出的 12 张地形背景 / 6 张大殿 / 13 张 UI 接进页面 | `game\\web\\assets\\bg\\env\\`（31 文件 2.59 MB，**已入库未接线**） |
| 中 | 武将战场小人（0/3601，最大美术缺口） | 37b 第 1 条；Wan 已在云上跑通（33 帧 21 s） |
| 中 | R37/38/39 战斗流程、R52 气力技力、R68 武将技 110、R70 存档、R73/74 AI、R78 剧本势力、R79 事件脚本 | 37a 剩 13 项 ❌ |
| 低 | 7 首死曲目（不装）、单挑/外交/粮草（原作没有） | 37c、37a §三 |

## 5. 派工纪律（踩过坑总结）

- **一个文件同一时间只给一个 agent 改**；`core/**` 与 `main.js` 是最容易撞车的两个。
- 给 agent 的验收必须**自带证据**：截图路径 + 测试条数 + 打印数字；不许写"已完成"。
- 每个 agent 回来都要求它**主动交代近似**，并注明 `[新设计]` / `[推测]`。
- `list_agents` 里全是 `inactive`，环境**没有 kill 接口**；新活一律开新名字的 agent，不复用旧上下文。
""", encoding='utf-8')
print('lines', len(p.read_text(encoding='utf-8').splitlines()))
