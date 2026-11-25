# 负向自测：把 generals.json 砍成 400 条，确认闸门真的会红（不改任何数据文件）
import sys, importlib.util
sys.stdout.reconfigure(encoding="utf-8")
spec=importlib.util.spec_from_file_location("v",r"F:\sanguo\tools\validate_all.py")
m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
real=m.load
def fake(name):
    d=real(name)
    if name=="generals.json": return d[:-1]
    return d
m.load=fake
m.QUIET=True
rc=m.main()
print("negative-test rc =", rc, "(期望 2)")
lines=open(m.REPORT,encoding="utf-8").read().split("\n")
print("FAIL lines:", [l for l in lines if l.startswith("FAIL")][:3])
print("last:", lines[-2])
