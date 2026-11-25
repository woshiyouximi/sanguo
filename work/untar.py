import tarfile, os, shutil
dst = r'F:\sanguo\project\art_ref\cloud_v0'
for f in os.listdir(dst):
    if f.startswith('hero_') and '.png' in f:
        os.remove(os.path.join(dst, f))
with tarfile.open(r'F:\sanguo\work\v0_t2i.tar.gz', 'r:gz') as tf:
    for m in tf.getmembers():
        if not m.isfile():
            continue
        name = m.name.split('/')[-1]
        out = os.path.join(dst, name)
        with tf.extractfile(m) as src, open(out, 'wb') as fp:
            shutil.copyfileobj(src, fp)
print(sorted(os.listdir(dst)))
