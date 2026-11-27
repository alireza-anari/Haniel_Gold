from pathlib import Path
import sqlite3

root = Path(__file__).resolve().parents[2]
schema = (root / "telegram-miniapp/db/schema.sql").read_text(encoding="utf-8")
migration = (root / "telegram-miniapp/db/migrations/0003_public_pricing.sql").read_text(encoding="utf-8")

db = sqlite3.connect(":memory:")
db.execute("PRAGMA foreign_keys = ON")
db.executescript(schema)
db.executescript(migration)

tables = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
assert "product_public_pricing" in tables
assert "gold_rate_state" in tables
assert db.execute("SELECT COUNT(*) FROM sales").fetchone()[0] == 0
assert db.execute("SELECT COUNT(*) FROM product_public_pricing").fetchone()[0] == 0

db.execute("""
  INSERT INTO products(sku,name,weight,purchase_gold_rate,purchase_labor_pct,purchased_qty)
  VALUES('HG-SMOKE-1','محصول آزمایشی','1.25','250000000','7',1)
""")
db.execute("""
  INSERT INTO product_public_pricing(product_id,labor_pct,profit_pct)
  VALUES(1,'7','8')
""")
row = db.execute("""
  SELECT labor_pct,profit_pct,accessories,discount,enabled,show_profit
  FROM product_public_pricing WHERE product_id=1
""").fetchone()
assert row == ("7", "8", "0", "0", 0, 0)

db.execute("INSERT OR IGNORE INTO gold_rate_state(id,last_attempt_at,last_error,version) VALUES(1,0,'',1)")
assert db.execute("SELECT COUNT(*) FROM gold_rate_state").fetchone()[0] == 1
print("OK: manager schema and public pricing migration execute cleanly in SQLite")
