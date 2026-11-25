import pathlib
# fix Unit.id -> 位置派生相位
p = pathlib.Path(r'F:\sanguo\game\src\view\battleView.ts')
t = p.read_text(encoding='utf-8')
t = t.replace("      const phase = (u.id ?? 0) * 3 + Math.floor(world.tick / hold);",
              "      // Unit 没有 id：用初始格位派生一个稳定的相位偏移（同一格永远同一相位）\n      const phase = Math.floor(u.x * 7 + u.y * 13) + Math.floor(world.tick / hold);")
p.write_text(t, encoding='utf-8')
print('phase fixed')

# main.js：在 state 定义后插 loader，并把 atlas 加入 viewOptions
m = pathlib.Path(r'F:\sanguo\game\web\main.js')
s = m.read_text(encoding='utf-8')
s = s.replace("function viewOptions() {\n  return {", "function viewOptions() {\n  return {\n    atlas: state.atlas,")
anchor = "const world = createWorld({"
assert anchor in s
loader = """// 序列帧图集（可选）：game/web/anim/atlas.json + atlas_00.png。
// 有就画真兵，没有（file:// 下 fetch 被拦、或图集未生成）就自动退回色块。
(function loadAtlas() {
  if (typeof fetch !== 'function') return;
  fetch('anim/atlas.json')
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error('no atlas'))))
    .then((j) => {
      const img = new Image();
      img.onload = () => {
        const frames = {};
        const back = [];
        const front = [];
        for (const sp of j.pages[0].sprites) {
          frames[sp.name] = { x: sp.x, y: sp.y, w: sp.w, h: sp.h };
          if (sp.name.startsWith('walk_back')) back.push(sp.name);
          if (sp.name.startsWith('walk_front')) front.push(sp.name);
        }
        back.sort();
        front.sort();
        state.atlas = { img, frames, back, front, hold: 5 };
        draw();
      };
      img.src = 'anim/atlas_00.png';
    })
    .catch(() => {});
})();

"""
s = s.replace(anchor, loader + anchor, 1)
m.write_text(s, encoding='utf-8')
print('main.js patched, atlas in opts:', 'atlas: state.atlas' in s)
