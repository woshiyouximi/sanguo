import io

p = r'F:\sanguo\game\cocos\assets\scripts\CampaignRoot.ts'
s = io.open(p, encoding='utf-8').read()

old = "@ccclass('CampaignRoot')\n/**\n * \u5287\u672c\u8d77\u59cb\u897f\u5143\u5e74"
new = "/**\n * \u5287\u672c\u8d77\u59cb\u897f\u5143\u5e74"
assert s.count(old) == 1, ('old count', s.count(old))
s = s.replace(old, new)

old2 = "\nexport class CampaignRoot extends Component {"
assert s.count(old2) == 1, ('old2 count', s.count(old2))
s = s.replace(old2, "\n@ccclass('CampaignRoot')\nexport class CampaignRoot extends Component {")

io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('ok')
