const Q = String.raw`(function(){
  var st=[cc.director.getScene()]; var root=null;
  while(st.length){var n=st.shift(); if(!n) continue;
    var c=n.getComponent && n.getComponent('DeployRoot'); if(c){root=c;break;}
    var ch=n.children||[]; for(var i=0;i<ch.length;i++) st.push(ch[i]);
  }
  if(!root) return null;
  return {queue: root.queue.map(function(s){return s.general;}), gens: root.generals.map(function(g){return g.NAME;}), head: root.selectedGen};
})()`;
export default async function steps({ evaluate, sleep }) {
  const q = await evaluate(Q, 'q');
  console.log('STATE ' + JSON.stringify(q));
  await sleep(200);
}
