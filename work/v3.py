import json,sys,os,glob,re
sys.stdout.reconfigure(encoding="utf-8")
# 1) raw INI counts
for i in (1,2):
    p=rf"F:\sanguo\extract\pak\TIMES{i}.INI"
    t=open(p,encoding="cp950").read()
    s=len(re.findall(r"(?im)^\s*SKILL\s*=",t))
    w=len(re.findall(r"(?im)^\s*WISESKILL\s*=",t))
    print(f"TIMES{i}: SKILL={s} WISESKILL={w}")
D=r"F:\sanguo\data"
G=json.load(open(os.path.join(D,"generals.json"),encoding="utf-8"))
print("data SKILL=",sum(len(g["SKILL"]) for g in G),"WISE=",sum(len(g["WISESKILL"]) for g in G))
names={g["NAME"] for g in G}
for d in [r"F:\sanguo\proto\ui\assets\hero", r"F:\sanguo\game\web\assets\hero"]:
    fs=[os.path.splitext(os.path.basename(x))[0] for x in glob.glob(os.path.join(d,"*.png"))]
    miss=[f for f in fs if f not in names]
    print(os.path.basename(os.path.dirname(os.path.dirname(d)))+"/"+os.path.basename(d),
          "n=",len(fs),"missing=",len(miss), miss[:12])
print("sample generals names:", [g["NAME"] for g in G[1:8]])
