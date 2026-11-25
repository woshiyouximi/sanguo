import os,sys,json
sys.stdout.reconfigure(encoding="utf-8")
J=r"F:\sanguo\extract\json"
tot=0
for f in sorted(os.listdir(J)):
    p=os.path.join(J,f); b=os.path.getsize(p); tot+=b
    print("%-14s %9d B" % (f,b))
print("JSON total %.1f KB" % (tot/1024))
print()
D=r"F:\sanguo\docs"
for f in sorted(os.listdir(D)):
    if f.startswith("03"):
        p=os.path.join(D,f)
        t=open(p,encoding="utf-8").read()
        print("%-34s %8d B %5d lines  tables=%d" % (f,len(t.encode()),t.count("\n")+1,
              sum(1 for l in t.split("\n") if l.startswith("|"))))
