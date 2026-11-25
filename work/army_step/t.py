import sys,struct
sys.path.insert(0,r"F:\sanguo\work\army_step")
import rq
print([n for n in dir(rq) if not n.startswith("_")][:40])
