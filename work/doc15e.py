import pathlib
p = pathlib.Path(r'F:\sanguo\project\11_客户端工程与视图层.md')
t = p.read_text(encoding='utf-8')
add = """
### 15.6 地图视图（v4，`campaign.html` 的地圖 tab）
- **数据**：`scenarios.json[0]` 的 `cities[].pos_xy`（60 城，x 88–1138 / y 84–860）与
  `paths[]`（116 条，含 `points` 折线）。
- **绘制**：canvas 按窗口自适应；把剧本坐标等比映射进画布（留 8% 边）；路径先画（金线），
  城节点后画（我方 `#5E9C85`、敌方 `#8E5A4E`、选中加 `#F3E0B4` 描边环）。
- **哨兵路径**：`Length >= 30000` 的 39 条按 `rgba(120,130,145,.16)` 画淡线——原作是
  "画了线但不可走"，视觉上要能一眼区分。
- **点选**：canvas 点击 → 换算回剧本坐标 → 40px 内取最近城；与列表共用同一个 `selected`。
- **标签**：按序号奇偶"一上一下"错开，缓解中原（宛/許昌/汝南一带）的挤压。
- **列表 tab**：60 城全进列表（不再只取前 24），与地图状态同源。
"""
if '15.6 地图视图' not in t:
    t = t.rstrip() + "\n" + add
p.write_text(t, encoding='utf-8')
print('doc map')
