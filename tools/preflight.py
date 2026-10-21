"""No-third-party static deployment checks. Not a replacement for actual Django tests."""
from pathlib import Path
import ast
import re
import sys

root = Path(__file__).resolve().parent.parent
errors=[]
for rel in ['compose.yaml','backend/Dockerfile','backend/config/settings.py',
    'backend/commerce/servix.py','frontend/index.html','frontend/runtime-config.js',
    'frontend/app.js','frontend/styles.css','deploy/Caddyfile',
    '.github/workflows/ci.yml','.github/workflows/deploy.yml']:
    if not (root / rel).is_file():
        errors.append(f'Missing: {rel}')
for p in (root / 'backend').rglob('*.py'):
    try: ast.parse(p.read_text())
    except SyntaxError as exc:errors.append(f'Python syntax: {p}: {exc}')
html=(root/'frontend/index.html').read_text()
css=(root/'frontend/styles.css').read_text()
js=(root/'frontend/app.js').read_text()
for asset in re.findall(r'assets/([\w.-]+\.(?:png|webp|jpg|jpeg))', js+css+html):
    if not (root/'frontend/assets'/asset).exists(): errors.append(f'Missing frontend image {asset}')
if 'window.HANIEL_CONFIG' not in (root/'frontend/runtime-config.js').read_text():
    errors.append('Runtime config missing')
if 'X-CSRFToken' not in js or 'refreshCsrf' not in js:
    errors.append('Mutation CSRF client missing')
if (root/'.env').exists() or (root/'backend/.env').exists():
    errors.append('Never package real .env files')
if "Django<" in (root/'backend/requirements.txt').read_text():
    pass
print('FAILED' if errors else 'OK: static/preflight checks passed')
for x in errors:print('-',x)
sys.exit(bool(errors))
