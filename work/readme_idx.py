import pathlib
p = pathlib.Path(r'F:\sanguo\project\README.md')
t = p.read_text(encoding='utf-8')
old = "| 写客户端 / 接引擎 | [`11_客户端工程与视图层.md`](11_客户端工程与视图层.md) ｜ [`../game/`](../game/) |"
new = ("| 写客户端 / 接引擎 | [`11_客户端工程与视图层.md`](11_客户端工程与视图层.md) ｜ [`../game/`](../game/) |\n"
       "| 想直接玩现在**能跑的三屏闭环** | `node game\\web\\serve.mjs 5177` 后开 `http://127.0.0.1:5177/web/campaign.html`（大地图 → 出征编成 → 战斗 → 结算回写） |\n"
       "| 改数据前后要自检 | `python tools\\validate_all.py`（**37 PASS / 0 FAIL**，3 条 WARN 是立绘覆盖率） |")
assert old in t
t = t.replace(old, new, 1)
p.write_text(t, encoding='utf-8')
print('readme index updated')
