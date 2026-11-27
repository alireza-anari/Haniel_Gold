from pathlib import Path
import sqlite3

root = Path(__file__).resolve().parents[2]
schema = (root / "telegram-miniapp/db/schema.sql").read_text(encoding="utf-8")
public_migration = (root / "telegram-miniapp/db/migrations/0003_public_pricing.sql").read_text(encoding="utf-8")
market_migration = (root / "telegram-miniapp/db/migrations/0004_gold_market_policy.sql").read_text(encoding="utf-8")

db = sqlite3.connect(":memory:")
db.execute("PRAGMA foreign_keys = ON")
db.executescript(schema)
db.executescript(public_migration)
db.executescript(market_migration)

tables = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
assert "product_public_pricing" in tables
assert "gold_market_state" in tables
assert "gold_rate_audit" in tables
assert "pricing_policy" in tables
assert "gold_rate_policy" in tables
assert "gold_rate_state" not in tables
assert db.execute("SELECT COUNT(*) FROM sales").fetchone()[0] == 0
assert db.execute("SELECT COUNT(*) FROM product_public_pricing").fetchone()[0] == 0
assert db.execute("SELECT COUNT(*) FROM gold_market_state").fetchone()[0] == 0
assert db.execute("SELECT COUNT(*) FROM pricing_policy").fetchone()[0] == 0
assert db.execute("SELECT COUNT(*) FROM gold_rate_policy").fetchone()[0] == 0

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
print("OK: manager schema, public pricing and shared gold-market migrations execute cleanly without inserting data rows")
