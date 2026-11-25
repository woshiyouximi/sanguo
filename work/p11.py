# -*- coding: utf-8 -*-
import os, struct
P=r"F:\sanguo\extract\pak\SHAPE"
for rel in [r"FACE\FACE001.SHP", r"MAJOR\BODY\L1A10002.SHP", r"FORCE\MCW10001.SHP", r"TROOP\FLAG0101.SHP", r"MAJOR\WEAPON\A1A10002.SHP", r"MAGIC\000\M000BALL01.SHP"]:
    p=os.path.join(P,rel)
    b=open(p,'rb').read()
    n=len(b)
    print(f"{rel:32s} bytes={n:7d} head={b[:16].hex()}")
    for w,h in ((96,96),(64,64),(48,48),(32,32),(20,20),(8,8),(10,20),(19,19)):
        if n>=w*h and (n-w*h)<=64: print(f"     ~ {w}x{h} + {n-w*h}B header")
