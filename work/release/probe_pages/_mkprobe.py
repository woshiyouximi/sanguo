import io, os, sys

SRC = r'F:\sanguo\game\web'
probe = '''
<script>
/* F-ui 临时探针：只在 *_probe 副本里存在，截完图即删 */
window.__err = []; window.__imgfail = [];
function __render() {
  var d = document.getElementById('__errbox');
  if (!d) { d = document.createElement('div'); d.id = '__errbox';
    d.style.cssText = 'position:fixed;left:0;top:0;right:0;z-index:99999;background:#b00000;color:#fff;font:13px/1.35 monospace;padding:6px 8px;white-space:pre-wrap';
    document.documentElement.appendChild(d); }
  var ok = __err.length === 0 && __imgfail.length === 0;
  d.style.background = ok ? '#116611' : '#b00000';
  d.textContent = 'PROBE ' + (ok ? 'ALL CLEAR' : 'PROBLEM')
    + '  jsErr=' + __err.length + '  imgFail=' + __imgfail.length
    + (__err.length ? '\\nJS: ' + __err.slice(0, 4).join(' | ') : '')
    + (__imgfail.length ? '\\nIMG: ' + __imgfail.slice(0, 4).join(' | ') : '')
    + '\\nrows=' + document.querySelectorAll('.irow, .grid .it, .pick .it').length;
}
addEventListener('error', function (e) {
  if (e.target && e.target.tagName === 'IMG') { __imgfail.push(e.target.getAttribute('src')); }
  else { __err.push((e.message || 'err') + ' @' + (e.filename || '').split('/').pop() + ':' + e.lineno); }
  __render();
}, true);
addEventListener('unhandledrejection', function (e) { __err.push('unhandledrejection: ' + (e.reason && e.reason.message || e.reason)); __render(); });
addEventListener('DOMContentLoaded', function () { setTimeout(__render, 2500); });
setTimeout(__render, 2600); setTimeout(__render, 3500);
</script>
</head>'''

for name in ('items', 'deploy'):
    src = os.path.join(SRC, name + '.html')
    txt = io.open(src, encoding='utf-8').read()
    assert '</head>' in txt
    out = txt.replace('</head>', probe, 1)
    dst = os.path.join(SRC, '_probe_' + name + '.html')
    io.open(dst, 'w', encoding='utf-8', newline='').write(out)
    print('wrote', dst, len(out))
