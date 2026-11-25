import xlrd, sys, io
p = r'C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\群英2宝典修订版.xls'
wb = xlrd.open_workbook(p)
print('sheets', wb.nsheets)
for sh in wb.sheets():
    print('==', sh.name, sh.nrows, sh.ncols)
    for r in range(min(6, sh.nrows)):
        vals = []
        for c in range(min(10, sh.ncols)):
            v = sh.cell_value(r, c)
            vals.append(str(v)[:16])
        print('   ', ' | '.join(vals))
