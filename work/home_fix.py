import pathlib
p = pathlib.Path(r'F:\sanguo\game\web\campaign.html')
c = p.read_text(encoding='utf-8')
c = c.replace("""'&from=' + encodeURIComponent(HOME_FOR_DEPLOY())""",
              """'&from=' + encodeURIComponent((save.owned && save.owned[0]) || selected)""")
c = c.replace("""'./deploy.html?city=' + encodeURIComponent(a.to) + '&from=march'""",
              """'./deploy.html?city=' + encodeURIComponent(a.to) + '&from=' + encodeURIComponent(a.from)""")
p.write_text(c, encoding='utf-8')
print('fixed')
