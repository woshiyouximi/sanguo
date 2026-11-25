# p03_align.py -- 确定 -ss 抽帧的绝对时间映射：chk514/cNNNN 对上 f30/fNNNN
import hashlib, os, glob
A = sorted(glob.glob(r'F:\sanguo\work\speed_arb\chk514\c*.png'))
B = {os.path.basename(p): hashlib.md5(open(p, 'rb').read()).hexdigest()
     for p in glob.glob(r'F:\sanguo\work\orig_motion\f30\f*.png')}
for i, p in enumerate(A, 1):
    h = hashlib.md5(open(p, 'rb').read()).hexdigest()
    hit = [k for k, v in B.items() if v == h]
    print('c%04d' % i, '->', hit if hit else 'no exact match')
