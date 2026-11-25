import io
p = r"F:\sanguo\project\44_交接简报.md"
txt = io.open(p, encoding="utf-8").read()
print(txt.count("\n") + 1, len(txt))
print(txt[:400])
