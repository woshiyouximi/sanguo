import sys
sys.stdout.reconfigure(encoding="utf-8")
p=r"F:\sanguo\work\validate_report.txt"
L=open(p,encoding="utf-8").read().rstrip("\n").split("\n")
print("lines:",len(L))
print("first:",L[0])
print("last :",L[-1])
print("FAIL count:",sum(1 for l in L if l.startswith("FAIL")))
print("WARN:",[l for l in L if l.startswith("WARN")][:3])
