# -*- coding: utf-8 -*-
import io

p = r'F:\sanguo\work\gen172.py'
t = io.open(p, encoding='utf-8').read()
old = "抽樣規則：先按「最容易被假 ✅ 騙過」挑，不按行號隨機——①舊 ❌ 翻案的行（4）、②帶硬門/順序的行（2）、③作者自己承認偏差的行（1）、④測試很多但缺一條正證的行（1）、⑤只剩打包參數的行（1）、⑥兩位數工時的行（1）、⑦表格型數據（1）。"
new = "抽樣規則：先按「最容易被假 ✅ 騙過」挑，不按行號隨機——①舊 ❌ 翻案行（4：R4/R37/R74/R78）、②帶硬門或順序的行（2：R8/R53）、③表格型數據（1：R28）、④清單型數據（1：R79）、⑤作者自己承認偏差的（1：R20）、⑥測試很多但缺一條正證的（1：R91）、⑦硬阻塞或兩位數工時的（2：R103/R104）。"
if t.count(old) != 1:
    print('SKIP(%d)' % t.count(old))
else:
    t = t.replace(old, new)
    io.open(p, 'w', encoding='utf-8', newline='\n').write(t)
    print('patched6')
