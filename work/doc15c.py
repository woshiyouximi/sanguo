import pathlib
p = pathlib.Path(r'F:\sanguo\project\11_客户端工程与视图层.md')
t = p.read_text(encoding='utf-8')
old = "- **未做**：真实寻路/月份推进/城池内政/AI 出兵——这些仍只在 `01` 的原型与 `docs/04c` 的反汇编结论里。"
new = """- **内政（v2）**：每城有 `{troops, pop, money}` 运行时状态；底部按钮按选中城切换——
  自己的城给「徵兵（金 500 → 兵 +40）」「開發（金 400 → 民 +3000）」「推進一月」，
  敌城给「出征」。`推進一月`：`month++`、`gold += Σ floor(pop/5000)*4`、
  己方 `pop/money` 各 +1%、敌方城 `troops +6`（否则越打越空）。
  顶部显示 `第 N 年 M 月`、国库、城数、战绩。
- **调试参数**：`?sel=<城名>` 预选、`?adv=<n>` 连推 n 个月，便于无头截图与自测。
- **已跑通**：`?sel=襄平&adv=2` → 显示"第 1 年 3 月 / 金 1,732 / 城 3"，
  内政按钮与城市状态一致；打赢南皮后回来城数 +1、战绩 +1 胜。
- **未做**：真实寻路/道路图行走/AI 出兵决策/武将派驻——这些仍只在 `01` 的原型与 `docs/04c` 的反汇编结论里。"""
if old in t:
    t = t.replace(old, new)
else:
    t = t + "\n" + new + "\n"
p.write_text(t, encoding='utf-8')
print('doc15 v2')
