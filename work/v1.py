import json,sys,os
sys.stdout.reconfigure(encoding="utf-8")
D=r"F:\sanguo\data"
def shape(o,d=0):
    if isinstance(o,dict):
        return "dict(%d) keys=%s" % (len(o), list(o)[:14])
    if isinstance(o,list):
        return "list(%d) first=%s" % (len(o), shape(o[0],d+1) if o else "-")
    return type(o).__name__+"="+repr(o)[:40]
for f in ["generals.json","magics.json","wises.json","items.json","terrains.json","scenarios.json","formations.json","troops.json","meta.json"]:
    p=os.path.join(D,f)
    o=json.load(open(p,encoding="utf-8"))
    print("%-16s %s" % (f, shape(o)))
    if isinstance(o,list) and o and isinstance(o[0],dict):
        print("   item keys:", list(o[0])[:40])
    if isinstance(o,dict):
        for k,v in list(o.items())[:6]:
            print("   %s -> %s" % (k, shape(v)))
