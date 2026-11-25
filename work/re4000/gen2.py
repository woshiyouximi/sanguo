# -*- coding: utf-8 -*-
"""生成证据文件 batch 2：调用链上下文（调用点前后各 N 条）+ 消费者。"""
import sys

sys.path.insert(0, r"F:\sanguo\work\re4000")
import q4000 as q

if __name__ == "__main__":
    q.save("20_ctx_43CF67.txt", q.around(0x43CF67, 55, 25))
    q.save("21_ctx_43D0BD.txt", q.around(0x43D0BD, 55, 25))
    q.save("22_ctx_43F2FB.txt", q.around(0x43F2FB, 60, 30))
    q.save("23_ctx_444956.txt", q.around(0x444956, 60, 30))
    q.save("24_ctx_444B7E.txt", q.around(0x444B7E, 60, 30))
    q.save("25_ctx_43B67F.txt", q.around(0x43B67F, 12, 55))
    q.save("26_ctx_43BCD8.txt", q.around(0x43BCD8, 30, 30))
    q.save("27_ctx_43BD74.txt", q.around(0x43BD74, 25, 25))
    q.save("28_ctx_43D8D2.txt", q.around(0x43D8D2, 20, 60))
    q.save("29_ctx_43C684.txt", q.around(0x43C684, 25, 25))
    q.save("30_xref_444C94.txt", q.xref(0x444C94))
    q.save("31_ctx_442424.txt", q.around(0x442424, 15, 10))
    print("done")
