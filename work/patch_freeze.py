import pathlib
p = pathlib.Path(r'F:\sanguo\game\web\main.js')
t = p.read_text(encoding='utf-8')
t = t.replace("let raf = 0;", "let raf = 0;\nlet frozen = false;   // ?freeze=1：截图用，冻结逻辑与镜头", 1)
t = t.replace("  const freeze = params.get('freeze') === '1';", "  frozen = params.get('freeze') === '1';")
t = t.replace("  if (freeze) {          // ?freeze=1：冻结画面（截图可复现）", "  if (frozen) {          // ?freeze=1：冻结画面（截图可复现）")
p.write_text(t, encoding='utf-8')
print('frozen scope fixed')
