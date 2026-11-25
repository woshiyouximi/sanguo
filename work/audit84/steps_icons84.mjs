// R84：城点图元覆盖率 + 图层顺序（Graphics vs 底图）
export default async function (ctx) {
  const { evaluate, log } = ctx;
  const J = (s) => JSON.parse(s);

  const out = J(await evaluate(`JSON.stringify((() => {
    const scene = cc.director.getScene();
    const canvas = scene.getChildByName('Canvas');
    const comp = canvas.components.find(c => c && c.save && c.cities);
    const tiers = ['1', '2', '3', '4'];
    const res = cc.assetManager.getBundle('res');
    const frameInfo = {};
    for (const t of tiers) {
      const p = 'map/city_' + t;
      let sf = null, img = null;
      try { sf = res.get(p, cc.SpriteFrame); } catch (e) {}
      try { img = res.get(p, cc.ImageAsset); } catch (e) {}
      frameInfo[t] = { sf: !!sf, img: !!img, w: sf ? sf.originalSize.width : (img ? img.width : null) };
    }
    const chinamap = (() => { try { const i = res.get('map/chinamap', cc.ImageAsset); return i ? [i.width, i.height] : null; } catch (e) { return 'throw'; } })();
    // 城点 node 计数
    const icons = [];
    const walk = (n, d) => { if (d > 3) return; if (n.name && n.name.indexOf('CityIcon') === 0) icons.push(n); for (const c of n.children) walk(c, d + 1); };
    walk(canvas, 0);
    const activeIcons = icons.filter(n => n.activeInHierarchy).length;
    // 图层顺序
    const order = canvas.children.map((n, i) => i + ':' + n.name);
    const sample = ['襄平', '成都', '洛陽', '代縣'].map((nm) => {
      const c = comp.cities.find(x => x.NAME === nm);
      return { nm, tier: comp.cityTier ? comp.cityTier.get(nm) : null, own: comp.save.owned.includes(nm), pos: c ? comp.cityScreen.get(nm) : null };
    });
    return { frameInfo, chinamap, icons: icons.length, activeIcons, order, sample,
      cityFrames: comp.cityFrames ? comp.cityFrames.map(f => f ? (f.originalSize.width + 'x' + f.originalSize.height) : null) : 'n/a' };
  })())`));

  log('ICONS=' + JSON.stringify(out));
  return out;
}
