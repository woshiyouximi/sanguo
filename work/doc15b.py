import pathlib
p = pathlib.Path(r'F:\sanguo\project\11_客户端工程与视图层.md')
t = p.read_text(encoding='utf-8')
old = "- **未做**：真实寻路/月份推进/城池内政/AI 出兵——这些仍只在 `01` 的原型与 `docs/04c` 的反汇编结论里。"
new = """- **闭环自测（已跑通）**：`campaign.html` 首访播种 3 城（`save.seeded`，之后不再改玩家版图）→
  出征南皮（`bsoldiers=90&bstr=60`）→ `?sim=420&end=1&freeze=1` 强制结算 → 回大地图显示
  **"1 勝 0 敗 · 據 4 城"**、襄平/北平/代縣 三城标绿。`?end=1` 是调试参数（跑完 N tick 直接结算），
  正式流程靠战斗自然结束。
- **返回**：`?from=campaign` 时结算后**点画面任意处**回大地图（竖屏少一个按钮），
  见 `onPointerDown()` 里的提前返回。
- **未做**：真实寻路/月份推进/城池内政/AI 出兵——这些仍只在 `01` 的原型与 `docs/04c` 的反汇编结论里。"""
assert old in t
p.write_text(t.replace(old, new), encoding='utf-8')
print('doc updated')
