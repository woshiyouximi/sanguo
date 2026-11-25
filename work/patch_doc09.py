import pathlib
p = pathlib.Path(r'F:\sanguo\project\09_战斗原型说明.md')
t = p.read_text(encoding='utf-8')
t = t.replace('# ② 跑逻辑自检（22 项）', '# ② 跑逻辑自检（34 项）')
t = t.replace('| `F:\\sanguo\\proto\\core.js` | 335 | 纯逻辑：世界创建、`step()`、投影、相机、落位、战力、命中 |',
              '| `F:\\sanguo\\proto\\core.js` | 478 | 纯逻辑：世界创建、`step()`、投影、相机、落位、战力、命中、`cast()` 武将技 |')
t = t.replace('| `F:\\sanguo\\proto\\battle.html` | 290 | 竖屏画布 + HUD + 控件 + 渲染 |',
              '| `F:\\sanguo\\proto\\battle.html` | 451 | 竖屏画布 + HUD + 技能条 + 点选 + 渲染 |')
t = t.replace('| `F:\\sanguo\\proto\\test_core.js` | 103 | 22 项断言（`node test_core.js`） |',
              '| `F:\\sanguo\\proto\\test_core.js` | 206 | 34 项断言（`node test_core.js`） |')
t = t.replace('## 7. 自检清单（22 项，`node test_core.js`）', '## 7. 自检清单（22 项规则 + 12 项武将技 = 34 项，`node test_core.js`）')
p.write_text(t, encoding='utf-8')
print('doc numbers synced')
