import re
d = open(r"F:\sanguo\dist\wechat-upload\engine-adapter.js", encoding="utf-8").read()
for pat in [r"h=function", r"function h\(", r"var h=", r"h=\(e"]:
    for m in re.finditer(pat, d):
        print("...", d[max(0,m.start()-60):m.start()+300].replace("\n"," "))
        print("---")
