import pathlib
p = pathlib.Path(r'F:\sanguo\game\web\main.js')
t = p.read_text(encoding='utf-8')
old = """  return {
    atlas: state.atlas,
    camX: state.camX,"""
new = """  return {
    atlas: state.atlas,
    portrait: loadPortrait(),
    camX: state.camX,"""
assert old in t
p.write_text(t.replace(old, new, 1), encoding='utf-8')
print('portrait passed')
