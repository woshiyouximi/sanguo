# -*- coding: utf-8 -*-
"""Batch-wrap every global input.on/off registration with guardTouch() (R228).

ASCII-only so PowerShell/console encoding can never hurt the sources; the target
files are UTF-8 and are rewritten byte-for-byte with their original newline style.
"""
import re
import sys
from pathlib import Path

ROOT = Path(r'F:\sanguo\game\cocos\assets\scripts')

LABELS = {
    'ArmyLayer.ts': 'ArmyMenu',
    'BattleRoot.ts': 'BattleRoot',
    'BootRoot.ts': 'BootRoot',
    'CampaignRoot.ts': 'CampaignRoot',
    'CityListPanel.ts': 'CityListPanel',
    'CityPanel.ts': 'CityPanel',
    'DeployRoot.ts': 'DeployRoot',
    'EndingPanel.ts': 'EndingPanel',
    'ForcesPanel.ts': 'ForcesPanel',
    'GeneralBookPanel.ts': 'GeneralBookPanel',
    'ItemsPanel.ts': 'ItemsPanel',
    'MonarchPanel.ts': 'MonarchPanel',
    'SaveSlots.ts': 'SaveSlotsPanel',
    'ScenarioSelect.ts': 'ScenarioSelect',
    'SurrenderPanel.ts': 'SurrenderPanel',
    'TitlePanel.ts': 'TitlePanel',
}

ROOTS = {'BootRoot.ts', 'CampaignRoot.ts', 'DeployRoot.ts', 'BattleRoot.ts'}

REG_RE = re.compile(
    r"input\.(on|off)\(\s*(Input\.EventType\.(?:TOUCH_END|TOUCH_START|TOUCH_MOVE))"
    r"\s*,\s*this\.(onTouch(?:Start|Move)?)\s*,\s*this\s*\)"
)


def read_text(p):
    raw = p.read_bytes()
    bom = raw.startswith(b'\xef\xbb\xbf')
    text = raw.decode('utf-8-sig')
    nl = '\r\n' if '\r\n' in text else '\n'
    return text, nl, bom


def write_text(p, text, nl, bom):
    data = text.replace('\r\n', '\n')
    if nl == '\r\n':
        data = data.replace('\n', '\r\n')
    payload = data.encode('utf-8')
    if bom:
        payload = b'\xef\xbb\xbf' + payload
    p.write_bytes(payload)


def main():
    changed, skipped = [], []
    for name, label in LABELS.items():
        p = ROOT / name
        text, nl, bom = read_text(p)
        orig = text
        counter = {'n': 0}

        def repl(m, label=label, counter=counter):
            counter['n'] += 1
            return "input.%s(%s, guardTouch(this, '%s', '%s'), this)" % (
                m.group(1), m.group(2), m.group(3), label)

        text = REG_RE.sub(repl, text)
        if counter['n'] == 0:
            skipped.append(name)
            continue

        needed = 'guardTouch, installInputResilience' if name in ROOTS else 'guardTouch'
        if "from './InputGuard'" not in text:
            lines = text.split('\n')
            idx = None
            for i, line in enumerate(lines):
                if "from './InputLatch'" in line:
                    idx = i
            if idx is None:
                for i, line in enumerate(lines):
                    if re.match(r'^import\b', line):
                        idx = i
            if idx is None:
                raise SystemExit('no import anchor in ' + name)
            lines.insert(idx + 1, "import { %s } from './InputGuard';" % needed)
            text = '\n'.join(lines)

        if name in ROOTS and 'installInputResilience();' not in text:
            m = re.search(r'onLoad\(\): void \{\n', text)
            if not m:
                raise SystemExit('no onLoad anchor in ' + name)
            text = text[:m.end()] + '    installInputResilience();\n' + text[m.end():]

        if text != orig:
            write_text(p, text, nl, bom)
        changed.append('%s(%d)' % (name, counter['n']))

    print('changed:', ', '.join(changed))
    if skipped:
        print('SKIPPED (no registration found):', ', '.join(skipped))


if __name__ == '__main__':
    main()
