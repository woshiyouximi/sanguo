import json,sys
sys.stdout.reconfigure(encoding="utf-8")
t=json.load(open(r"F:\sanguo\extract\json\things.json",encoding="utf-8"))
obs=t["objects"]
for o in obs:
    si=o["section_index"]
    if si<=4 or 30<=si<=36 or 99<=si<=106:
        print(f'idx={si:4d} no={o["no"]!s:4s} canon={o["no_canonical"]!s:5s} sec={o["section"]:9s} seq={o["sequence"]!s:6s} {o["name"]}  proc={o["process_raw"]}')
