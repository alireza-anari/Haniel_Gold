#!/usr/bin/env python3
"""Fail-safe public repository hygiene checks; not a full secrets scanner."""
from pathlib import Path
import subprocess, re, sys
ROOT=Path(__file__).resolve().parent.parent
if '--filesystem' in sys.argv:
    paths=[p.relative_to(ROOT).as_posix() for p in ROOT.rglob('*') if p.is_file() and '.git' not in p.parts]
else:
    r=subprocess.run(['git','diff','--cached','--name-only','-z'],cwd=ROOT,capture_output=True)
    if r.returncode: sys.exit('Git staging not found. Run git add first, or use --filesystem.')
    paths=[b.decode('utf-8','replace') for b in r.stdout.split(b'\0') if b]
forbidden=[]
for path in paths:
    p=Path(path)
    name=p.name.lower()
    if (name=='.env' or name.endswith(('.pem','.p12','.pfx','.key','.sqlite3','.pyc','.dump','.sql','.log','.bak','.woff','.woff2','.ttf','.otf'))
        or name.startswith('id_rsa') or name.startswith('id_ed25519')
        or 'private-fonts' in p.parts or 'media' in p.parts or '__pycache__' in p.parts or 'backups' in p.parts or '.git' in p.parts):
        forbidden.append(path)
    elif p.suffix.lower() in ('.py','.js','.json','.md','.yml','.yaml','.txt','.sh','.ps1','.example','.html','.css'):
        file=ROOT/path
        if not file.is_file(): continue
        data=file.read_text(encoding='utf-8',errors='replace')
        if path != 'tools/scan_git_public.py' and ('-----BEGIN PRIVATE KEY-----' in data or '-----BEGIN OPENSSH PRIVATE KEY-----' in data):
            forbidden.append(path+' [private key content]')
        # Owner explicitly requested restoring the four original embedded fonts.
        if path not in ('tools/scan_git_public.py', 'frontend/styles.css') and re.search(r'data:(?:font/|application/(?:x-font|font))[^,]*;base64,', data):
            forbidden.append(path+' [embedded font requires public license review]')
        # Does not reject placeholders, no full secrets scanning claims.
if forbidden:
    print('ERROR: potentially sensitive public files:')
    for path in forbidden: print(' -',path)
    sys.exit(1)
print(f'OK: {len(paths)} files checked for unsafe public paths and private-key blocks')
