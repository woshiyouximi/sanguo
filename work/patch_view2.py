import pathlib
p = pathlib.Path(r'F:\sanguo\game\src\view\battleView.ts')
t = p.read_text(encoding='utf-8')

# 1) drawActors 带上 atlas
t = t.replace("  drawActors(out, world, camX);", "  drawActors(out, world, camX, opts.atlas ?? null);")
t = t.replace("function drawActors(out: DrawCmd[], world: World, camX: number): void {",
              "function drawActors(out: DrawCmd[], world: World, camX: number, atlas: SpriteAtlas | null): void {")
t = t.replace("    else drawSoldier(out, world, a.u, a.x, a.y);",
              "    else drawSoldier(out, world, a.u, a.x, a.y, atlas);")

# 2) drawSoldier 增加序列帧分支
old_head = """function drawSoldier(out: DrawCmd[], u: Unit, x: number, y: number): void {
  const dir = u.side === 'A' ? -1 : 1; // 我方朝上（屏幕 y 减小），敌方朝下
  const fx = Math.round(x);
  const fy = Math.round(y);

  E(out, fx, fy + 13, 12, 4, COLORS.shadow);"""
new_head = """function drawSoldier(
  out: DrawCmd[],
  world: World,
  u: Unit,
  x: number,
  y: number,
  atlas: SpriteAtlas | null,
): void {
  const dir = u.side === 'A' ? -1 : 1; // 我方朝上（屏幕 y 减小），敌方朝下
  const fx = Math.round(x);
  const fy = Math.round(y);

  E(out, fx, fy + 13, 12, 4, COLORS.shadow);

  // 有图集就画真序列帧：我方=背视、敌方=正视；同一 tick 内按单位 id 错开相位，
  // 否则 100 个兵会完全同步踏步（一眼假）。
  if (atlas) {
    const set = u.side === 'A' ? atlas.back : atlas.front;
    if (set.length > 0) {
      const hold = atlas.hold ?? 5;
      const phase = (u.id ?? 0) * 3 + Math.floor(world.tick / hold);
      const name = set[((phase % set.length) + set.length) % set.length]!;
      const f = atlas.frames[name];
      if (f) {
        const w = 66;
        const h = (f.h / f.w) * w;
        out.push({
          kind: 'sprite',
          img: atlas.img,
          sx: f.x, sy: f.y, sw: f.w, sh: f.h,
          x: fx, y: fy + 26,
          w, h,
        });
        return;
      }
    }
  }"""
assert old_head in t
t = t.replace(old_head, new_head)

# 3) execute 支持 sprite
old_exec = """function execute(ctx: CanvasRenderingContext2D, c: DrawCmd): void {
  ctx.save();
  ctx.globalAlpha = c.alpha ?? 1;"""
new_exec = """function execute(ctx: CanvasRenderingContext2D, c: DrawCmd): void {
  ctx.save();
  ctx.globalAlpha = c.alpha ?? 1;
  if (c.kind === 'sprite') {
    // x,y 是脚底中心：绘制矩形左上角 = (x - w/2, y - h)
    ctx.drawImage(c.img, c.sx, c.sy, c.sw, c.sh, c.x - c.w / 2, c.y - c.h, c.w, c.h);
    ctx.restore();
    return;
  }"""
assert old_exec in t
t = t.replace(old_exec, new_exec)
p.write_text(t, encoding='utf-8')
print('drawSoldier + execute patched')
