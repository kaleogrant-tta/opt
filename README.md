# Menu Mix Optimizer (GitHub Pages)

Interactive tool to blend **DTBK performance**, **NYC competitor mix (OCM)**, and **brand strength** into **optimized category targets** + **SKU counts**.

## Files
- `index.html` — App shell
- `styles.css` — UI styles
- `app.js` — Logic (parsing, optimization, charting)
- `data/competitor_benchmarks.json` — Default OCM NYC category shares
- `data/templates/*.csv` — Upload templates

## How It Works
1. Upload **DTBK Category Mix** (`Category,DTBK_Pct`) or paste values.
2. Edit **Competitor %** (OCM NYC defaults provided).
3. Optional: Upload **Brand Strength** (`Brand,Category,BSI`) to weight categories by average BSI.
4. Upload **Current SKU Counts** and set **Total SKU Target** to get per-category targets & gaps.
5. Adjust **weights** (DTBK / Competitor / BEI) and rerun.

## Deploy on GitHub Pages
1. Create a new repository (e.g. `menu-mix-optimizer`).
2. Commit these files at the repo root.
3. Enable Pages: **Settings → Pages → Source: `main` / root**.
4. Visit the Pages URL and run the tool.

### Notes
- If you want to use your existing `bsi_data.json`, include a **Category** field per brand or export a CSV with `Brand,Category,BSI` and upload that instead.
- Weights should sum near `1.0`. If BEI is missing, it’s effectively `0`-weighted.
