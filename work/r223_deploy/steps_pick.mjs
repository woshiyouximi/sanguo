// 出征编成：注入 6 个候选将，勾选 3 个（含主将），看出阵顺序与勾选态。
const FIND = String.raw`(function(){
  var st=[cc.director.getScene()];
  while(st.length){var n=st.shift(); if(!n) continue;
    if(n.getComponent && n.getComponent('DeployRoot')) return !!n;
    var ch=n.children||[]; for(var i=0;i<ch.length;i++) st.push(ch[i]);
  }
  return false;
})()`;

const SETUP = String.raw`(function(){
  var st=[cc.director.getScene()]; var root=null;
  while(st.length){var n=st.shift(); if(!n) continue;
    var c=n.getComponent && n.getComponent('DeployRoot');
    if(c){root=c;break;}
    var ch=n.children||[]; for(var i=0;i<ch.length;i++) st.push(ch[i]);
  }
  if(!root) return null;
  var names=[['關羽',97,75],['張飛',97,42],['趙雲',96,76],['黃忠',93,60],['馬超',92,44],['魏延',90,50]];
  root.generals = names.map(function(r){ return {NAME:r[0], STR:r[1], INT:r[2]}; });
  root.selectedGen = 0;
  root.queue = [{general:'關羽',troop:'刀',troops:10},{general:'張飛',troop:'槍',troops:10},{general:'趙雲',troop:'弓',troops:10}];
  root.refresh && root.refresh();
  return {queue: root.queue.length, gens: root.generals.length};
})()`;

export default async function steps({ evaluate, shot, sleep, log }) {
  await evaluate(String.raw`(function(){ cc.director.loadScene('Deploy'); return true; })()`, 'load');
  for (let i = 0; i < 40; i += 1) {
    const ok = await evaluate(FIND, 'find');
    if (ok) break;
    await sleep(500);
  }
  const setup = await evaluate(SETUP, 'setup');
  log('setup', JSON.stringify(setup));
  await sleep(600);
  await shot('pick');
}
