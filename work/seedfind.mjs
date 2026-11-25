function mk(seed){ let s=seed>>>0; return ()=>{ s=(s+0x6D2B79F5)>>>0; let t=s; t=Math.imul(t^(t>>>15),t|1); t^=t+Math.imul(t^(t>>>7),t|61); return ((t^(t>>>14))>>>0)/4294967296; }; }
for (const seed of [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25]){
  const r=mk(seed);
  const v1=r(), v2=r();
  const hit11 = v1<0.165 || v2<0.155;
  console.log(seed, v1.toFixed(3), v2.toFixed(3), hit11?"HIT11":"");
}
