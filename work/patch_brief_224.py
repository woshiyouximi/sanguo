import io, re, sys

BRIEF = r'F:\sanguo\project\44_交接简报.md'
SEC = r'F:\sanguo\work\brief_224_section.md'

s = io.open(BRIEF, encoding='utf-8').read()
sec = io.open(SEC, encoding='utf-8').read().strip('\n')

# 1) 标题
s = re.sub(r'^# 交接简报 · 第 223 轮.*$', '# 交接简报 · 第 224 轮（2026-11-26 14:00）', s, count=1, flags=re.M)

# 2) §0 第一行（R214 那句）换成 R224
old9 = '【R214】原生包黑屏与「新局误弹招降」已修（`project/214`，APK 1.9 实机验证）；已知未修：攻城战编成屏主将显示成守方、出征只带 5 兵。'
new9 = ('【R224】面板按钮全灭的根因是 `BlockInputEvents` 吞掉全局 input（不是坐标），已修并出 **2.9**；'
        '`roster.ts` 收编成单源（SKIP_FILES 清空）；189 剧本复活张角已修；调试痕迹门禁 `work/check_devtools.mjs` 上线。'
        '编成主将变守方、出征只带 5 兵已在 R223 修掉。详见本文档 §217。')
if old9 in s:
    s = s.replace(old9, new9, 1)

# 3) 追加第 217 节（若已存在则替换）
if '\n## 217. 第 224 轮增量' in s:
    s = s.split('\n## 217. 第 224 轮增量')[0].rstrip('\n') + '\n\n' + sec + '\n'
else:
    s = s.rstrip('\n') + '\n\n' + sec + '\n'

io.open(BRIEF, 'w', encoding='utf-8', newline='\n').write(s)
print('brief lines =', len(s.split('\n')))
