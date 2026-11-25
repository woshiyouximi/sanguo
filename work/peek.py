import io,sys
sys.stdout.reconfigure(encoding="utf-8")
p=r"F:\sanguo\docs\03a-武将技表MAGIC.md"
lines=open(p,encoding="utf-8").read().split("\n")
for i,l in enumerate(lines):
    if l.startswith("## 6") or l.startswith("### 6.1"):
        print("---- line",i+1)
        print("\n".join(lines[i:i+16]))
