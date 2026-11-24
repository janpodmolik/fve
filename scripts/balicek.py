"""Předání soukromé složky dum/ mezi počítači — jedním zipem, mimo GitHub.

    python3 scripts/balicek.py zabal                 → predani/dum-RRRR-MM-DD.zip
    python3 scripts/balicek.py rozbal cesta/k.zip    rozbalí zip do dum/ (stávající dum/ napřed zazálohuje)
    python3 scripts/balicek.py obsah cesta/k.zip     jen vypíše, co v zipu je

Složky dum/ a predani/ nejsou v gitu. Zip se posílá mailem nebo jinak ručně.
"""
import datetime
import os
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DUM = os.path.join(ROOT, 'dum')
PREDANI = os.path.join(ROOT, 'predani')
SKIP_DIRS = {'__pycache__', '.DS_Store'}


def files_in_dum():
    for base, dirs, files in os.walk(DUM):
        dirs[:] = sorted(d for d in dirs if d not in SKIP_DIRS)
        for name in sorted(files):
            if name in SKIP_DIRS or name.endswith('.pyc'):
                continue
            full = os.path.join(base, name)
            yield full, os.path.relpath(full, ROOT).replace(os.sep, '/')


def zabal(prefix='dum'):
    if not os.path.isdir(DUM):
        sys.exit('Složka dum/ tu není, není co balit.')
    os.makedirs(PREDANI, exist_ok=True)
    stamp = datetime.date.today().isoformat()
    path = os.path.join(PREDANI, f'{prefix}-{stamp}.zip')
    n = 2
    while os.path.exists(path):  # víc balíčků za den: -2, -3…
        path = os.path.join(PREDANI, f'{prefix}-{stamp}-{n}.zip')
        n += 1
    count = 0
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as z:
        for full, rel in files_in_dum():
            z.write(full, rel)
            count += 1
    print(f'→ {path} ({count} souborů, {os.path.getsize(path) // 1024} kB)')
    return path


def members(z):
    names = [n for n in z.namelist() if not n.endswith('/')]
    bad = [n for n in names if not n.startswith('dum/') or '..' in n.split('/') or n.startswith('/')]
    if bad:
        sys.exit(f'Tenhle zip není balíček složky dum/ (obsahuje např. {bad[0]}). Nic jsem nerozbalil.')
    return names


def obsah(path):
    with zipfile.ZipFile(path) as z:
        for n in members(z):
            print(' ', n)


def rozbal(path):
    with zipfile.ZipFile(path) as z:
        names = members(z)
        if os.path.isdir(DUM) and any(True for _ in files_in_dum()):
            print('Stávající dum/ zálohuju:')
            zabal('zaloha-pred-rozbalenim')
        z.extractall(ROOT, names)
    print(f'Rozbaleno {len(names)} souborů do {DUM}')
    print('Soubory, které v zipu nebyly, v dum/ zůstaly beze změny.')


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else ''
    if cmd == 'zabal':
        zabal()
    elif cmd in ('rozbal', 'obsah') and len(sys.argv) == 3:
        (rozbal if cmd == 'rozbal' else obsah)(sys.argv[2])
    else:
        sys.exit(__doc__)
