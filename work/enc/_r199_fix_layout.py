# R199 layout.ts 注释修复：以 work/persp2/repair_out/layout.ts 为基底（19:28 用当时的干净
# game/dist/view/layout.js 做 oracle 回填过的版本，0 个 U+FFFD、代码行与原文件逐字节相同），
# 只把那 22 行残留 @@R198FIX@@ 占位符按「上下文 + 旧副本 + core/field.ts 真值」改写。
# 代码行一行不动：本脚本只替换占位符所在的注释行，最后再逐字节核对非注释行。
# 显式 encoding='utf-8'，不用 PowerShell（CP936 是这次事故的根因）。
import io
import sys

sys.stdout.reconfigure(encoding='utf-8')

SRC = r'F:\sanguo\work\persp2\repair_out\layout.ts'
DST = r'F:\sanguo\game\src\view\layout.ts'
BAK = r'F:\sanguo\work\enc\archive\layout.damaged.r199.ts'
MARK = '@@R198FIX@@'

B = ' * '

# repair_out 的 1-based 行号 -> 替换成的行（可多行；缩进原样写在字符串里）
REPL = {
    5: [
        ' *   HUD 100px（y 0..100） / 战场 900px（y 100..1000） / 控制台 334px（y 1000..1334）',
    ],
    9: [
        ' * `sy = 550 + (worldX - camX) * ROW_PX`，所以 **worldX 越大 → 屏幕越靠下**，',
        ' * 我方在下、敌方在上。视图层只做"包一层"，绝不反向。',
    ],
    12: [
        ' * `cellCenter` / `cellRect` 全部转发过去，**逻辑层（core）一行没动**。',
    ],
    13: [
        ' * 本文件不引用 `cc`，也不引用 DOM。 */',
    ],
    52: [
        ' * 一屏可见纵深（行）= 900 / 71.43 = 12.6（依据：project/02 §2.3）——**常数投影时代的数字**，',
    ],
    63: [
        ' * 镜头夹取范围（行）：**R198 起由 `core/field.ts` 反解**（带沿 + 两端精灵身位），',
    ],
    64: [
        ' * 与 `core.camera()` 共用同一个函数，两边不可能再各写一份数字。',
    ],
    65: [
        ' *',
        ' * 旧口径（`CAM_HALF_ROWS = FIELD_H/2/ROW_PX` ≈ 6.3）是**常数投影时代**的半窗，',
    ],
    66: [
        ' * 现在只作 `camera()` 的换镜判据（「两军是否相隔超过一屏」），不再是夹取范围。',
        ' *',
        ' * 新范围 ≈ [6.29, 64.49]（旧 ±6.3 ⇒ [6.30, 63.70]），推导与实测算例见',
        ' * `game/src/core/field.ts` 的 `CAM_MARGIN_FAR_PX` / `CAM_MARGIN_NEAR_PX`。',
        ' */',
    ],
    101: [
        ' * 依据 `work/video_ui_b/B_battle_0842.png`（1280×720）：金牌在顶栏正中，木纹底 + 金边，',
        ' * 里面是中文数字（那一帧是「六十七」）。原尺寸约 100×40 @1280×720 ⇒ 竖屏按 HUD 高（100）',
        ' * 放大到 214×48，左右不压双方兵种文字（左字到 x≈200，右字起于 x≈550）。 */',
    ],
    112: [
        ' * 所以敌将卡只取两块之间的空档：x366..517（我方卡 `GENERAL_INFO` 右边界 → cmd6 左边界），',
        ' * 一块 151 宽的紧凑卡。两块的语义仍按原作镜像：外侧列 = 疲勞/智力，内侧列 = 士氣/武力。',
    ],
    115: [
        '/** 主将卡里两列字段的列距（外侧列 → 内侧列） */',
    ],
    121: [
        ' * 原作每侧是 **「兵 + 體」两条横条 + 两行裸数**（`project/188_录像逐项复核.md` §7：',
    ],
    122: [
        ' * `work/video_ui_b/B_battle_0842.png` 左赵云 `兵 65/96` + `體 10/54`、右曹豹 `44/96` + `5/49`，',
    ],
    130: [
        '  /** 技力（MP）小字：和名字同一行，落在内侧列 */',
    ],
    136: [
        '  /** 四个裸数字：上排 疲勞|士氣、下排 智力|武力（行距 14，字号收到 13 才不叠字） */',
    ],
    142: [
        '/** 主将卡里 兵/體 横条的高度（控制台里除 3px 行动条之外唯一的第二种条） */',
    ],
    145: [
        ' * 兵/體 数值文本的预留宽度：`兵 100/100` 里汉字 16px、数字 9px、斜杠/空格 3px，',
        ' * 条从预留宽度的外侧起画，一路画到卡的另一边（右块镜像 ⇒ 条在文本左边）。',
    ],
    171: [
        '/** 开始 / 结算遮罩 */',
    ],
    197: [
        ' * @param worldY 车道（0..13）',
        ' * @param camX   镜头中心（格）',
    ],
    238: [
        '/** 镜头夹取：与 `core.camera()` **同一个函数**（field.clampCameraX），別再自己 max/min */',
    ],
    251: [
        ' * 需要 `scale`（贴图缩放 / 命中半径折算）的调用方直接用这些，**不要**再自己按',
        ' * `ROW_PX` / `LANE_PX` 线性换算——那就是 R193 之前的常数投影，是这次要消灭的。',
    ],
}

NOTE = [
    '/*',
    ' * R199 修复说明（2026-11-25）：本文件 47 行**中文注释**曾在 19:23 被 `Set-Content`',
    ' * （PS 5.1 默认 ANSI/CP936）写坏成 U+FFFD，**代码一行未损**（tsc + 全量测试通过）。',
    ' * 现已按三路证据重写注释：`work/persp2/repair_out/layout.ts`（19:28 用当时干净 dist',
    ' * 做 oracle 的锚点回填）、`work/o1_probe/game/src/view/layout.ts`（16:11 旧副本）、',
    ' * 以及 `game/src/core/field.ts` 里的 R198 真值。改注释请用 `read`/`write`/`edit`',
    ' * 或 python 显式 utf-8，**不要**对源码用 `Set-Content`；编码守门见',
    ' * `node work/enc/scan_utf8.mjs` 与 `tools/check_encoding.ps1`。',
    ' */',
    '',
]


def is_comment(line: str) -> bool:
    s = line.strip()
    return (not s) or s.startswith('*') or s.startswith('/*') or s.startswith('//')


text = io.open(SRC, encoding='utf-8', newline='').read()
assert '\r\n' not in text, 'expected LF file'
lines = text.split('\n')
if lines and lines[-1] == '':
    lines.pop()

out = []
missed = []
for i, line in enumerate(lines, 1):
    if i in REPL:
        if MARK not in line:
            raise SystemExit('line %d has no marker, abort' % i)
        out.extend(REPL[i])
        continue
    if MARK in line:
        raise SystemExit('unhandled marker at line %d: %r' % (i, line))
    out.append(line)

body = '\n'.join(out) + '\n'
body = '\n'.join(NOTE) + body  # 事故说明换成 R199 修复说明（只动注释）
assert MARK not in body, 'markers left: %d' % body.count(MARK)

io.open(DST, 'w', encoding='utf-8', newline='\n').write(body)

bak = io.open(BAK, encoding='utf-8', newline='').read().split('\n')
code_new = [l for l in body.split('\n') if not is_comment(l)]
code_old = [l for l in bak if not is_comment(l)]

print('written:', DST)
print('lines:', body.count('\n'))
print('U+FFFD:', body.count('\ufffd'))
print('markers:', body.count(MARK))
print('code lines new/old:', len(code_new), len(code_old), 'identical:', code_new == code_old)
if code_new != code_old:
    for a, b in zip(code_new, code_old):
        if a != b:
            print('FIRST DIFF', repr(a), repr(b))
            break
