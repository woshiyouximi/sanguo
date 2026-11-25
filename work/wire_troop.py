import pathlib
p = pathlib.Path(r'F:\sanguo\game\web\main.js')
t = p.read_text(encoding='utf-8')
old = """    bTroop: Number(el.troopB.value),
    bForm: Number(el.formB.value),"""
new = """    bTroop: num('btroop', Number(el.troopB.value)),
    bForm: num('bform', Number(el.formB.value)),"""
assert old in t
t = t.replace(old, new)
old2 = """    aTroop: Number(el.troopA.value),
    aForm: Number(el.formA.value),"""
new2 = """    aTroop: num('troop', Number(el.troopA.value)),
    aForm: num('form', Number(el.formA.value)),"""
assert old2 in t
t = t.replace(old2, new2)
p.write_text(t, encoding='utf-8')
print('troop/form params')
