import sys
sys.stdout.reconfigure(encoding="utf-8")
p=r"F:\sanguo\docs\03b-物件表THINGS.md"
L=open(p,encoding="utf-8").read().split("\n")
for i,l in enumerate(L):
    if l.startswith("| 31 |") or l.startswith("| 32 |") or l.startswith("| 100 |") or l.startswith("| 101 |"):
        print(i+1, l)
