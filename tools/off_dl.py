"""Download all Open Food Facts products sold in Mexico into a compact JSON for the app."""
import json, time, sys, urllib.request, urllib.parse, os, re

OUT = os.path.join(os.path.dirname(__file__), "off_raw.jsonl")
FIELDS = ",".join([
    "code", "product_name_es", "product_name", "brands", "quantity", "nutriments",
    "ingredients_text_es", "ingredients_text", "additives_tags", "categories_tags", "nova_group",
])
PAGE_SIZE = 100
UA = "PersonalFoodApp/1.0 (personal use)"

def get(page):
    q = urllib.parse.urlencode({"countries_tags_en": "mexico", "page_size": PAGE_SIZE, "page": page, "fields": FIELDS})
    req = urllib.request.Request("https://world.openfoodfacts.org/api/v2/search?" + q, headers={"User-Agent": UA})
    for attempt in range(12):
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                return json.load(r)
        except Exception as e:
            print(f"page {page} attempt {attempt}: {e}", flush=True)
            time.sleep(min(30 * (attempt + 1), 180))
    raise SystemExit(f"failed page {page}")

done = set()
if os.path.exists(OUT):
    with open(OUT) as f:
        for line in f:
            done.add(json.loads(line)["_page"])

first = get(1) if 1 not in done else None
count = first["count"] if first else None
if count is None:
    count = get(1)["count"]
pages = (count + PAGE_SIZE - 1) // PAGE_SIZE
print("count", count, "pages", pages, flush=True)
with open(OUT, "a") as f:
    for page in range(1, pages + 1):
        if page in done:
            continue
        d = first if (page == 1 and first) else get(page)
        f.write(json.dumps({"_page": page, "products": d.get("products", [])}, ensure_ascii=False) + "\n")
        f.flush()
        print("page", page, len(d.get("products", [])), flush=True)
        time.sleep(12)
print("DONE", flush=True)
