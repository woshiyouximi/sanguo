import pathlib
p = pathlib.Path(r'F:\sanguo\project\11_客户端工程与视图层.md')
t = p.read_text(encoding='utf-8').rstrip() + """

## 15. 大地图最小闭环（`game/web/campaign.html`）

选城 → 打一场 → 写回战果，把"战斗"接成"战役"。没有这一步，战斗只是个沙盒。

- **数据**：`game/data/scenarios.json[0].cities`（剧本 1 的 60 城），取前 24 座做竖屏列表；
  每行显示城名 / 归属（我方/无主/某君主）、`min(pop/2500+110, 600)` 估算兵力、防御、人口、金钱。
- **初始状态**：首次进入自动给前 3 座城（避免"空手"），存 `localStorage['sanguo_campaign_v1']
  = { owned:[…], wins, losses, last, ts }`。
- **出征**：`location.href = './index.html?city=<城名>&from=campaign&soldiers=100&bsoldiers=<…>&bstr=<…>&bint=<…>'`；
  守将属性暂按防御值代理（`str = min(100, 50+def/8)`），因为导出的 `cities` 里没有守将字段。
- **写回**：`main.js` 的 `endBattle()` 读到 `?city=` 时按胜负更新 `owned/wins/losses`，
  并在消息栏提示"戰果已寫回大地圖（n 城）"。
- **已验证**：`?city=南皮&bsoldiers=90` 时 HUD 显示"敵方 71/90"，说明参数贯通；
  大地图 24 行、我方绿色高亮、`出征` 在未选城时禁用。
- **未做**：真实寻路/月份推进/城池内政/AI 出兵——这些仍只在 `01` 的原型与 `docs/04c` 的反汇编结论里。

## 16. 立绘接入（G1 → 真图）

- `proto/ui/assets/hero/<繁體姓名>.png`：把 `project/art_ref/cloud_v0/heroes40/hero_<簡体>.png`
  按 **武+智排名** 对齐后改名（39/40，缺甘寧）；`g1.js` 里加 `<img class="real" onerror="this.remove()">`，
  有图就盖住占位符，没有就自动退回"姓字+剪影"。
- CSS：`.portrait img.real{object-fit:cover;object-position:50% 12%}`，
  并用 `img.real ~ .ch{display:none}` 把占位大字藏掉。
- 这条路径对 400 将通用——只要 `art_ref` 里有对应文件、名字是繁体，落地即可见。
"""
p.write_text(t, encoding='utf-8')
print('doc 11 updated')
