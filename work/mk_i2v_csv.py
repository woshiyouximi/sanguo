import csv
HDR=["id","kind","prompt","negative","width","height","seed","steps","cfg","length","image"]
row=["t_i2v","i2v","士兵背视向前走，步伐沉稳，身体自然摆动，镜头固定，纯色背景","文字，水印，多人，镜头晃动","512","768","901","30","5.0","33","test_start.png"]
with open(r'F:\sanguo\cloud\_test_i2v.csv','w',encoding='utf-8-sig',newline='') as f:
    w=csv.writer(f); w.writerow(HDR); w.writerow(row)
print('ok')
