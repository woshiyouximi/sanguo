import json,sys,os
sys.stdout.reconfigure(encoding="utf-8")
D=r"F:\sanguo\data"
L=lambda f: json.load(open(os.path.join(D,f),encoding="utf-8"))
G=L("generals.json")
def rows(v): return 1 if isinstance(v,str) else len(v)
ts=sum(rows(g["SKILL"]) for g in G); tw=sum(rows(g["WISESKILL"]) for g in G)
print("normalized totals SKILL=%d WISE=%d" % (ts,tw))
print("WISESKILL str count:", sum(1 for g in G if isinstance(g["WISESKILL"],str)))
print("SKILL str count:", sum(1 for g in G if isinstance(g["SKILL"],str)))
gy=[g for g in G if g["NAME"]=="關羽"][0]
print("關羽:", len(gy["SKILL"]), len(gy["WISESKILL"]))
# monotonic check
bad=0
for g in G:
    lv=[int(x.split(",")[0]) for x in g["SKILL"]]
    if lv!=sorted(lv): bad+=1
print("SKILL lv non-monotonic generals:", bad)
M=L("magics.json"); print("magics:",len(M),"script range",min(m["SCRIPT"] for m in M),max(m["SCRIPT"] for m in M),
      "unique",len({m["SCRIPT"] for m in M}),"fx_dir missing",sum(1 for m in M if not m.get("fx_dir")))
print("wises",len(L("wises.json")),"items",len(L("items.json")),"terrains",len(L("terrains.json")))
sc=L("scenarios.json"); print("scenarios",len(sc),"cities",[len(s["cities"]) for s in sc],"paths",[len(s["paths"]) for s in sc])
for name in ("troops","formations"):
    T=L(name+".json"); n=len(T["names"]); Mx=[r["vs"] for r in T["matrix"]]
    ok=all(Mx[i][j]+Mx[j][i]==0 for i in range(n) for j in range(n))
    diag=all(Mx[i][i]==0 for i in range(n))
    print(name,"n=",n,"rows=",len(Mx),"antisym=",ok,"diag0=",diag,
          "maxabs=",max(abs(v) for r in Mx for v in r))
F=L("formations.json")
print("slots:",len(F["slots"]),"fill lens:",[{k:len(v) for k,v in s["fill"].items()} for s in F["slots"]])
