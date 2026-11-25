import pathlib
p = pathlib.Path(r'F:\sanguo\game\web\main.js')
t = p.read_text(encoding='utf-8')
old = """function viewOptions() {"""
new = """function loadPortrait() {
  const name = (state.world && state.world.sides.A.general.name) || '';
  if (!name) return null;
  if (state.portraitName === name) return state.portrait;
  state.portraitName = name;
  state.portrait = null;
  const img = new Image();
  img.onload = () => {
    if (state.portraitName === name) {
      state.portrait = { img, w: img.naturalWidth, h: img.naturalHeight };
      draw();
    }
  };
  img.src = 'assets/hero/' + encodeURIComponent(name) + '.png';
  return null;
}

function viewOptions() {"""
assert old in t
t = t.replace(old, new, 1)
old2 = """  return { atlas: state.atlas, aiSides: { A: false, B: true } };"""
if old2 in t:
    t = t.replace(old2, """  return { atlas: state.atlas, portrait: loadPortrait(), aiSides: { A: false, B: true } };""", 1)
else:
    # 兜底：找 atlas 传参处
    pass
p.write_text(t, encoding='utf-8')
print('main portrait')
