/**
 * SmartScript 程序装载与指令解码。
 *
 * 布局与解析规则完全复用 `tools/smartscript.py`（不要在这里另起一套逆向）：
 *   文件头 +0x00 "Smart Script"，+0x10 <6I> = ver/codeStart/symOff/symCnt/strOff/strCnt，
 *   +0x28 <2I> = marker(每脚本全局槽数 121)/dataEnd；符号表项 16 B <4I> = off/argc/nameOff/num；
 *   字符串表为 strCnt 个 u32 偏移，指向 cp950 字符串。
 *   指令 = u32 opcode + 0/1/2 个 u32 操作数。
 */

export interface SoFunction {
  idx: number;
  name: string;
  /** 脚本 id：底层原语为 0，MagicN 为 0x1F5 + N - 1 */
  num: number;
  /** 代码段内的绝对文件偏移 */
  off: number;
  argc: number;
}

export interface SoSymbols {
  format: string;
  source: string;
  bytes: number;
  version: number;
  codeStart: number;
  codeEnd: number;
  strOff: number;
  marker: number;
  globalSlots: number;
  functionCount: number;
  stringCount: number;
  instructionCount: number;
  functions: SoFunction[];
  strings: string[];
  opcodeHistogram: Record<string, number>;
  syscallHistogram: Record<string, number>;
  syscallSignatures: Record<string, { argc: number; ret: number }>;
}

/** 操作数形态，与 smartscript.py 的 OPS 表一一对应。 */
export type OperandKind = '' | 'I' | 'O' | 'S' | 'X' | 'YF' | 'CO';

export interface OpDef {
  op: number;
  name: string;
  operands: OperandKind;
  /** 栈净变化（登记值）；PUSHN / PUSHS / SYSCALL 由 VM 实现自行计算 */
  delta: number;
}

const DEF = (op: number, name: string, operands: OperandKind, delta: number): OpDef => ({
  op,
  name,
  operands,
  delta,
});

/** 90 项跳转表（0x00–0x59），顺序与 OPS 表一致。 */
export const OPCODES: readonly OpDef[] = [
  DEF(0x00, 'NOP', '', 0),
  DEF(0x01, 'RETV', 'I', 0),
  DEF(0x02, 'RET', 'I', 0),
  DEF(0x03, 'PUSHN', 'I', 0),
  DEF(0x04, 'CALL', 'O', 0),
  DEF(0x05, 'SYSCALL', 'YF', 0),
  DEF(0x06, 'PUSHI', 'I', 1),
  DEF(0x07, 'PUSHS', 'S', 1),
  DEF(0x08, 'LDSL', 'X', 1),
  DEF(0x09, 'LDSG', 'X', 1),
  DEF(0x0a, 'LDG', 'I', 1),
  DEF(0x0b, 'STL', 'X', -1),
  DEF(0x0c, 'STG', 'X', -1),
  DEF(0x0d, 'STE', 'I', -1),
  DEF(0x0e, 'POP', '', -1),
  DEF(0x0f, 'ADD', '', -1),
  DEF(0x10, 'FADD', '', -1),
  DEF(0x11, 'OP11', '', -1),
  DEF(0x12, 'SUB', '', -1),
  DEF(0x13, 'FSUB', '', -1),
  DEF(0x14, 'MUL', '', -1),
  DEF(0x15, 'FMUL', '', -1),
  DEF(0x16, 'DIV', '', -1),
  DEF(0x17, 'FDIV', '', -1),
  DEF(0x18, 'MOD', '', -1),
  DEF(0x19, 'OP19', '', -1),
  DEF(0x1a, 'NEG', '', 0),
  DEF(0x1b, 'FNEG', '', 0),
  DEF(0x1c, 'NOT', '', 0),
  DEF(0x1d, 'INCL', 'X', 0),
  DEF(0x1e, 'INCG', 'X', 0),
  DEF(0x1f, 'INCE', 'I', 0),
  DEF(0x20, 'DECL', 'X', 0),
  DEF(0x21, 'DECG', 'X', 0),
  DEF(0x22, 'DECE', 'I', 0),
  DEF(0x23, 'AND', '', -1),
  DEF(0x24, 'OR', '', -1),
  DEF(0x25, 'XOR', '', -1),
  DEF(0x26, 'EQ', '', -1),
  DEF(0x27, 'EQF', '', -1),
  DEF(0x28, 'STREQ', '', -1),
  DEF(0x29, 'NE', '', -1),
  DEF(0x2a, 'NEF', '', -1),
  DEF(0x2b, 'STRNE', '', -1),
  DEF(0x2c, 'GT', '', -1),
  DEF(0x2d, 'FGT', '', -1),
  DEF(0x2e, 'STRGT', '', -1),
  DEF(0x2f, 'GE', '', -1),
  DEF(0x30, 'FGE', '', -1),
  DEF(0x31, 'STRGE', '', -1),
  DEF(0x32, 'LT', '', -1),
  DEF(0x33, 'FLT', '', -1),
  DEF(0x34, 'STRLT', '', -1),
  DEF(0x35, 'LE', '', -1),
  DEF(0x36, 'FLE', '', -1),
  DEF(0x37, 'STRLE', '', -1),
  DEF(0x38, 'LNOT', '', 0),
  DEF(0x39, 'LAND', '', -1),
  DEF(0x3a, 'LOR', '', -1),
  DEF(0x3b, 'JMP', 'O', 0),
  DEF(0x3c, 'JZ', 'O', -1),
  DEF(0x3d, 'JNZ', 'O', -1),
  DEF(0x3e, 'SHL', '', -1),
  DEF(0x3f, 'SHR', '', -1),
  DEF(0x40, 'CASE', 'CO', -1),
  DEF(0x41, 'NOP41', '', 0),
  DEF(0x42, 'WAIT', '', -1),
  DEF(0x43, 'NOP43', '', 0),
  DEF(0x44, 'NOP44', '', 0),
  DEF(0x45, 'WAITFOR', '', -1),
  DEF(0x46, 'FINDVM', '', -1),
  DEF(0x47, 'CALLS', '', -5),
  DEF(0x48, 'I2F', '', 0),
  DEF(0x49, 'I2S', '', 0),
  DEF(0x4a, 'F2I', '', 0),
  DEF(0x4b, 'F2S', '', 0),
  DEF(0x4c, 'OP4C', '', -1),
  DEF(0x4d, 'OP4D', '', -1),
  DEF(0x4e, 'LDSLS', 'X', 0),
  DEF(0x4f, 'LDSGS', 'X', 0),
  DEF(0x50, 'LDGIDX', 'I', 0),
  DEF(0x51, 'STLIDX', 'I', -2),
  DEF(0x52, 'STGIDX', 'I', -2),
  DEF(0x53, 'STEIDX', 'I', -2),
  DEF(0x54, 'INCLIDX', 'I', -1),
  DEF(0x55, 'INCGIDX', 'I', -1),
  DEF(0x56, 'INCEIDX', 'I', -1),
  DEF(0x57, 'DECLIDX', 'I', -1),
  DEF(0x58, 'DECGIDX', 'I', -1),
  DEF(0x59, 'DECEIDX', 'I', -1),
];

export const OP_BY_CODE: ReadonlyMap<number, OpDef> = new Map(OPCODES.map((d) => [d.op, d]));

export const OPERAND_WORDS: Record<OperandKind, number> = {
  '': 0,
  I: 1,
  O: 1,
  S: 1,
  X: 1,
  YF: 2,
  CO: 2,
};

export interface Instruction {
  /** 指令起始偏移 */
  off: number;
  op: number;
  def: OpDef;
  /** 第 1 个操作数（YF: syscall id；CO: case 值） */
  a: number;
  /** 第 2 个操作数（YF: flags；CO: 跳转目标） */
  b: number;
  /** 下一条指令的偏移 */
  next: number;
}

export class SoProgram {
  readonly bytes: Uint8Array;
  readonly sym: SoSymbols;
  readonly codeStart: number;
  readonly codeEnd: number;
  readonly globalSlots: number;
  readonly functions: readonly SoFunction[];
  readonly byName: ReadonlyMap<string, SoFunction>;
  readonly byNum: ReadonlyMap<number, SoFunction>;
  private readonly byOffset: ReadonlyMap<number, SoFunction>;
  private readonly strings: readonly string[];

  constructor(bytes: Uint8Array, sym: SoSymbols) {
    this.bytes = bytes;
    this.sym = sym;
    this.codeStart = sym.codeStart;
    this.codeEnd = sym.codeEnd;
    this.globalSlots = sym.globalSlots || sym.marker || 121;
    this.functions = sym.functions;
    this.strings = sym.strings;
    this.byName = new Map(sym.functions.map((f) => [f.name, f]));
    this.byNum = new Map(sym.functions.filter((f) => f.num !== 0).map((f) => [f.num, f]));
    this.byOffset = new Map(sym.functions.map((f) => [f.off, f]));
  }

  static fromJson(bytes: Uint8Array, symJson: unknown): SoProgram {
    return new SoProgram(bytes, symJson as SoSymbols);
  }

  functionAt(off: number): SoFunction | undefined {
    return this.byOffset.get(off);
  }

  functionByName(name: string): SoFunction | undefined {
    return this.byName.get(name);
  }

  functionByNum(num: number): SoFunction | undefined {
    return this.byNum.get(num);
  }

  stringAt(index: number): string {
    const s = this.strings[index];
    if (s === undefined) {
      throw new Error(`SmartScript: 字符串下标越界 ${index}`);
    }
    return s;
  }

  u32(off: number): number {
    if (off < 0 || off + 4 > this.bytes.length) {
      throw new Error(`SmartScript: 读取越界 off=0x${off.toString(16)}`);
    }
    const b = this.bytes;
    return (b[off] | (b[off + 1] << 8) | (b[off + 2] << 16) | (b[off + 3] << 24)) >>> 0;
  }

  /** 解码 1 条指令。未知 opcode 直接抛错（不静默跳过）。 */
  decode(off: number): Instruction {
    const op = this.u32(off);
    const def = OP_BY_CODE.get(op);
    if (!def) {
      throw new Error(
        `SmartScript: 未知 opcode 0x${op.toString(16).padStart(2, '0')} @0x${off.toString(16)}（0x00–0x59 之外）`,
      );
    }
    const words = OPERAND_WORDS[def.operands];
    // X 是局部/全局槽号：负数表示参数（arg1 = -2），必须按 int32 解释
    const rawA = words >= 1 ? this.u32(off + 4) : 0;
    const a = def.operands === 'X' ? rawA | 0 : rawA;
    const b = words >= 2 ? this.u32(off + 8) : 0;
    return { off, op, def, a, b, next: off + 4 * (1 + words) };
  }
}
