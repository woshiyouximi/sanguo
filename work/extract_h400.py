"""Extract out_h400 tar with Python tarfile (Windows tools mangle CJK names)."""
import sys, os, tarfile, pathlib

TAR = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else r'F:\sanguo\work\h400full.tar')
DST = pathlib.Path(sys.argv[2] if len(sys.argv) > 2
                   else r'F:\sanguo\project\art_ref\cloud_v0\heroes400')
DST.mkdir(parents=True, exist_ok=True)

n, skip = 0, []
with tarfile.open(TAR, 'r') as tf:
    members = [m for m in tf.getmembers() if m.isfile()]
    print('members', len(members))
    for m in members:
        base = os.path.basename(m.name)
        if not base.lower().endswith('.png'):
            skip.append(m.name)
            continue
        data = tf.extractfile(m).read()
        (DST / base).write_bytes(data)
        n += 1

print('extracted', n)
print('skipped_non_png', len(skip), skip[:5])
print('total_now', len(list(DST.glob('hero_*.png'))))
