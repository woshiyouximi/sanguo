# -*- coding: utf-8 -*-
"""生成证据文件 batch 1：写入点/清除点/命令设置函数。"""
import io
import sys

sys.path.insert(0, r"F:\sanguo\work\re4000")
import q4000 as q


def region(va, n, title):
    return q.cap(va, n, title=title)


if __name__ == "__main__":
    q.save("10_wrap_family_43C740.txt", region(0x43C740, 0x150, "0x43C740.. 撤退包装函数家族（前段）"))
    q.save("11_wrap_family_43C8B0.txt", region(0x43C8B0, 0x200, "0x43C8B0.. 撤退包装函数家族（中段）"))
    q.save("12_wrap_family_43CB00.txt", region(0x43CB00, 0x1D0, "0x43CB00.. 撤退包装函数家族（后段）"))
    q.save("13_fn_43C4C0.txt", q.cap_until_ret(0x43C4C0, 500))
    q.save("14_fn_43ADED.txt", q.cap_until_ret(0x43ADED, 300))
    q.save("15_fn_444C94_cancel.txt", q.cap_until_ret(0x444C94, 60))
    q.save("16_fn_4447B7.txt", q.cap_until_ret(0x4447B7, 200))
    q.save("17_xrefs.txt",
           q.xref(0x4447B7) + q.xref(0x43C7E3) + q.xref(0x43CC95) +
           q.xref(0x43C4C0) + q.xref(0x43B51E) + q.xref(0x43B538) +
           q.xref(0x43ADED) + q.xref(0x43B574))
    print("done")
