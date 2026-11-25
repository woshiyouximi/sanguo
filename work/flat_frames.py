import os, shutil
src = r'F:\sanguo\game\assets\anim'
flat = r'F:\sanguo\game\assets\anim_flat'
if os.path.isdir(flat): shutil.rmtree(flat)
os.makedirs(flat)
for d in ('walk_back', 'walk_front', 'attack_front'):
    for f in sorted(os.listdir(os.path.join(src, d))):
        if f.endswith('.png'):
            shutil.copy(os.path.join(src, d, f), os.path.join(flat, '%s_%s' % (d, f)))
print('flat files', len(os.listdir(flat)))
