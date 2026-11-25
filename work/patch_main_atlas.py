import pathlib
p = pathlib.Path(r'F:\sanguo\game\web\main.js')
t = p.read_text(encoding='utf-8')

anchor = "function viewOptions() {\n  return {"
assert anchor in t
t = t.replace(anchor, "function viewOptions() {\n  return {\n    atlas: state.atlas,")

# 在 state 初始化后加载图集
boot_anchor = "  const world = createWorld({ data: DATA, seed, a: A, b: B });"
assert boot_anchor in t
loader = """  // 可选序列帧图集：game/web/anim/atlas.json + atlas_00.png
  // 有就画真兵，没有就退回色块（离线/单文件打开也不会崩）
  (function loadAtlas() {
    fetch('anim/atlas.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('no atlas'))))
      .then((j) => {
        const img = new Image();
        img.onload = () => {
          const frames = {};
          const back = [];
          const front = [];
          for (const s of j.pages[0].sprites) {
            frames[s.name] = { x: s.x, y: s.y, w: s.w, h: s.h };
            if (s.name.startsWith('walk_back')) back.push(s.name);
            if (s.name.startsWith('walk_front')) front.push(s.name);
          }
          back.sort(); front.sort();
          state.atlas = { img, frames, back, front, hold: 5 };
          draw();
        };
        img.src = 'anim/atlas_00.png';
      })
      .catch(() => { /* 没有图集就用色块 */ });
  })();

"""
t = t.replace(boot_anchor, loader + boot_anchor, 1)
p.write_text(t, encoding='utf-8')
print('main.js atlas loader patched')
