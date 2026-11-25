import sys, numpy as np, itertools
sys.path.insert(0, r'F:\sanguo\tools')
import sango_shp

base = r'F:\sanguo\extract\pak\SHAPE\POLICY\PALAIS01'
shp = sango_shp.load(base + '.SHP')
a = np.asarray(sango_shp.to_image(shp).convert('RGB')).astype(np.int32)
raw = open(base + '.TEX','rb').read()
n = 640*480
best = []
for off in (0x0c, 0x12, 0x14):
    if len(raw) - off < n*2: continue
    px = np.frombuffer(raw[off:off+n*2], dtype='<u2').astype(np.uint32).reshape(480,640)
    for layout in ('555','565'):
        ch = [((px>>10)&0x1F, 31), ((px>>11)&0x1F, 31)] if layout=='555' else [((px>>11)&0x1F,31), ((px>>5)&0x3F,63)]
        if layout == '555':
            parts = {'hi':((px>>10)&0x1F,31), 'mid':((px>>5)&0x1F,31), 'lo':(px&0x1F,31)}
        else:
            parts = {'hi':((px>>11)&0x1F,31), 'mid':((px>>5)&0x3F,63), 'lo':(px&0x1F,31)}
        for perm in itertools.permutations(['hi','mid','lo']):
            arr = []
            for k in perm:
                v, mx = parts[k]
                arr.append(v*255//mx)
            m = np.stack(arr,-1).astype(np.int32)
            for flip in (False, True):
                t = m[::-1] if flip else m
                e = np.abs(a-t).mean()
                best.append((e, off, layout, perm, flip))
best.sort()
for e, off, layout, perm, flip in best[:8]:
    print('err=%.2f off=0x%x %s perm=%s flip=%s' % (e, off, layout, perm, flip))
