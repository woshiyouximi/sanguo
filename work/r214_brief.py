import io

p = 'F:\\sanguo\\project\\44_\u4ea4\u63a5\u7b80\u62a5.md'
lines = io.open(p, encoding='utf-8').read().split('\n')

if lines and lines[0].startswith('# '):
    lines[0] = '# \u4ea4\u63a5\u7b80\u62a5 \u00b7 \u7b2c 214 \u8f6e\uff082026-11-26 09:35\uff09'

for i, line in enumerate(lines):
    if line.startswith('## 0.'):
        for j in range(i + 1, min(i + 6, len(lines))):
            if lines[j].strip():
                lines[j] = ('\u3010R214\u3011\u539f\u751f\u5305\u9ed1\u5c4f\u4e0e\u300c\u65b0\u5c40\u8bef\u5f39\u62db\u964d\u300d\u5df2\u4fee'
                            '\uff08`project/214`\uff0cAPK 1.9 \u5b9e\u673a\u9a8c\u8bc1\uff09\uff1b'
                            '\u5df2\u77e5\u672a\u4fee\uff1a\u653b\u57ce\u6218\u7f16\u6210\u5c4f\u4e3b\u5c06\u663e\u793a\u6210\u5b88\u65b9\u3001\u51fa\u5f81\u53ea\u5e26 5 \u5175\u3002\n\n'
                            + lines[j])
                break
        break

if 'project/214' not in '\n'.join(lines):
    lines.append('')
    lines.append('- `214` \u539f\u751f\u5305\u9ed1\u5c4f\u4e0e\u62db\u964d\u8bef\u5f39\uff08R214\uff09')

io.open(p, 'w', encoding='utf-8', newline='\n').write('\n'.join(lines))
print('ok', len(lines))
