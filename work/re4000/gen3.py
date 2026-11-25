# -*- coding: utf-8 -*-
"""报告 160 的证据补齐：写点上下文 / 清除点穷举 / 初始化点 / 可见行为消费者。"""
import sys, os, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, r"F:\sanguo\work\re_speed")
import q4000 as q
import rs

OUT = []


def emit(name, text):
    q.save(name, text)
    OUT.append((name, len(text)))


# ---------- 1. 写点：0x4447B7 全文（带标注）----------
head = (
    "# 0x4447B7(army) 全军撤退令 —— 含两个写点 0x4447E2(军团级) / 0x444858(逐小队级)\n"
    "# size=228 (0x4447B7..0x44489B)；callers = 0x43F2FB / 0x444956 / 0x444B7E\n"
    "# 0x4447D1: 0x43ADED(army,0x100,8)   → army+0x94..0xB0 八个命令槽全写 8(撤退)\n"
    "# 0x4447E2: 0x43B51E(army,0x4000)     → 军团对象自身 state |= 0x4000\n"
    "# 0x4447EA: [army+0x84]&0x40（主将阵亡）→ OM 0x1000B + 0x43B51E(army,0x8000)\n"
    "# 0x444837: for i < [army+0x58] { 0x43B51E(army+0xB4+i*0x48, 0x4000) }  ← 逐小队\n"
    "# 0x444862: 0x43B556(army)（测 0x2000）非 0 则跳过；否则按阵营写 [army+0x44]+0x2c = 0 / 0x800000\n"
)
emit('41_fn_4447B7_annotated.txt', head + "\n" + q.cap(0x4447B7, 72, '0x4447B7'))

# ---------- 2. 三个调用点 ----------
lines = ["# 0x4447B7 的三个调用点：前后 40 行（谁、在什么条件下下令全军撤退）\n"]
for name, va in (('A 0x43F2FB  inside 0x43EF64 (军团指令执行器)', 0x43F2FB),
                 ('B 0x444956  inside 0x44493D (幂等守卫：army+0x80&4 已置则跳过)', 0x444956),
                 ('C 0x444B7E  inside 0x444B4C (面板「撤退」按钮 handler)', 0x444B7E)):
    lines.append("\n===== %s =====\n" % name)
    lines.append(q.around(va, 40, 40))
emit('42_callers_of_4447B7.txt', "\n".join(lines))

# ---------- 3. 状态 API 与清除点穷举 ----------
lines = ["# 状态字 [u+0x2c] 的全部写入口 + 「0x4000 有没有清除点」穷举\n",
         "## (a) 四个 API 本体\n", q.cap(0x43B50D, 22, '0x43B50D GetState'),
         "", q.cap(0x43B51E, 22, '0x43B51E SetState'),
         "", q.cap(0x43B538, 22, '0x43B538 ClearState'),
         "", q.cap(0x43B556, 22, '0x43B556 test 0x2000'), ""]
lines.append("## (b) SetState callers\n" + q.xref(0x43B51E))
lines.append("## (c) ClearState callers（只有 2 个，掩码 0x1000 / 0x100，无 0x4000）\n" + q.xref(0x43B538))
lines.append("## (d) 0x43B538 两个 caller 的实参\n")
lines.append(q.around(0x43C63A, 6, 4))
lines.append(q.around(0x444CC5, 8, 4))
emit('50_state_api_and_clear_exhaustive.txt', "\n".join(lines))

# ---------- 4. 位运算层面：or/xor/and 立即数 ----------
rows = []
for imm in (0x4000, 0xFFFFBFFF, 0xBFFF, 0x3FFF):
    recs = rs.find_imm(imm, limit=100000)
    rows.append("imm 0x%X: %d 条" % (imm, len(recs)))
    for r in recs:
        rows.append("    %08X  %-5s %-40s  %s" % (r[0], r[2], r[3], q.owners(r[0]).strip()))
emit('51_imm4000_and_masks.txt',
     "# 立即数 0x4000 / ~0x4000 的全部出现（or=0、xor=0；and 全是「读」，没有「清」）\n" + "\n".join(rows))

# ---------- 5. mov [x+0x2c],0 在战场内核里的归属 ----------
rows = []
recs = rs.find_mem(0x2c, mn=('mov', 'or', 'and', 'xor'), limit=100000)
sel = [r for r in recs if 0x43A000 <= r[0] < 0x446000 and re.search(r'\[[^\]]*\+ 0x2c\]', r[3])]
rows.append("战场内核 0x43A000-0x446000 内所有 disp=0x2c 的读/写，共 %d 条：" % len(sel))
for r in sel:
    rows.append("  %08X  %-5s %-40s  %s" % (r[0], r[2], r[3], q.owners(r[0]).strip()))
emit('52_disp2c_accesses_in_kernel.txt', "\n".join(rows))

# ---------- 6. 初始化点（唯一的「赋值」型写入）----------
emit('53_unit_init_43A1C4.txt',
     "# 单位创建时对 [u+0x2c] 的唯一「赋值」型写入（不是 |=，所以这是唯一能「清掉 0x4000」的地方）\n"
     "# 0x43A292: edx = [u+0x00]  ← 兵种/单位定义表项指针\n"
     "# 0x43A294: movsx eax, word ptr [edx+0x38]   ← 定义里的初始状态字（int16）\n"
     "# 0x43A29B: mov [u+0x2c], eax                 ← 状态字 = 模板值（含 0x4000 与否由表决定）\n"
     "# 0x43A2A1: mov [u+0x34], 0   ← 行动计时器清零\n"
     "# 0x43A2A8: mov [u+0x38], 0   ← 步进计时器清零\n"
     "# 0x43A364 是同一段代码对另一个入参的复制（[ebp+0xc]）\n"
     "callers of 0x43A1C4:\n" + q.xref(0x43A1C4) + "\n"
     + q.around(0x43A29B, 14, 6) + "\n" + q.around(0x43A364, 12, 6))

# ---------- 7. 消费者：谓词 0x43B67F 与它的 3 个调用点 ----------
lines = ["# 谓词 0x43B67F(u) = (u != 0 && (GetState(u) & 0x4000))\n",
         "callers:\n" + q.xref(0x43B67F), "",
         "## 0x43C132（在 0x43C084「接敌/靠近」里）\n", q.around(0x43C132, 18, 40), "",
         "## 0x43D7C7（在 0x43D76C「沿方向找撤退中的敌 unit」里）\n", q.around(0x43D7C7, 30, 16), "",
         "## 0x43E983（在主将更新器 0x43E964 里）\n", q.around(0x43E983, 10, 30)]
emit('54_predicate_43B67F_and_consumers.txt', "\n".join(lines))

# ---------- 8. 撤退时的步进/朝向：0x43BCA7 / 0x43BD64 / 0x43D8D2 ----------
lines = ["# 0x4000 对「移动」的三个直接作用点\n",
         "## 0x43BCA7(u)：每帧步进驱动。0x43BCD8 读 0x4000；撤退态 count=1、非撤退 count=2\n",
         q.cap(0x43BCA7, 40, '0x43BCA7'), "",
         "## 0x43BD64(u, dir)：撤退态只允许朝 [u+0x44]+0x2c 的「反方向」步进\n",
         q.cap(0x43BD64, 26, '0x43BD64'), "",
         "## 0x43D8D2(u)：撤退专用落位（dir 由 [u+0x44]+0x94 的符号决定，并按 u+0x40 阵营校验）\n",
         q.cap(0x43D8D2, 60, '0x43D8D2'), "",
         "callers of 0x43D8D2:\n" + q.xref(0x43D8D2)]
emit('55_movement_consumers.txt', "\n".join(lines))

# ---------- 9. 0x43C684：撤退态走不动 → 0x8000 ----------
emit('56_43C684_blocked_8000.txt',
     "# 0x43C4C0 内 0x43C678..0x43C6D0：撤退态 + 落点探测失败 → 0x43BFE7 直接落位 + SetState(0x8000)\n"
     "# 0x43C684: GetState(u)&0x4000 非 0\n"
     "# 0x43C693: 0x43AF54(x,0) 返回 0（探测失败/该格无单位）才继续\n"
     "# 0x43C6B0: 0x43BFE7(u, x, u->+0xc, 0)  ← 见 53 号文件同类「赋值」写：落位 + 按 x 定朝向\n"
     "# 0x43C6C1: SetState(u, 0x8000)\n"
     + q.cap(0x43C678, 30, '0x43C678') + "\n"
     + "## 0x43BFE7 本体（落位例程）\n" + q.cap(0x43BFE7, 40, '0x43BFE7'))

# ---------- 10. 军团级标志 army+0x80 的三个位 ----------
emit('57_army_flags_80.txt',
     "# army+0x80 的位语义（兵团级，非单位状态字）\n"
     "#  bit0 0x1: 0x444920 `or ...,1`  ← 在 0x4448B2 里与 0x43ADED(army,0x101,7) 同时发生 = 全军突击\n"
     "#  bit1 0x2: 0x44499E `or ...,2`  ← 0x44497F: 0x43ADED(army,0,1) 之后 = 单槽命令(待机/前进)\n"
     "#  bit2 0x4: 0x43F30F / 0x44496D / 0x444B99 三处 `or ...,4` = 全军撤退中（不可再撤）\n"
     "#  bit4 0x10: 0x444C9x `and ...,~0x10` = 取消\n"
     "## 0x4448B2（全军突击）\n" + q.cap(0x4448B2, 34, '0x4448B2') + "\n"
     "## 0x43F303..0x43F371（撤退后置 bit2 + 全局标志 + 语音 0x39）\n" + q.around(0x43F30F, 4, 26))

# ---------- 11. 两个 cmd==8 分派槽 ----------
emit('58_cmd8_dispatch.txt',
     "# 主将/小队命令分派器的表项 8（= 撤退）都落到带 0x4000 的包装\n"
     "## 主将 0x43CF07: jmp [cmd*4+0x43CF8D]，[8]=0x43CF63 → call 0x43C7E3（内含 0x43C827）\n"
     + q.around(0x43CF63, 3, 3) + "\n"
     + "## 小队 0x43CFB1: jmp [cmd*4+0x43D0C9]，[8]=0x43D0B9 → call 0x43CC95（内含 0x43CCD9）\n"
     + q.around(0x43D0BD, 3, 3) + "\n"
     + "## 0x43C7E3 本体\n" + q.cap(0x43C7E3, 20, '0x43C7E3') + "\n"
     + "## 0x43CC95 本体\n" + q.cap(0x43CC95, 20, '0x43CC95'))

print("OK")
for n, sz in OUT:
    print("  %-46s %6d bytes" % (n, sz))
