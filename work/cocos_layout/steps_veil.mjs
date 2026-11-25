export default async ({ evaluate, send, sleep, shot, log }) => {
  await send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
  await send('Page.setWebLifecycleState', { state: 'active' }).catch(() => {});
  const r = await evaluate(`(() => {
    const canvas = cc.director.getScene().getChildByName('Canvas');
    const veil = canvas.children.find((n) => n.name === 'CampaignVeil');
    const scr = canvas.children.find((n) => n.name === 'CampaignVeilScreen');
    const desc = (n) => {
      if (!n) return null;
      const sp = n.getComponent('cc.Sprite');
      const g = n.getComponent('cc.Graphics');
      const t = n.getComponent('cc.UITransform');
      return {
        name: n.name, active: n.active, pos: [n.position.x, n.position.y], kids: n.children.length,
        sp: sp ? { frame: sp.spriteFrame ? sp.spriteFrame.name : null, sizeMode: sp.sizeMode, type: sp.type, color: [sp.color.r, sp.color.g, sp.color.b, sp.color.a] } : null,
        graphics: !!g,
        size: t ? [t.width, t.height] : null,
        comps: n.components.map((c) => c.constructor.name),
      };
    };
    return {
      active: canvas.children.filter((n) => n.active).map((n) => n.name),
      veil: desc(veil), veilScreen: desc(scr),
      panelActive: (canvas.children.find((n) => n.name === 'CityPanel') || { active: 'absent' }).active,
    };
  })()`);
  log(JSON.stringify(r, null, 1));
  return r;
};

