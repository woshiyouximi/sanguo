import io
p = r"F:\sanguo\project\173_原作战斗行为真相.md"
s = io.open(p, encoding="utf-8").read()
old = "obj->vcall[0x4c](obj, 0x10007, eax)"
new = "obj->vcall[0x4c]`(obj, 0x10007, eax)`"
n = s.count(old)
s = s.replace(old, new)
io.open(p, "w", encoding="utf-8", newline="\n").write(s)
print("replaced", n)
