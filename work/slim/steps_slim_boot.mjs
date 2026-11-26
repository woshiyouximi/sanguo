// 采集一次冷启动（reload）期间所有 /native/ 请求的 URL 与状态码，确认引擎请求的是 .png 还是 .webp。
export default async function ({ s, send, sleep, evaluate, log, events }) {
  events.length = 0;
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Page.enable');
  await send('Page.reload', { ignoreCache: true });
  await sleep(18000);

  const native = [];
  const other = [];
  const fails = [];
  for (const e of events) {
    if (e.method === 'Network.requestWillBeSent') {
      const u = e.params.request.url;
      if (u.includes('/native/')) native.push({ url: u, id: e.params.requestId, status: null });
      else other.push(u);
    } else if (e.method === 'Network.responseReceived') {
      const u = e.params.response.url;
      if (u.includes('/native/')) {
        const hit = native.find((n) => n.id === e.params.requestId);
        if (hit) hit.status = e.params.response.status;
      }
    } else if (e.method === 'Network.loadingFailed' && e.params.errorText !== 'net::ERR_ABORTED') {
      fails.push(e.params.errorText);
    }
  }
  const byExt = {};
  const bad = [];
  for (const n of native) {
    const m = /\.([a-z0-9]+)$/.exec(n.url.split('?')[0]);
    const ext = m ? m[1] : 'none';
    byExt[ext] = (byExt[ext] || 0) + 1;
    if (n.status !== 200) bad.push({ status: n.status, url: n.url });
  }
  const scene = await evaluate('(function(){try{return JSON.stringify({scene:cc.director.getScene().name,frames:cc.director.getTotalFrames()})}catch(e){return String(e)}})()');
  return {
    scene,
    nativeRequests: native.length,
    byExt,
    badCount: bad.length,
    bad: bad.slice(0, 40),
    netFailCount: fails.length,
    netFails: fails.slice(0, 20),
    otherRequests: other.length,
    sampleNative: native.slice(0, 6).map((n) => ({ status: n.status, url: n.url.split('/').slice(-2).join('/') })),
  };
}
