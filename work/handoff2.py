import pathlib
p = pathlib.Path(r'F:\sanguo\project\44_交接简报.md')
t = p.read_text(encoding='utf-8')
add = """

## 6. 收尾快照（2026-11-25 01:45，新会话以此为准）

- **测试 204/204 通过**、`tsc --noEmit` exit 0、`check_project_links` / `check_docs` 均 **0 broken**。
- 文档：`docs/` 25 篇（逆向）、`project/` 49 篇（立项与实施）。
- 最后两路交付：
  - `fix-batch2`：R22 步/骑分列（`Unit.kind` 只贴标签、`cavalryCapOf`、战功 步×6+骑×12、`stats.killsInf/killsCav`）、R54 败方全员逐个处置、`stats.blocks` 精确格挡 → `42_步骑与败方处置.md`。**骑兵判定为"独立兵种池"并给四条互证**。
  - `palette`：32 色量化 + 1px 外描边 A/B → `43_像素化实验.md`。成品 `work\pixel_ab\{units_00,atlas_00,actions_00}.px.png`（尺寸/帧矩形与原件一致，json 不用改），PNG8 版体积 −81%~−86%。**启用只需改 `main.js` 一处路径**（本轮故意没改）。**结论**：色数已达标（每帧 24–32 色），但"像不像"只对了一半——缺的是**明暗阶数**（应加 `--posterize-luma` 把亮度分 3–4 阶），以及源头不该烘接地光斑/rim light。
- 待用户拍板的一条：`tools/build_wechat.ps1` 默认**剔除 `res/audio` 9.20 MB**（Cocos 目前零引用、音频模块已被裁），不剔除则总包 20.14 MB 超微信 20 MB 硬上限。

### 新会话建议的第一个动作
1. 读 `44`（本文）→ `31_还原清单` → `37a/37b/37c`；
2. 跑一次 `cd game && node --test tests/*.test.ts` 确认 204 绿；
3. 从 `44 §4 待派活优先级` 的表头往下派，**一个文件同一时间只给一个 agent**。
"""
if '## 6. 收尾快照' not in t:
    t = t.rstrip() + add
p.write_text(t, encoding='utf-8')
print('lines', len(t.splitlines()))
