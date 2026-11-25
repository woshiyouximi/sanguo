/**
 * 武将技「结算类别」——`battle.ts:1970 skillKindOf()` 的**独立副本 + 修正**。
 *
 * 为什么要复制一份：`skillKindOf()` 在 `game/src/core/battle.ts` 里是内联的（被 `battle.ts:2226`
 * 与 `view/battleView.ts:418` 两处消费），而 `battle.ts` 正被另外两个 agent 改。本文件因此
 * **不 import 任何东西**（连 `types.ts` 都不引，只用结构类型），可以独立编译、独立测试，
 * 接线时把 `skillKindOf()` 的体换成一行 `skillKindOfEx()` 即可（见
 * `project/149_補兵类技能语义.md` 的 diff）。
 *
 * ── 修正的是什么 ────────────────────────────────────────────────────────────
 * 旧逻辑只认 seq 1/50/104 与 ATTRIB 含「補血」，`ATTRIB=補兵` 的 7 条（5/17/19/31/37/57/81）
 * 因为 `ATTACK=0` 落到 `ATTACK>=40 ? 'aoe' : 'strike'` 的 `'strike'` 分支，于是运行期被当成
 * **伤害技**结算（保真网 `magic.castkind` 7 条 WARN）。
 *
 * 考古结论（直证，见 `SKILL_KIND_EVIDENCE`）：这 7 条在原作里**只给自己加兵**，
 * 调用链是 `MagicN → MoreSoldier|BackSoldier → ProduceSoldier|ProduceBackSoldier →
 * SYSCALL 0x119 生成士兵对象`，整条链上没有任何伤害 syscall；`ATTACK` 全为 0；
 * `ACTIVE` 全为「我方士兵」。所以它们是 `'heal-troop'`，不是伤害技，也不是 INI 标错。
 *
 * ── ATTRIB 在原作里到底被谁读（重要） ──────────────────────────────────────
 * 1. 解析：`0x42F3C8`（MAGIC.INI `[MAGIC]` 解析器）→ `0x42F5F8 push "Attrib"` → 逐 token
 *    `call 0x42F2B9` 转位值并 OR 累加 → `0x42F67E mov word ptr [edx+0xe], ax` 存入
 *    `MagicDef+0x0E`（16 位掩码）。取值器 `0x40A3F7(i)`。
 * 2. 消费：只在 4 个**布尔谓词**里按位测试（`work/dis_battle_units.txt`）——
 *    `0x43B702` 测 `0x200`、`0x43B757` 测 `0x100`、`0x43B7D0` 测 `0x10|0x40`、
 *    `0x43B834` 测 `0x0F`；都是「遍历武将技序号表 `obj+0x54+i`，问这条技是否属于某类」，
 *    供 AI/目标选择用。
 * 3. **施展入口 `0x43BAE3` 完全不读 `+0x0E`**：它只扣 MP/POWER 气力、取 Script 指针、跳进
 *    字节码解释器（`work/dis_battle_units.txt:2092-2174`）。所以「打伤害还是补兵」在原作里
 *    **由脚本决定，不由 ATTRIB 决定**；ATTRIB 是"范围/目标类型"标签，不是结算类型。
 *
 * 结论：`補兵` 这个 ATTRIB 值对应的行为就是"给我方补员"，与 `補血` 并列（`docs/03a:106-114`
 * 的分类规则 2 也是这么归的），只是补的是**兵**不是**将血**。
 */

/** 结算类别。`'heal-troop'` = 给我方部队补员（原作「補兵/伏兵」系）。 */
export type SkillKind = 'strike' | 'aoe' | 'heal' | 'heal-troop' | 'buff' | 'summon' | 'unknown';

/**
 * `skillKindOfEx()` 的入参：只要能拿到这几个字段就行。
 *
 * 特意同时接受 `SEQ` 与 `SEQUENCE`：`data/magics.json` 与 `types.ts:40 Magic` 里字段名是
 * `SEQUENCE`，而序号也可能由调用方单独给（`opts.seq`，优先级最高）。
 */
export interface MagicLike {
  /** 序号（短名，调用方自便） */
  SEQ?: number;
  /** 序号（`Magic` 类型与 magics.json 的真实字段名） */
  SEQUENCE?: number;
  ATTRIB?: string;
  ATTACK?: number;
  MP?: number;
}

/**
 * `ATTRIB=補兵` 的 7 条。**脚本直证**，不依赖 INI 标签：即使以后有人改了 `ATTRIB`，
 * 这 7 条的结算仍然是补兵（脚本 `Magic9/23/24/33/41/65/84` 只调 MoreSoldier/BackSoldier）。
 */
export const HEAL_TROOP_SEQS: readonly number[] = [5, 17, 19, 31, 37, 57, 81];

const HEAL_TROOP_SET: ReadonlySet<number> = new Set(HEAL_TROOP_SEQS);

/** 中文名（给 UI/报告用；Report 保证穷尽 `SkillKind`）。 */
export const SKILL_KIND_LABEL: Record<SkillKind, string> = {
  strike: '单体伤害',
  aoe: '群体伤害',
  heal: '补将血',
  'heal-troop': '补己方兵',
  buff: '增益',
  summon: '召唤',
  unknown: '未定',
};

/**
 * 逐条证据。地址为 VA，`magic_so.dis.txt:NNNN` 是 `export/script/magic_so.dis.txt` 的行号，
 * `MAGIC.INI:NN` 是 `extract/pak/MAGIC.INI`（**Big5 编码**，UTF-8 读会全是乱码）的行号。
 */
export const SKILL_KIND_EVIDENCE: Record<number, string> = {
  // ── 旧逻辑的 3 个硬编码（保留原样，不动） ─────────────────────────────────
  1: 'MAGIC.INI:8 ATTRIB=補血 ⇒ heal。battle.ts:1971 的硬编码是第一道闸，ATTRIB 判定是第二道；两条都命中。',
  50: 'MAGIC.INI 無 補血/補兵 标签（ATTRIB=中間,主將2，ATTACK=12）⇒ 只有 battle.ts:1972 的硬编码能把它算成 strike，属原作特例，保留。',
  104: 'MAGIC.INI ATTRIB=主將3、ATTACK=60 ⇒ 不走特例也会是 aoe；battle.ts:1973 硬编码与数据一致。',
  60: 'MAGIC.INI 第 2 条 補血（回天術）；`/補血/` 分支 ⇒ heal，与旧逻辑等价。',

  // ── 7 条「補兵」：全部直证为补己方兵 ─────────────────────────────────────
  5: 'MAGIC.INI:52 ATTRIB=補兵 / ATTACK=0 / ACTIVE=我方士兵。magic_so.dis.txt:33453 Magic9(@0x3AC00)：'
    + 'PUSHI 17,0（:33455）→ CALL MoreSoldier(@0x5380, #52):3160 SYSCALL 0x116 取上限、:3173 SYSCALL 0x10C 取当前、'
    + ':3194 PUSHS "ProduceSoldier" + :3199 CALLS 生成己方士兵；:3252 才是 CastFail（补满/无兵可补）。无任何伤害调用。',
  17: 'MAGIC.INI:184 ATTRIB=補兵 / ATTACK=0 / ACTIVE=我方士兵。magic_so.dis.txt:33559 Magic23(@0x3AD90)：'
    + 'PUSHI 32,0（:33561）→ CALL MoreSoldier（:33563），与 seq 5 同一条脚本路径。',
  19: 'MAGIC.INI:206 ATTRIB=補兵 / ATTACK=0 / ACTIVE=我方士兵。magic_so.dis.txt:33567 Magic24(@0x3ADB0)：'
    + 'PUSHI 25,0（:33569）→ CALL BackSoldier(@0x20EB0, #212):18849 SYSCALL 0x10C、:18870 PUSHS "ProduceBackSoldier" '
    + '+ :18875 CALLS（後伏兵＝在己方后排出兵），:18934 CastFail。无任何伤害调用。',
  31: 'MAGIC.INI:338 ATTRIB=補兵 / ATTACK=0 / ACTIVE=我方士兵。magic_so.dis.txt:33634 Magic33(@0x3AEA8)：'
    + 'PUSHI 35,0（:33636）→ CALL BackSoldier（:33638）。',
  37: 'MAGIC.INI:404 ATTRIB=補兵 / ATTACK=0 / ACTIVE=我方士兵。magic_so.dis.txt:33691 Magic41(@0x3AF70)：'
    + 'PUSHI 45,0（:33693）→ CALL BackSoldier（:33695）。',
  57: 'MAGIC.INI:624 ATTRIB=補兵 / ATTACK=0 / ACTIVE=我方士兵。magic_so.dis.txt:33867 Magic65(@0x3B1F0)：'
    + 'PUSHI 25,0（:33869）→ CALL MoreSoldier（:33871）。',
  81: 'MAGIC.INI:888 ATTRIB=補兵 / ATTACK=0 / ACTIVE=我方士兵。magic_so.dis.txt:34008 Magic84(@0x3B3F8)：'
    + 'PUSHI 42,0（:34010）→ CALL MoreSoldier（:34012）。',
};

/** 是否属于「補兵」7 条（脚本直证名单）。 */
export function isHealTroopSeq(seq: number | undefined): boolean {
  return typeof seq === 'number' && HEAL_TROOP_SET.has(seq);
}

/**
 * 武将技结算类别（`battle.ts:1970 skillKindOf()` 的修正版）。
 *
 * 判定顺序**原样照抄旧函数**，只在 `補血` 之后插入 `補兵` 一档，所以除这 7 条之外
 * 110 条里的其余 103 条结果与旧函数逐条相同（`tests/skill_kind.test.ts` 有逐条断言）。
 *
 * 与旧函数的**唯一**签名差异：旧函数找不到技时返回 `null`，这里返回 `'unknown'`。
 * 参数是"技本身"而不是 `GameData`，所以"找不到"由调用方表达（`seq` 缺省且无 ATTACK）。
 */
export function skillKindOfEx(m: MagicLike, opts?: { seq?: number }): SkillKind {
  const seq = opts?.seq ?? m.SEQ ?? m.SEQUENCE;
  // ── 旧逻辑的三条硬编码，逐字保留 ──────────────────────────────────────
  if (seq === 1) return 'heal';
  if (seq === 50) return 'strike';
  if (seq === 104) return 'aoe';

  const attrib = m.ATTRIB ?? '';
  if (attrib.includes('補血') || attrib.includes('补血')) return 'heal';

  // ── 修正：補兵 = 给我方部队补员 ─────────────────────────────────────
  // 先按脚本直证名单判（数据被改坏也仍然正确），再用 ATTRIB 标签兜底（覆盖将来新增条目）。
  if (isHealTroopSeq(seq)) return 'heal-troop';
  if (attrib.includes('補兵') || attrib.includes('补兵')) return 'heal-troop';

  // ── 旧逻辑的兜底，逐字保留 ───────────────────────────────────────────
  if (typeof m.ATTACK !== 'number') return 'unknown';
  return m.ATTACK >= 40 ? 'aoe' : 'strike';
}
