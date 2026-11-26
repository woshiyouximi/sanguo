# -*- coding: utf-8 -*-
import io
G = r'F:\sanguo\game\cocos\native\engine\android\app\build.gradle'
g = io.open(G, encoding='utf-8').read()
before = g
g = g.replace('versionCode 21', 'versionCode 22').replace('versionName "3.1"', 'versionName "3.2"')
io.open(G, 'w', encoding='utf-8', newline='\n').write(g)
print('bumped', before != g)
