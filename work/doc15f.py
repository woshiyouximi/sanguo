import pathlib
p = pathlib.Path(r'F:\sanguo\project\11_客户端工程与视图层.md')
t = p.read_text(encoding='utf-8')
add = """
### 15.7 道路连通与"只能打接壤城"（v5）
- 从 `scenarios.json[0].paths` 建邻接图，**只收 `Length < 30000` 的 77 条**（另外 39 条是原作哨兵，
  画线不可走），得到无向图：最小度 1、最大度 4、无孤立城。
- `distFromOwned(target)`：从"我方任一城"做 BFS，返回最少道路数。
- 出征按钮三态：`d === 1` → 可点（显示"目標 X · 主將 Y"）；`d >= 2` → 禁用并提示
  "需 N 段路，先打近的"；`d >= 99` → "與我方領土不接壤"。
- 实测：起始三城 襄平/北平/代縣 的邻接敌城是 **易京、晉陽**（可打）；
  南皮为 2 段路 → 按钮置灰并显示"需 2 段路"。
- **未做**：攻城方/守城方角色互换（现在一律我方攻）、AI 出兵、行军耗时（原作按 `Length` 计月）。
"""
if '15.7 道路连通' not in t:
    t = t.rstrip() + "\n" + add
p.write_text(t, encoding='utf-8')
print('doc adjacency')
