# -*- coding: utf-8 -*-
"""UI sweep driver: JSON action list -> adb taps / screenshots / logcat / save dumps.

usage: python sweep.py script.json

actions:
  {"a":"tap","x":750x,"y":750y,"note":".."}       design coords (750x1334) -> device
  {"a":"tapd","x":devx,"y":devy,"note":".."}      raw device coords
  {"a":"tapdiff","label":"close","x":750x,"y":750y,"settle":700,"crop":[x,y,w,h],"note":".."}
        capture-before / tap / capture-after, compute diff, save evidence png (half size)
        and append a RESULT line to tapdiff.jsonl
  {"a":"shot","name":"01_title","note":".."}       full size screenshot -> <name>.png
  {"a":"crop","name":"..","x":,"y":,"w":,"h":,"scale":0.6}   device-pixel crop -> <name>.png
  {"a":"sleep","ms":900}
  {"a":"key","k":"BACK"}
  {"a":"swipe","x1":,"y1":,"x2":,"y2":,"ms":300}   design coords
  {"a":"clear"}                                    logcat -c
  {"a":"log","name":"b1"}                          logcat -d -> log_<name>.txt
  {"a":"waitlog","pat":"campaign start","ms":8000} block until logcat matches
  {"a":"savedump","name":"s1"}                     save db -> save_<s1>.json + brief summary
  {"a":"stats"}                                    version / focus / package info
"""
import base64
import json
import os
import re
import sqlite3
import subprocess
import sys
import tempfile
import time

ADB = r'F:\devtools\android\sdk\platform-tools\adb.exe'
DEV = '127.0.0.1:16384'
PKG = 'com.sanguo.sango2'
WORK = r'F:\sanguo\work\ui_sweep'
LOG = os.path.join(WORK, 'sweep_actions.log')
DIFF_JSONL = os.path.join(WORK, 'tapdiff.jsonl')

SCALE = 2560.0 / 1334.0
OFF_X = (1456.0 - 750.0 * SCALE) / 2.0


def to_dev(dx, dy):
    return round(OFF_X + dx * SCALE), round(dy * SCALE)


def sh(args, timeout=120):
    return subprocess.run(args, capture_output=True, timeout=timeout)


def adb(*args, timeout=120):
    return sh([ADB, '-s', DEV, *args], timeout=timeout)


def logline(msg):
    line = '[%s] %s' % (time.strftime('%H:%M:%S'), msg)
    print(line)
    with open(LOG, 'a', encoding='utf-8') as f:
        f.write(line + '\n')


def screencap(dest):
    remote = '/sdcard/ui_sweep_tmp.png'
    for attempt in range(3):
        r = adb('shell', 'screencap', '-p', remote)
        if r.returncode != 0:
            time.sleep(0.25)
            continue
        r2 = adb('pull', remote, dest)
        size = os.path.getsize(dest) if os.path.exists(dest) else 0
        adb('shell', 'rm', '-f', remote)
        if r2.returncode == 0 and size > 20000:
            return True
        time.sleep(0.3)
    return False


def shot(name, full=True):
    out = os.path.join(WORK, name + '.png')
    if screencap(out):
        if not full:
            half(out)
        logline('shot %s ok (%d bytes)' % (name, os.path.getsize(out)))
        return out
    logline('shot %s FAILED' % name)
    return None


def half(path, scale=0.45):
    from PIL import Image
    im = Image.open(path)
    im = im.resize((max(1, int(im.width * scale)), max(1, int(im.height * scale))), Image.LANCZOS)
    im.save(path)
    return path


def imgdiff(p1, p2):
    from PIL import Image, ImageChops
    a = Image.open(p1).convert('L').resize((364, 640))
    b = Image.open(p2).convert('L').resize((364, 640))
    d = ImageChops.difference(a, b)
    hist = d.histogram()
    total = 364 * 640
    changed = sum(hist[13:])
    s = sum(i * h for i, h in enumerate(hist))
    return {'mean': round(s / float(total), 2), 'changed': round(100.0 * changed / total, 2)}


def tapdiff(act):
    from PIL import Image
    label = act['label']
    settle = act.get('settle', 700)
    tag = re.sub(r'[^\w\u4e00-\u9fff.-]+', '_', label)[:60]
    before = os.path.join(WORK, '_td_before.png')
    after = os.path.join(WORK, '_td_after.png')
    if not screencap(before):
        logline('tapdiff %s: before screencap failed' % label)
        return
    if 'xd' in act:
        adb('shell', 'input', 'tap', str(act['xd']), str(act['yd']))
        dev = (act['xd'], act['yd'])
    else:
        x, y = to_dev(act['x'], act['y'])
        adb('shell', 'input', 'tap', str(x), str(y))
        dev = (x, y)
    time.sleep(settle / 1000.0)
    if not screencap(after):
        logline('tapdiff %s: after screencap failed' % label)
        return
    d = imgdiff(before, after)
    ev = os.path.join(WORK, 'ev_%02d_%s.png' % (act.get('seq', 0), tag))
    im = Image.open(after)
    im.resize((max(1, int(im.width * 0.45)), max(1, int(im.height * 0.45))), Image.LANCZOS).save(ev)
    crop_path = None
    crop = act.get('crop')
    if crop:
        box = (int(crop[0]), int(crop[1]), int(crop[0]) + int(crop[2]), int(crop[1]) + int(crop[3]))
        c = im.crop(box)
        if act.get('crop_scale'):
            s = float(act['crop_scale'])
            c = c.resize((max(1, int(c.width * s)), max(1, int(c.height * s))), Image.LANCZOS)
        crop_path = os.path.join(WORK, 'ev_%02d_%s_crop.png' % (act.get('seq', 0), tag))
        c.save(crop_path)
    rec = {'label': label, 'dev': list(dev), 'design': [act.get('x'), act.get('y')],
           'mean': d['mean'], 'changed': d['changed'], 'evidence': os.path.basename(ev),
           'note': act.get('note', '')}
    with open(DIFF_JSONL, 'a', encoding='utf-8') as f:
        f.write(json.dumps(rec, ensure_ascii=False) + '\n')
    logline('RESULT %-28s dev(%d,%d) mean=%.2f changed=%.2f%% ev=%s' % (
        label, dev[0], dev[1], d['mean'], d['changed'], os.path.basename(ev)))
    for p in (before, after):
        try:
            os.unlink(p)
        except OSError:
            pass


def dump_save(name):
    out = os.path.join(WORK, 'save_%s.json' % name)
    raw = sh([ADB, '-s', DEV, 'shell', 'run-as %s cat databases/jsb.sqlite | base64' % PKG]).stdout
    try:
        blob = base64.b64decode(b''.join(raw.split()), validate=False)
        fd, path = tempfile.mkstemp(suffix='.sqlite')
        os.close(fd)
        open(path, 'wb').write(blob)
        db = sqlite3.connect(path)
        rows = dict(db.execute('select key, value from data'))
        db.close()
        os.unlink(path)
    except Exception as e:
        logline('savedump %s FAILED %r' % (name, e))
        return
    data = {}
    for k, v in rows.items():
        try:
            data[k] = json.loads(v) if (k.startswith('sanguo_') and v) else v
        except Exception:
            data[k] = v
    open(out, 'w', encoding='utf-8').write(json.dumps(data, ensure_ascii=False, indent=1))
    brief = []
    run = data.get('sanguo_run_v1') or {}
    camp = data.get('sanguo_campaign_v1') or {}
    if isinstance(run, dict):
        brief.append('run: %s' % json.dumps({k: run.get(k) for k in
                                             ('year', 'month', 'turn', 'phase', 'scenario', 'force', 'king') if k in run},
                                            ensure_ascii=False))
    if isinstance(camp, dict):
        brief.append('camp keys=%s' % (sorted(camp.keys())[:12],))
    logline('savedump %s keys=%s %s -> %s' % (name, sorted(rows.keys()), ' | '.join(brief), out))


def stats():
    r = adb('shell', 'dumpsys', 'package', PKG)
    txt = r.stdout.decode('utf-8', 'ignore')
    ver = re.search(r'versionName=(\S+)', txt)
    upd = re.search(r'lastUpdateTime=([^\n]+)', txt)
    f = adb('shell', 'dumpsys', 'window')
    ftxt = f.stdout.decode('utf-8', 'ignore')
    focus = re.search(r'mCurrentFocus=([^\n]+)', ftxt)
    logline('stats version=%s lastUpdate=%s focus=%s' % (
        ver.group(1) if ver else '?', upd.group(1) if upd else '?', focus.group(1) if focus else '?'))


def relaunch():
    adb('shell', 'am', 'force-stop', PKG)
    time.sleep(0.4)
    adb('shell', 'am', 'start', '-n', PKG + '/com.cocos.game.AppActivity')
    deadline = time.time() + 20
    ok = False
    while time.time() < deadline:
        r = adb('shell', 'dumpsys', 'window')
        if PKG.encode() in r.stdout and b'mCurrentFocus' in r.stdout:
            ok = True
            break
        time.sleep(0.4)
    time.sleep(2.2)
    logline('relaunch ok=%s' % ok)


def pmclear():
    adb('shell', 'pm', 'clear', PKG)
    time.sleep(0.5)
    logline('pm clear done')


def main():
    script_path = sys.argv[1]
    actions = json.load(open(script_path, encoding='utf-8'))
    logline('=== begin %s (%d actions) ===' % (os.path.basename(script_path), len(actions)))
    seq = 0
    for i, act in enumerate(actions):
        a = act.get('a')
        note = act.get('note', '')
        try:
            if a == 'tap':
                x, y = to_dev(act['x'], act['y'])
                adb('shell', 'input', 'tap', str(x), str(y))
                logline('tap design(%s,%s) -> dev(%d,%d) %s' % (act['x'], act['y'], x, y, note))
            elif a == 'tapd':
                adb('shell', 'input', 'tap', str(act['x']), str(act['y']))
                logline('tap dev(%s,%s) %s' % (act['x'], act['y'], note))
            elif a == 'tapdiff':
                seq += 1
                act.setdefault('seq', seq)
                tapdiff(act)
            elif a == 'shot':
                shot(act['name'], full=act.get('full', True))
            elif a == 'crop':
                src = shot('_crop_src')
                if src:
                    from PIL import Image
                    im = Image.open(src)
                    box = (int(act['x']), int(act['y']), int(act['x']) + int(act['w']), int(act['y']) + int(act['h']))
                    c = im.crop(box)
                    s = act.get('scale', 1.0)
                    if s != 1.0:
                        c = c.resize((max(1, int(c.width * s)), max(1, int(c.height * s))), Image.LANCZOS)
                    c.save(os.path.join(WORK, act['name'] + '.png'))
                    logline('crop %s box=%s scale=%s' % (act['name'], box, s))
            elif a == 'sleep':
                time.sleep(act.get('ms', 900) / 1000.0)
                logline('sleep %dms' % act.get('ms', 900))
            elif a == 'key':
                adb('shell', 'input', 'keyevent', str(act['k']))
                logline('key %s' % act['k'])
            elif a == 'swipe':
                x1, y1 = to_dev(act['x1'], act['y1'])
                x2, y2 = to_dev(act['x2'], act['y2'])
                adb('shell', 'input', 'swipe', str(x1), str(y1), str(x2), str(y2), str(act.get('ms', 300)))
                logline('swipe design(%s,%s)->(%s,%s) dev(%d,%d)->(%d,%d) %s' % (
                    act['x1'], act['y1'], act['x2'], act['y2'], x1, y1, x2, y2, note))
            elif a == 'clear':
                adb('logcat', '-c')
                logline('logcat clear')
            elif a == 'log':
                r = adb('logcat', '-d', '-v', 'time')
                p = os.path.join(WORK, 'log_%s.txt' % act['name'])
                open(p, 'wb').write(r.stdout)
                logline('logcat dump %s (%d bytes) -> %s' % (act['name'], len(r.stdout), p))
            elif a == 'waitlog':
                pat = act['pat']
                deadline = time.time() + act.get('ms', 8000) / 1000.0
                hit = False
                while time.time() < deadline:
                    r = adb('logcat', '-d')
                    if re.search(pat.encode('utf-8'), r.stdout):
                        hit = True
                        break
                    time.sleep(0.4)
                logline('waitlog %r hit=%s' % (pat, hit))
            elif a == 'savedump':
                dump_save(act['name'])
            elif a == 'relaunch':
                relaunch()
            elif a == 'pmclear':
                pmclear()
            elif a == 'stats':
                stats()
            elif a == 'top':
                r = adb('shell', 'dumpsys', 'window')
                m = re.search(rb'mCurrentFocus=[^\n]+', r.stdout)
                logline('focus %s' % (m.group(0).decode('utf-8', 'ignore') if m else '?'))
            else:
                logline('UNKNOWN action %s' % a)
        except Exception as e:
            logline('ERROR action %d %s: %r' % (i, a, e))
        time.sleep(act.get('after', 0.45))
    logline('=== end ===')


if __name__ == '__main__':
    main()
