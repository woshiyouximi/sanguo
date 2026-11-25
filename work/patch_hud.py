import pathlib
p = pathlib.Path(r'F:\sanguo\proto\battle.html')
t = p.read_text(encoding='utf-8')
t = t.replace("""  #hudMe .bar{flex:1;height:12px;background:#232830;border-radius:6px;overflow:hidden;position:relative}
  #hudMe .bar>i{display:block;height:100%;width:100%}
  #hudMe .bar>span{position:absolute;right:6px;top:-3px;font-size:13px;color:#cfd6e2}""",
"""  #hudMe .bar{flex:1;height:12px;background:#232830;border-radius:6px;position:relative}
  #hudMe .bar>i{display:block;height:100%;width:100%;border-radius:6px}
  #hudMe .bar>span{position:absolute;right:5px;top:-4px;font-size:13px;color:#eef2f8;
    text-shadow:0 1px 3px rgba(0,0,0,.9)}""")
assert '#hudMe .bar>i{display:block;height:100%;width:100%;border-radius:6px}' in t
p.write_text(t, encoding='utf-8')
print('hud css fixed')
