import sys
sys.stdout.reconfigure(encoding="utf-8")
p=r"F:\sanguo\docs\03b-物件表THINGS.md"
L=open(p,encoding="utf-8").read().split("\n")
for i,l in enumerate(L):
    if l.startswith("### 4.1") or l.startswith("## 6."):
        print("==== line",i+1)
        print("\n".join(L[i:i+8]))
print("--- tail of table 6:")
print("\n".join(L[-16:-8]))
