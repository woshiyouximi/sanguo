import json, os
d = json.load(open(r'F:\sanguo\extract\json\xls_群英2.json', encoding='utf-8'))
rows = d['rows']
hdr = d['header']
# 剧本1（黄巾之乱）字段位置：37 城市 / 38 状态
avail = [r for r in rows if str(r[37]).strip() not in ('', 'None')]
print('剧本1可用人数', len(avail))
def kind(r):
    w, i = r[2], r[3]
    if w >= 80 and i < 60: return '猛将'
    if i >= 80 and w < 60: return '谋士'
    if w >= 75 and i >= 75: return '帅才'
    if w >= 60 or i >= 60: return '战将'
    return '偏将'
def aura(k):
    return {'猛将':'威猛压迫，怒目，重甲','谋士':'清瘦儒雅，长须，羽扇或书卷','帅才':'沉稳内敛，甲胄半披，佩剑','战将':'精悍干练，轻甲','偏将':'朴素实用，布甲'}[k]
def main_color(k):
    return {'猛将':'#8C2B1E 血褐','谋士':'#2E3A45 玄青','帅才':'#3A3F4A 铁灰','战将':'#4A3B2A 土褐','偏将':'#5A5F55 灰绿'}[k]
sel = sorted(avail, key=lambda r: -(r[2]+r[3]))[:40]
out = []
out.append('# 角色卡 · 首版 40 将（黄巾之乱）\n')
out.append('> 由 `extract/json/xls_群英2.json` 的剧本 1 出场武将按"武力+智力"取前 40，定位/气质/主色为**自动推导的初稿**，需主策复核。\n')
out.append('> 每行的"气质/主色/标志物"直接填进 `03 §8` 的 prompt 模板槽位。\n')
out.append('| # | 姓名 | 武 | 智 | 定位 | 气质关键词 | 甲胄主色 | 标志物（可换） |')
out.append('|---|---|---|---|---|---|---|---|')
for n, r in enumerate(sel, 1):
    k = kind(r); sk = str(r[5]).strip() or '—'
    out.append('| %d | %s | %d | %d | %s | %s | %s | 必杀技「%s」 |' % (
        n, r[1], r[2], r[3], k, aura(k), main_color(k), sk))
out.append('')
out.append('## prompt 模板（配合本机 Qwen-Image 2.1）\n')
out.append('```text')
out.append('【主体】三国时期男性武将半身立绘，竖构图，{年龄}岁，{气质关键词}，')
out.append('身披{甲胄描述}，主色 {主色}，{标志物或兵刃}，')
out.append('【构图】半身，视线略低于镜头，画面右侧留 15% 负空间给 UI，')
out.append('【风格】新国风厚涂风格，厚实可见的笔触，电影感侧逆光，高级灰调，暗色背景，高细节，画面干净')
out.append('【负面】低质量，模糊，多余手指，畸形手，文字，水印，logo，多人，二次元大眼，赛璐璐平涂')
out.append('```')
out.append('')
out.append('## 一致性工具（必须固定）\n')
out.append('- 同一批用**同一 seed 族**（如 1000–1007），只改主体槽位；')
out.append('- 色板锁定 12 色（见 `03 §2`），prompt 里写死主色 HEX；')
out.append('- 出图后统一走一次"调色层 + 笔触叠层"，把 AI 图拉到同一色调，再交人工精修。')
p = r'F:\sanguo\project\art_ref\角色卡_40将.md'
open(p, 'w', encoding='utf-8').write('\n'.join(out))
print('written', p, len(out), 'lines')
print('\n'.join(out[:8]))
