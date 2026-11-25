# battleView.ts 缺口 hunk（代码为 ASCII，可直接抄；注释里的中文是乱码，请重写）


## ViewOptions.units 字段  （corrupt 第 221 行起，共 3 行）

```ts

  units?: UnitsAtlas | null;
  /** 姝﹀皢鎶€鐗规晥鍥鹃泦锛堝彲閫夛級锛氭湁瀵瑰簲鐩綍灏辩敾鍘熶綔甯э紝娌℃湁灏遍€€鍥炶櫄绾垮湀 */
  fx?: FxAtlas | null;
```


## import unitFrames  （corrupt 第 28 行起，共 3 行）

```ts

import { pickUnitFrames, type UnitsAtlas } from './unitFrames.ts';
import {
  BTN_ASSAULT,
```


## drawActors 调用点（buildFrame 内）  （corrupt 第 493 行起，共 3 行）

```ts

  drawActors(out, world, camX, opts.atlas ?? null, opts.units ?? null);
  // 鐗规晥鐢诲湪鍏典箣涓婏細鍘熶綔閲屾灏嗘妧鏄洊鍦ㄦ垬鍦轰笂鐨勶紝鍙犲湪鏈€搴曞眰浼氳 100 涓叺鎸′綇
  drawFx(out, world, camX, opts.fx ?? null);
```


## function drawActors  （corrupt 第 580 行起，共 28 行）

```ts

function drawActors(
  out: DrawCmd[],
  world: World,
  camX: number,
  atlas: SpriteAtlas | null,
  units: UnitsAtlas | null,
): void {
  const actors: { u: Unit; x: number; y: number }[] = [];
  for (const u of world.units) {
    // 鍙湁銆屾湁鍔ㄤ綔甯х殑閭ｄ竴渚с€嶆墠鐢绘浜＄獥鍙ｏ紝鍚﹀垯灏镐綋鍙墿涓€涓奖瀛愶紱
    // 涓诲皢鍚岀悊锛屼絾瀹冪殑姝讳骸甯ф潵鑷?anim/general 鍥鹃泦锛屾病鍥鹃泦鏃朵粛鏃ц蛋"闃典骸鍗冲墧闄?銆?
    const dying = isDying(u, world) && usesActionFrames(u);
    if (!u.alive && !dying && !generalDying(world, u)) continue;
    const p = project(u.x, u.y, camX);
    if (p.y < FIELD_TOP - 80 || p.y > FIELD_BOTTOM + 80) continue;
    actors.push({ u, x: p.x, y: p.y });
  }
  // 杩滆€咃紙worldX 灏忥紝灞忓箷涓婃柟锛夊厛鐢伙紱鍚屾繁搴︽椂澹叺鍏堛€佷富灏嗗悗
  actors.sort((a, b) => {
    if (a.u.x !== b.u.x) return a.u.x - b.u.x;
    if (a.u.y !== b.u.y) return a.u.y - b.u.y;
    return uGeneral(a.u) === uGeneral(b.u) ? 0 : uGeneral(a.u) ? 1 : -1;
  });
  for (const a of actors) {
    if (uGeneral(a.u)) drawGeneral(out, world, a.u, a.x, a.y);
    else drawSoldier(out, world, a.u, a.x, a.y, atlas, units);
  }
}
```


## function drawSoldier  （corrupt 第 613 行起，共 67 行）

```ts

function drawSoldier(
  out: DrawCmd[],
  world: World,
  u: Unit,
  x: number,
  y: number,
  atlas: SpriteAtlas | null,
  units: UnitsAtlas | null,
): void {
  const dir = u.side === 'A' ? -1 : 1; // 鎴戞柟鏈濅笂锛堝睆骞?y 鍑忓皬锛夛紝鏁屾柟鏈濅笅
  const fx = Math.round(x);
  const fy = Math.round(y);

  E(out, fx, fy + 13, 12, 4, COLORS.shadow);

  // 鍏电鍥鹃泦锛坲nits.json锛夊厛閫夊锛氬紦/寮?鈫?archer 缁勶紙鎷夊紦锛夛紝鍏朵綑鍏电杩斿洖 null銆?
  // 鍥鹃泦娌℃媺涓嬫潵 / 鍥炬病 onload / 缁勭己澶辨椂杩欓噷鍚屾牱鏄?null锛屼笅闈㈣€佽矾寰勫師鏍峰厹搴曘€?
  const set = pickUnitFrames(world, u, { units });

  // 鑳岃鍔ㄤ綔甯э紙鏀诲嚮/鍙楀嚮/姝讳骸锛夛細鏈夊氨鐢诲畬鐩存帴杩斿洖锛屽惁鍒欓€€鍥炶蛋璺簭鍒?/ 鑹插潡銆?
  // 渚嬪锛氬紦鍏佃嚜甯︽媺寮撳抚锛岃€?animSelect 鐨?attack_back 鏄湸鍒€鎸ョ爫鐨勮儗瑙嗗抚锛?
  // 璁╁畠鎺ョ鍑烘墜鍚庣殑 10 tick 灏辨垚銆屾媺寮撴媺鍒颁竴鍗婄獊鐒舵崲鍒€銆嶁€斺€旀墍浠ユ湁鑷湁鏀诲嚮甯ф椂
  // 璁╁紑鏀诲嚮绐楀彛锛堝彈鍑?/ 闃典骸浠嶈蛋鍔ㄤ綔甯э級銆?
  const act0 = pickActionFrame(u, world, actionAtlas);
  const act = set && set.attack.length > 0 && act0?.key === 'attack_back' ? null : act0;
  if (pushActionSprite(out, act, fx, fy)) return;
  if (!u.alive) return; // 姝讳骸绐楀彛鍐呬絾鍥鹃泦娌″姞杞藉ソ锛氬埆鐢荤珯鐫€鐨勫案浣?

  // 鐢荤湡搴忓垪甯э紝涓夌骇闄嶇骇锛氬叺绉嶅浘闆?鈫?鑰佸浘闆嗭紙walk_back / walk_front锛夆啋 鑹插潡銆?
  // 鎴戞柟=鑳岃銆佹晫鏂?姝ｈ锛涘悓涓€ tick 鍐呮寜鍗曚綅鏍间綅閿欏紑鐩镐綅锛屽惁鍒?100 涓叺浼氬畬鍏ㄥ悓姝?
  // 韪忔锛堜竴鐪煎亣锛夈€?
  if (
    set &&
    pushSpriteFrames(out, set.img, units?.frames ?? {}, set.frames, set.attack, u, world.tick, set.hold, fx, fy, true)
  ) {
    return;
  }
  if (atlas) {
    const img = u.side === 'A' ? atlas.img : (atlas.imgEnemy ?? atlas.img);
    const walk = u.side === 'A' ? atlas.back : atlas.front;
    // 鑰佸浘闆嗙殑鏀诲嚮甯у彧鏈夋瑙嗕竴濂椼€佷袱渚у叡鐢紱A 渚у嚭鎵嬮偅娈靛凡琚?animSelect 鐨勫姩浣滃抚鎺ョ
    const hold = atlas.hold ?? 5;
    if (pushSpriteFrames(out, img, atlas.frames, walk, atlas.attack ?? [], u, world.tick, hold, fx, fy, !usesActionFrames(u))) {
      return;
    }
  }
  R(out, fx - 11, fy - 16, 22, 32, sideDark(u.side), {
    radius: 3,
    stroke: withAlpha(COLORS.black, 0.55),
    width: 1,
  });
  R(out, fx - 8, fy - 13, 16, 26, sideColor(u.side), { radius: 2 });
  R(out, fx - 8, fy - 13, 16, 6, sideLight(u.side), { radius: 2, alpha: 0.38 });
  // 鏈濆悜缂哄彛锛氫笁瑙掑舰姘歌繙鍦?鏈濆墠"鐨勯偅鏉¤竟涓?
  P(
    out,
    [
      { x: fx - 5, y: fy + dir * 16 },
      { x: fx + 5, y: fy + dir * 16 },
      { x: fx, y: fy + dir * 23 },
    ],
    sideLight(u.side),
    { alpha: 0.95 },
  );
  // 姝﹀櫒锛氫竴鏍圭煭鏂滅嚎锛屾í灞?绔栧睆閮戒笉鏀归€昏緫锛屽彧澧炲姞鍓奖杈ㄨ瘑
  LN(out, fx + 9, fy - 2, fx + 14, fy - 18, withAlpha(COLORS.goldLight, 0.55), 1.5);
}
```


## function pushSpriteFrames  （corrupt 第 691 行起，共 38 行）

```ts

function pushSpriteFrames(
  out: DrawCmd[],
  img: CanvasImageSource,
  rects: Record<string, SpriteFrame>,
  walk: string[],
  atk: string[],
  u: Unit,
  tick: number,
  hold: number,
  fx: number,
  fy: number,
  allowSwing: boolean,
): boolean {
  if (walk.length === 0) return false;
  const swinging = allowSwing && atk.length > 0 && u.cd > 96;
  const seq = swinging ? atk : walk;
  let idx: number;
  if (swinging) {
    idx = Math.min(atk.length - 1, Math.max(0, Math.floor((120 - u.cd) / (24 / atk.length))));
  } else {
    const phase = Math.floor(u.x * 7 + u.y * 13) + Math.floor(tick / Math.max(1, hold));
    idx = ((phase % seq.length) + seq.length) % seq.length;
  }
  const name = seq[idx];
  if (name === undefined) return false;
  const f = rects[name];
  if (!f) return false;
  const w = 66;
  const h = (f.h / f.w) * w;
  out.push({
    kind: 'sprite',
    img,
    sx: f.x, sy: f.y, sw: f.w, sh: f.h,
    x: fx, y: fy + 26,
    w, h,
  });
  return true;
}
```


## function drawGeneral  （corrupt 第 730 行起，共 92 行）

```ts

function drawGeneral(out: DrawCmd[], world: World, u: Unit, x: number, y: number): void {
  const fx = Math.round(x);
  const fy = Math.round(y);
  const side = u.side;
  const g = world.sides[side].general;
  const dir = side === 'A' ? -1 : 1;
  const name = g.name || (side === 'A' ? '鎴戣粛涓诲皣' : '鏁佃粛涓诲皣');
  // 涓诲皢涓庡＋鍏靛叡鐢ㄥ悓涓€鏉″湴闈㈢嚎锛歱ushSpriteFrames 鎶婂＋鍏电殑鑴氭斁鍦?fy+26
  const gy = fy + 26;

  // 鍘熶綔姝﹀皢灏忎汉锛堝潗楠?鈫?韬綋 鈫?鍏靛櫒锛夈€傚浘闆嗘病灏辩华 / 閫犲瀷缂哄け / 椤甸潰娌¤В鐮佸畬 鈫?null锛?
  // 涓嬮潰鏁村潡閫€鍥炲師鏉ョ殑鐭㈤噺灏忎汉锛岀敾闈笉浼氱┖銆?
  const layers = generalLayers(world, u, fx, gy);

  // 鑴氫笅鍏夌幆 + 闃村奖
  E(out, fx, gy + 2, layers ? 66 : 28, layers ? 15 : 9, withAlpha(COLORS.black, 0.35));
  E(out, fx, gy, layers ? 64 : 26, layers ? 14 : 9, undefined, {
    stroke: withAlpha(COLORS.gold, 0.55),
    width: 1.5,
  });
  // 鏃楋紙鏈夊浘闆嗘椂鎸埌鍧愰獞澶栦晶锛屼笉鐒朵細鎻掑湪椹韩涓婏級
  const flagX = fx + (layers ? 64 : 25);
  const flagTop = gy - (layers ? 104 : 50);
  LN(out, flagX, flagTop, flagX, gy - 6, withAlpha(COLORS.gold, 0.65), 2);
  P(
    out,
    [
      { x: flagX, y: flagTop },
      { x: flagX + 14, y: flagTop + 6 },
      { x: flagX, y: flagTop + 12 },
    ],
    sideColor(side),
    { alpha: 0.9 },
  );

  if (layers) {
    // 涓夊眰 sprite锛歚(x, y)` 鏄剼搴曢敋鐐癸紝execute() 浼氭寜 (x - w/2, y - h) 璐村乏涓婅
    for (const L of layers) {
      out.push({
        kind: 'sprite',
        img: L.img,
        sx: L.sx,
        sy: L.sy,
        sw: L.sw,
        sh: L.sh,
        x: L.x,
        y: L.y,
        w: L.w,
        h: L.h,
      });
    }
  } else {
    // ---- 闄嶇骇锛氬師鏉ョ殑鐭㈤噺灏忎汉锛堝浘闆?404 / 鏈В鐮?/ 鏃犳閫犲瀷鏃舵墠璧板埌杩欓噷锛?----
    // 韬綋
    R(out, fx - 18, fy - 24, 36, 48, sideDark(side), {
      radius: 4,
      stroke: withAlpha(COLORS.gold, 0.75),
      width: 2,
    });
    R(out, fx - 14, fy - 20, 28, 40, sideColor(side), { radius: 3 });
    // 鏈濆悜缂哄彛
    P(
      out,
      [
        { x: fx - 7, y: fy + dir * 24 },
        { x: fx + 7, y: fy + dir * 24 },
        { x: fx, y: fy + dir * 33 },
      ],
      COLORS.gold,
      { alpha: 0.95 },
    );
    // 鑳稿墠鑿卞舰灏嗗窘
    P(
      out,
      [
        { x: fx, y: fy - 12 },
        { x: fx + 7, y: fy },
        { x: fx, y: fy + 12 },
        { x: fx - 7, y: fy },
      ],
      withAlpha(COLORS.goldLight, 0.9),
    );
  }

  T(out, fx, layers ? gy - 158 : fy - 36, name, 13, COLORS.gold, {
    align: 'center',
    stroke: withAlpha(COLORS.black, 0.8),
    strokeWidth: 3,
    bold: true,
  });
  bar(out, fx - 25, layers ? gy + 10 : fy + 28, 50, 4, g.maxHp > 0 ? g.hp / g.maxHp : 0, COLORS.heal);
}
```


## attack_back 相关行（第 633 行）

```ts
  // 渚嬪锛氬紦鍏佃嚜甯︽媺寮撳抚锛岃€?animSelect 鐨?attack_back 鏄湸鍒€鎸ョ爫鐨勮儗瑙嗗抚锛?
```


## attack_back 相关行（第 637 行）

```ts
  const act = set && set.attack.length > 0 && act0?.key === 'attack_back' ? null : act0;
```
