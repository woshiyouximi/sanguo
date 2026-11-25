import pathlib
p = pathlib.Path(r'F:\sanguo\project\11_客户端工程与视图层.md')
t = p.read_text(encoding='utf-8')
add = """
## 17. 出征编成（`game/web/deploy.html`）

三屏闭环：**大地图 → 出征编成 → 战斗 → 结算 → 回大地图**。这一节补的是中间那屏。

- **主将**：从 `generals.json` 里筛 `CITY ∈ 我方城池`，按 `STR+INT` 排序，横向列出前 12 名备选；
  右侧显示立绘（`game/web/assets/hero/<繁名>.png`，480px 宽、153 张共 66.6 MB）、武力/智力/節操/技能条数。
- **兵种**：13 种（`troops.json names`）；**阵形**：9 种（`formations.json names`）；**兵力**：50/80/100。
- **相剋净加值**：`bonus = 表[我][敌] − 表[敌][我]`，兵种表按 `rows[].vs[]` 取值
  （第一版写成 `matrix[a][b]` 取不到，全显示 0——已修）。敌方兵种/阵形在当前原型里固定代理为 黃巾/雁形。
- **战前情报**：敌守军、防御、我方兵力与主将、相剋净值和，并注明"原作命中 = 150 + 相剋 + 士气/疲劳修正，300 制随机"。
- **出征**：跳 `index.html?city&gen&troop&form&soldiers&bsoldiers&bstr&bint`，`main.js` 的 `readConfig()`
  读 `troop/form/btroop/bform`（新加）与 `gen`，`makeWorld()` 直接采用。

### 17.1 顺手修掉的一个真 bug（人数对不上）
`formationCells()` 只在 `fill` 里查 `"10"/"50"/"100"/"200"` 四档，查不到就**退回 100 人**，
于是 `soldiers=80` 时场上仍站 100 个兵、HUD 却写 80（表现为 `97/80` 这种不可能的比值）。
改法：查不到就取 `fill['200']` 的顺序**切片到 N**；`n` 仍按切片后长度算 `shift`，
所以 50/80/100 三种人数落位一致、只是少几排。验证：`soldiers=80` → 实测 `77/80`、`65/80`。
- 注意：`game/web` 引的是 **`dist/`**，改完 `src/` 必须 `tsc -p tsconfig.build.json` 重新出包，
  否则浏览器跑的还是旧逻辑（这轮就踩了一次）。
"""
if '## 17. 出征编成' not in t:
    t = t.rstrip() + "\n" + add
p.write_text(t, encoding='utf-8')
print('doc 17')
