import os
base=r"F:\sanguo\extract\pak"
def score(b,enc):
    try:
        t=b.decode(enc)
    except Exception as e:
        return None
    # count CJK and weird chars
    cjk=sum(1 for c in t if "\u4e00"<=c<="\u9fff")
    bad=sum(1 for c in t if c=="\ufffd")
    return cjk
for n in ["COMBINE.INI","MAGIC.INI","MESSAGE.INI","SANGO.INI","THINGS.INI","TIMES1.INI","TIMES2.INI","TIMES3.INI","TIMES4.INI","TIMES5.INI"]:
    b=open(os.path.join(base,n),"rb").read()
    r={}
    for enc in ["gbk","big5","cp950","utf-8"]:
        try:
            t=b.decode(enc); r[enc]=sum(1 for c in t if "\u4e00"<=c<="\u9fff")
        except Exception as e:
            r[enc]="FAIL"
    hi=sum(1 for x in b if x>=0x80)
    print(f"{n:14s} hi={hi:7d} {r}")
