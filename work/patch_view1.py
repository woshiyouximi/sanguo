import pathlib
p = pathlib.Path(r'F:\sanguo\game\src\view\battleView.ts')
t = p.read_text(encoding='utf-8')

# 1) SpriteCmd 接口 + 并入联合类型
anchor = "export type DrawCmd = RectCmd | LineCmd | PolyCmd | EllipseCmd | TextCmd;"
assert anchor in t
sprite_type = """export interface SpriteCmd {
  kind: 'sprite';
  img: CanvasImageSource;
  /** 源矩形（图集内像素） */
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  /** 目标矩形：x,y 是脚底中心（与色块单位同一锚点），w/h 是绘制尺寸 */
  x: number;
  y: number;
  w: number;
  h: number;
  alpha?: number;
}

"""
t = t.replace(anchor, sprite_type + "export type DrawCmd = RectCmd | LineCmd | PolyCmd | EllipseCmd | TextCmd | SpriteCmd;")

# 2) ViewOptions 增加 atlas
t = t.replace("""  aLabel?: string;
  bLabel?: string;
}""", """  aLabel?: string;
  bLabel?: string;
  /** 序列帧图集（可选）。给了就用真序列帧画士兵，否则退回色块 */
  atlas?: SpriteAtlas | null;
}

export interface SpriteFrame {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SpriteAtlas {
  img: CanvasImageSource;
  /** 'walk_back_00' ~ 'walk_front_16' 之类，键名与 atlas.json 一致 */
  frames: Record<string, SpriteFrame>;
  /** 我方用背视、敌方用正视 */
  back: string[];
  front: string[];
  /** 每帧停留的 tick 数（30Hz 下 5 ≈ 6fps） */
  hold?: number;
}""")

# 3) drawActors 传 opts
t = t.replace("""  for (const a of actors) {
    if (uGeneral(a.u)) drawGeneral(out, world, a.u, a.x, a.y);
    else drawSoldier(out, a.u, a.x, a.y);
  }""",
"""  for (const a of actors) {
    if (uGeneral(a.u)) drawGeneral(out, world, a.u, a.x, a.y);
    else drawSoldier(out, world, a.u, a.x, a.y);
  }""")
t = t.replace("function drawActors(out: DrawCmd[], world: World, camX: number): void {",
              "function drawActors(out: DrawCmd[], world: World, camX: number): void {")
p.write_text(t, encoding='utf-8')
print('types patched')
