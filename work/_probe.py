import os,collections
base=r"F:\sanguo\extract\pak"
for n in ["COMBINE.INI","MAGIC.INI","MESSAGE.INI","SANGO.INI","THINGS.INI","TIMES1.INI"]:
    p=os.path.join(base,n)
    b=open(p,"rb").read()
    txt=b.decode("gbk",errors="replace")
    lines=txt.splitlines()
    secs=[l.strip() for l in lines if l.strip().startswith("[")]
    print(n, "bytes",len(b),"lines",len(lines),"crlf",b.count(b"\r\n"),"secs",len(secs))
    print("  first5secs", secs[:6])
