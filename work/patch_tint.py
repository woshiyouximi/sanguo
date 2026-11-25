import pathlib
v = pathlib.Path(r'F:\sanguo\game\src\view\battleView.ts')
t = v.read_text(encoding='utf-8')
t = t.replace("""export interface SpriteAtlas {
  img: CanvasImageSource;""", """export interface SpriteAtlas {
  img: CanvasImageSource;
  /** 敌方染色版图集（同一布局）。原作两军靠甲色区分，这里不重画、只换色 */
  imgEnemy?: CanvasImageSource;""")
t = t.replace("""          kind: 'sprite',
          img: atlas.img,""", """          kind: 'sprite',
          img: u.side === 'A' ? atlas.img : (atlas.imgEnemy ?? atlas.img),""")
v.write_text(t, encoding='utf-8')
print('view: imgEnemy added')

m = pathlib.Path(r'F:\sanguo\game\web\main.js')
s = m.read_text(encoding='utf-8')
old = """        back.sort();
        front.sort();
        state.atlas = { img, frames, back, front, hold: 5 };"""
new = """        back.sort();
        front.sort();
        // 敌方染成赤色（原作：两军只差甲色，形态一致）。做法是把整页图集按
        // 'source-atop' 刷一层红，保持完全相同的帧矩形，零额外素材。
        let imgEnemy = img;
        try {
          const cv = document.createElement('canvas');
          cv.width = img.naturalWidth || img.width;
          cv.height = img.naturalHeight || img.height;
          const cx = cv.getContext('2d');
          cx.drawImage(img, 0, 0);
          cx.globalCompositeOperation = 'source-atop';
          cx.fillStyle = 'rgba(196, 58, 48, 0.55)';
          cx.fillRect(0, 0, cv.width, cv.height);
          imgEnemy = cv;
        } catch (err) { /* 染色失败就用原图 */ }
        state.atlas = { img, imgEnemy, frames, back, front, hold: 5 };"""
assert old in s
s = s.replace(old, new)
m.write_text(s, encoding='utf-8')
print('main.js: tinted enemy atlas')
