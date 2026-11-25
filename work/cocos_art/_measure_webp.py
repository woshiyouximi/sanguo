import io, os, glob
from PIL import Image
def enc(im, **kw):
    b=io.BytesIO(); im.save(b,'WEBP',**kw); return b.tell()
gen_dir=r'F:/sanguo/game/web/anim/general'
files=sorted(glob.glob(gen_dir+'/sheet_*.png'))
print('sheets',len(files))
tot={'png':0,'lossless':0,'q80':0,'q85':0,'q90':0,'q85_m6':0}
for f in files:
    tot['png']+=os.path.getsize(f)
    im=Image.open(f)
    if im.mode!='RGBA': im=im.convert('RGBA')
    tot['lossless']+=enc(im, lossless=True, quality=100, method=6)
    tot['q80']+=enc(im, quality=80, method=6)
    tot['q85']+=enc(im, quality=85, method=6)
    tot['q90']+=enc(im, quality=90, method=6)
for k,v in tot.items(): print('%-10s %10d B  %7.2f MB'%(k,v,v/1048576))
print('--- policy ---')
pol_dir=r'F:/sanguo/game/web/assets/bg/policy'
pf=sorted(glob.glob(pol_dir+'/*.png'))
print('policy',len(pf))
p={'png':0,'ll':0,'q80':0,'q85':0}
for f in pf:
    p['png']+=os.path.getsize(f)
    im=Image.open(f)
    if im.mode!='RGBA': im=im.convert('RGBA')
    p['ll']+=enc(im,lossless=True,quality=100,method=6)
    p['q80']+=enc(im,quality=80,method=6)
    p['q85']+=enc(im,quality=85,method=6)
for k,v in p.items(): print('%-5s %10d B %7.2f MB'%(k,v,v/1048576))