import sys
sys.stdout.reconfigure(encoding="utf-8")
p=r"F:\sanguo\project\08_数据迁移与对拍.md"
t=open(p,encoding="utf-8").read()
i=t.find("## 9.")
print("total chars:",len(t),"| §9 at",i)
print(t[i:i+200])
print("...")
print(t[-260:])
print("headings:",[l for l in t.split("\n") if l.startswith("## ")])
