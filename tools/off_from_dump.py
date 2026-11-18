"""Filter the Open Food Facts CSV export (read from stdin, tab-separated) down to products sold in Mexico.

Usage:
  curl -sSL https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz \
    | gunzip | python3 tools/off_from_dump.py > tools/off_raw.jsonl
Then: node tools/build_db.mjs
"""
import csv, json, sys

csv.field_size_limit(sys.maxsize)
NUTR = ["energy-kcal_100g", "energy_100g", "sugars_100g", "added-sugars_100g", "saturated-fat_100g",
        "trans-fat_100g", "sodium_100g", "salt_100g", "fiber_100g", "proteins_100g"]
reader = csv.DictReader(sys.stdin, delimiter="\t", quoting=csv.QUOTE_NONE)
batch, page, seen, total = [], 0, 0, 0

def flush():
    global batch, page
    if batch:
        page += 1
        sys.stdout.write(json.dumps({"_page": page, "products": batch}, ensure_ascii=False) + "\n")
        batch = []

for row in reader:
    seen += 1
    if seen % 500000 == 0:
        print(f"rows {seen}, mexico {total}", file=sys.stderr, flush=True)
    if "en:mexico" not in (row.get("countries_tags") or ""):
        continue
    nutriments = {k: row[k] for k in NUTR if row.get(k) not in (None, "")}
    batch.append({
        "code": row.get("code"),
        "product_name": row.get("product_name"),
        "brands": row.get("brands"),
        "quantity": row.get("quantity"),
        "ingredients_text": row.get("ingredients_text"),
        "additives_tags": [t for t in (row.get("additives_tags") or "").split(",") if t],
        "categories_tags": [t for t in (row.get("categories_tags") or "").split(",") if t],
        "nutriments": nutriments,
    })
    total += 1
    if len(batch) >= 1000:
        flush()
flush()
print(f"DONE rows {seen}, mexico {total}", file=sys.stderr, flush=True)
