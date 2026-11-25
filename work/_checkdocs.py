import re
for p in [r"F:\sanguo\project\37a_逻辑对照.md", r"F:\sanguo\project\31_还原清单.md"]:
    b = open(p, "rb").read()
    t = b.decode("utf-8")
    bad = len(re.findall(r"[鎴銆锛鐨]|\ufffd", t))
    print(p.split("\\")[-1], "bytes", len(b), "bom", b[:3] == b"\xef\xbb\xbf", "bad", bad, "lines", t.count("\n") + 1)
