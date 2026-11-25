import sys,json
sys.path.insert(0,r"F:\sanguo\work\army_step")
import rq
ins=json.load(open(r"F:\sanguo\work\re_speed\insn.json"))
# 找 0x43A2A1 所在函数的起点：向上找最近的 push ebp / mov ebp,esp
addr=0x43A2A1
lst=[r for r in ins if 0x43A100<=r[0]<=addr]
start=None
for r in reversed(lst):
    if r[2]=="push" and r[3]=="ebp": start=r[0]; break
print("func start (push ebp) =", hex(start) if start else None)
# 找 call 该函数的点
for r in ins:
    if r[2]=="call" and r[6] and start and start in r[6]:
        print("caller", hex(r[0]))
