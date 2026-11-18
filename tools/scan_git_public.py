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
# Schema-only SQL for this private Mini App is safe to publish. Database dumps are not.
MINIAPP_SCHEMA_ONLY_SQL = {
    'telegram-miniapp/db/schema.sql',
    'telegram-miniapp/db/migrate-r2-to-d1-images.sql',
    'telegram-miniapp/db/migrations/0002_sale_idempotency.sql',
    'telegram-miniapp/db/migrations/0003_tryon_assets.sql',
}
ALLOWED_SQL = {
    'cloudflare/schema.sql', 'cloudflare/0002_gold_pricing.sql',
    'cloudflare/0003_inquiry_telegram.sql', 'cloudflare/0004_remove_telegram.sql',
    'cloudflare/0005_inquiry_notifications.sql', 'cloudflare/0006_inquiry_quotes.sql',
    'cloudflare/0007_tryon_assets.sql',
} | MINIAPP_SCHEMA_ONLY_SQL
for path in paths:
    p=Path(path)
    name=p.name.lower()
    if (name.endswith('.sql') and path not in ALLOWED_SQL) or (name=='.env' or name.endswith(('.pem','.p12','.pfx','.key','.sqlite3','.pyc','.dump','.log','.bak','.woff','.woff2','.ttf','.otf'))
        or name.startswith('id_rsa') or name.startswith('id_ed25519')
        or 'private-fonts' in p.parts or 'media' in p.parts or '__pycache__' in p.parts or 'backups' in p.parts or '.git' in p.parts):
        forbidden.append(path)
    elif p.suffix.lower() in ('.py','.js','.json','.md','.yml','.yaml','.txt','.sh','.ps1','.example','.html','.css','.sql'):
        file=ROOT/path
        if not file.is_file(): continue
        data=file.read_text(encoding='utf-8',errors='replace')
        if path != 'tools/scan_git_public.py' and ('-----BEGIN PRIVATE KEY-----' in data or '-----BEGIN OPENSSH PRIVATE KEY-----' in data):
            forbidden.append(path+' [private key content]')
        if path in MINIAPP_SCHEMA_ONLY_SQL:
            # Only source DDL is publishable. The one fixed revision seed is harmless.
            clean = ' '.join(line for line in data.splitlines() if not line.lstrip().startswith('--'))
            if path == 'telegram-miniapp/db/schema.sql':
                clean = clean.replace("INSERT OR IGNORE INTO meta(key,value) VALUES('revision','0');", '')
            clean = ' '.join(clean.split()).upper().replace('BEFORE UPDATE OF ', '')
            forbidden_sql = (
                'INSERT INTO', 'INSERT OR ', 'REPLACE INTO', ' UPDATE ',
                'DELETE FROM', 'DROP TABLE', 'ATTACH DATABASE', 'PRIVATE KEY',
            )
            if any(token in clean for token in forbidden_sql):
                forbidden.append(path+' [miniapp SQL must contain schema only, no data rows or keys]')
        if path == 'cloudflare/schema.sql' and ('INSERT INTO' in data.upper() or 'PRIVATE KEY' in data.upper()):
            forbidden.append(path+' [schema cannot contain seed data or keys]')
        if path == 'cloudflare/0002_gold_pricing.sql' and ('PRIVATE KEY' in data.upper() or 'INSERT INTO PRODUCTS' in data.upper() or 'INSERT INTO GOLD_MARKET_STATE(' in data.upper()):
            forbidden.append(path+' [rate schema must not seed product or market prices]')
        if path == 'cloudflare/0003_inquiry_telegram.sql' and any(x in data.upper() for x in ('PRIVATE KEY', 'INSERT INTO PURCHASE_INQUIRIES', 'INSERT INTO TELEGRAM_PRODUCT_DRAFTS', 'INSERT INTO PRODUCTS')):
            forbidden.append(path+' [inquiry schema must not contain real customers, imports or seeded products]')
        if path == 'cloudflare/0004_remove_telegram.sql' and any(x in data.upper() for x in ('PRIVATE KEY', 'INSERT INTO', 'UPDATE PRODUCTS', 'DELETE FROM PURCHASE_INQUIRIES')):
            forbidden.append(path+' [retirement migration must not include secrets or alter customer inquiry records]')
        if path == 'cloudflare/0005_inquiry_notifications.sql' and any(x in data.upper() for x in ('PRIVATE KEY', 'INSERT INTO PURCHASE_INQUIRIES', 'INSERT INTO PURCHASE_INQUIRY_NOTIFICATIONS', 'INSERT INTO PRODUCTS')):
            forbidden.append(path+' [notification migration must not include secrets or seed customer/notification records]')
        if path == 'cloudflare/0006_inquiry_quotes.sql' and any(x in data.upper() for x in ('PRIVATE KEY','INSERT INTO','UPDATE PRODUCTS','DELETE FROM PURCHASE_INQUIRIES','DROP TABLE')):
            forbidden.append(path+' [quote migration must be schema-only]')
        if path == 'cloudflare/0007_tryon_assets.sql':
            # A declared D1 table only; prohibit all writes, destructive statements and secrets.
            clean = ' '.join(line for line in data.splitlines() if not line.lstrip().startswith('--')).upper()
            if any(token in clean for token in ('PRIVATE KEY','INSERT INTO',' UPDATE ','DELETE FROM','DROP TABLE','ALTER TABLE','ATTACH DATABASE','REPLACE INTO')):
                forbidden.append(path+' [tryon migration must be schema-only; no data or destructive writes]')
        # Owner explicitly requested restoring the four original embedded fonts; they now live in the shared brand-fonts.css.
        if path not in ('tools/scan_git_public.py', 'frontend/styles.css', 'frontend/brand-fonts.css') and re.search(r'data:(?:font/|application/(?:x-font|font))[^,]*;base64,', data):
            forbidden.append(path+' [embedded font requires public license review]')
        # Does not reject placeholders, no full secrets scanning claims.
if forbidden:
    print('ERROR: potentially sensitive public files:')
    for path in forbidden: print(' -',path)
    sys.exit(1)
print(f'OK: {len(paths)} files checked for unsafe public paths and private-key blocks')
