# Credit Insight

A SvelteKit web app for the **Synthetic Credit Card Customer Behaviour** dataset (Kaggle, 50,000 customers × 30 columns).
An **Excel file is the database**: records are created, edited and deleted in the browser and written straight back to the `.xlsx`.
The same file feeds a statistical-analysis dashboard, a downloadable Excel report and a Tableau dashboard embedded in the site.

## Assignment requirements → where they are

| Requirement (โจทย์) | Where |
|---|---|
| **1. สร้างเว็บในการอัพเดตข้อมูลลง excel จากนั้น วิเคราะห์ข้อมูลตามชุดข้อมูลนั้นๆ**<br>Web app that updates data in Excel, then analyses it | **Data** page (`/data`): search, filter, sort, add / edit / delete customers → saved to `data/credit_card_customers.xlsx`. |
| **2. สร้างไฟล์ excel และนำเสนอการวิเคราะห์ข้อมูลตามสถิติ**<br>Excel file presenting the statistical analysis | `analysis/credit_card_analysis.xlsx` — 11 sheets of **live Excel formulas**: descriptive stats, frequency distributions, group comparisons, correlation matrix, spending mix, ANOVA, χ² tests, regression, charts and key findings.<br>Plus **Download Excel report** in the app: the same analysis generated from the *current* data. |
| **3. สร้างไฟล์จาก tableau และนำเสนอข้อมูลที่วิเคราะห์ไปในเว็บที่สร้างขึ้น**<br>Tableau file, presented inside the web app | **Dashboard** page (`/`) embeds published Tableau views with the Tableau Embedding API v3.<br>`tableau/TABLEAU_GUIDE.md` gives step-by-step instructions for the workbook (8 worksheets + dashboard). You build and publish it in Tableau, then paste the share link. |

## Quick start

**With Docker** (recommended — nothing else to install; details in the [Docker](#docker) section):

```bash
docker compose up -d --build      # → http://localhost:3000
```

**Without Docker** (for development): needs **Node.js 20+** (tested on 22). Python 3 + pandas/openpyxl only if you want to regenerate the Excel analysis.

```bash
npm install
npm run dev            # http://localhost:5173
```

The first load streams the 50k-row Excel file into memory (~3–4 s); after that everything is instant.

Production build without Docker:

```bash
npm run build
npm start              # http://localhost:3000   (PORT=8080 npm start to change)
```

> When running the production build behind a different host or port, set `ORIGIN`, e.g.
> `ORIGIN=http://localhost:3000 npm start`, or SvelteKit's CSRF protection will reject form posts.

Optional settings: copy `.env.example` to `.env`.

| Variable | Default | Purpose |
|---|---|---|
| `DATA_FILE` | `data/credit_card_customers.xlsx` | The Excel database |
| `SEED_FILE` | `data/seed/credit_card_customers_seed.xlsx` | Original Kaggle data, used by `npm run reset-data` |
| `PUBLIC_TABLEAU_URL` | — | Default Tableau view shown to everyone on the Tableau page |
| `TABLEAU_SERVER_URL`, `TABLEAU_CLIENT_ID`, `TABLEAU_SECRET_ID`, `TABLEAU_SECRET_VALUE`, `TABLEAU_USER` | — | Tableau Cloud **Connected App** (JWT): lets visitors see embedded views with no Tableau account. Server-side secrets — keep in `.env` only |

Restore the original data: stop the server, then
- **Docker:** `docker compose down`, copy `data/seed/credit_card_customers_seed.xlsx` over `data/credit_card_customers.xlsx` (or delete the latter), then `docker compose up -d`. A missing data file is re-seeded automatically.
- **Node:** `npm run reset-data`.

## Docker

```bash
docker compose up -d --build        # → http://localhost:3000
docker compose logs -f app          # watch it load / save the Excel file
docker compose down                 # stop — pending edits are written to Excel first
docker compose run --rm report      # optional: regenerate analysis/credit_card_analysis.xlsx from the live data
```

**Why one app container, not separate frontend / backend / "Excel DB" containers?**

- SvelteKit is full-stack: pages and server code (load functions, form actions, API routes) run in the same Node process.
  Splitting them would mean rewriting every page to call the backend over HTTP, with more code, slower pages and nothing gained.
- The Excel "database" is a **file**, not a server, so it gets a **volume**, not a container. `./data` is bind-mounted into the
  container, which means `data/credit_card_customers.xlsx` on your machine *is* the live database. Excel and Tableau Desktop can open it directly.
- The store keeps the data in memory and allows only one writer, so it must be **exactly one** app process. Two backends writing the same xlsx would corrupt it.

The second service, `report`, is a separate one-shot Python job (profile `tools`, not started by `up`). It reads `./data` read-only and writes the
statistical-analysis workbook to `./analysis`.

| Setting (env / `.env` next to `docker-compose.yml`) | Default | Notes |
|---|---|---|
| `PORT` | `3000` | Host port |
| `ORIGIN` | `http://localhost:3000` | Must equal the URL you open, e.g. `http://192.168.1.20:3000` on a LAN, or form posts are rejected |
| `PUBLIC_TABLEAU_URL` | — | Default embedded Tableau view |
| `UID` / `GID` | `1000` | **Linux only:** the container writes `./data` as this user. Set to `id -u` / `id -g` if yours differ. Docker Desktop on macOS/Windows doesn't need this |

Notes
- If `data/credit_card_customers.xlsx` is missing at start, the container copies in the seed dataset automatically.
- On Windows, close the xlsx in Excel before editing in the app (Excel locks the file; the app keeps retrying the save).
- `docker compose stop` waits up to 30 s so a save in progress can finish.

## Pages

| Page | What it does |
|---|---|
| **Dashboard** `/` | Embedded Tableau views (several, as tabs); paste a share link or embed code |
| **Data** `/data` | Paginated table of all customers; search, filter by card/occupation/sex, sort any column; create, edit, delete with validation; download `.xlsx` / `.csv` |

## How the Excel "database" works

Reading or rewriting a 10 MB, 50k-row workbook on every request would take seconds, and two simultaneous writes could corrupt it. So `src/lib/server/store.ts`:

1. **Loads once.** The first worksheet (the customer data, with a header row) is read into memory on server start.
2. **Serves reads from memory.** Listing, searching, sorting and statistics never touch the disk.
3. **Writes only what changed.** Every create/update/delete changes memory and records the customer ID; a save then patches just those rows of the first worksheet (`src/lib/server/xlsx-patch.ts`):
   - edited rows are rewritten in place (cell styles kept), new customers are appended, deleted ones removed and the rows below moved up;
   - **everything else in the workbook is left as it is**: your own analysis sheets, charts, formulas, formatting, and extra columns you add to the data sheet;
   - if the data is an Excel table (e.g. `CustomerData`), the table is resized, so formulas like `COUNTIFS(CustomerData[Age], …)` include new rows;
   - the workbook is flagged to recalculate when opened. Excel does this automatically; in LibreOffice press **Ctrl+Shift+F9**, or set *Tools → Options → LibreOffice Calc → Formula → Recalculation on file load* to *Always*.
4. **Writes safely.** Saves are
   - *debounced*: a burst of edits becomes one write,
   - *serialized*: only one write at a time, so no lost updates or corruption,
   - *atomic*: the result goes to a temp file which is then renamed over the original, so the xlsx is never half-written.
5. **Backs up.** Before the first save of each run, the previous file is copied to `data/backups/` (last 5 kept).
6. **Notices outside edits.** If you open the xlsx in Excel, change it and save while the app is running, the app reloads it on the next request (unsaved in-app edits are never discarded).
7. **Flushes on shutdown** (Ctrl+C) so pending edits reach the file.

The status in the top-right corner shows *Saving to Excel…* while a write is in progress.

Keep your analysis on sheets *after* the data sheet: the app always treats the **first** sheet as the customer data.

Limitations, by design for a class project: one server process only (don't run several instances against the same file), and on Windows close the file in Excel before editing in the app (Excel locks it; the app retries the save every 3 s and shows *Save failed — retrying*).

## Statistical methods

All formulas match Excel's definitions, so the web numbers equal the Excel workbook's numbers (cross-checked against SciPy).

- **Descriptive:** mean, sample SD (`STDEV.S`), min, quartiles (`QUARTILE.INC`), median, max, IQR, coefficient of variation, skewness (`SKEW`).
- **Correlation:** Pearson r (`CORREL`).
- **One-way ANOVA:** credit score by card type / occupation, monthly spending by card type. F, p (F distribution), **η²** effect size.
- **χ² test of independence:** occupation × card type, gender × card type. χ², df, p, **Cramér's V**.
- **Simple linear regression:** least-squares slope, intercept, R².
- **Segments:** age bands, FICO-style credit-score bands, high-risk flag (utilization ≥ 80 % and payment ratio < 30 % — an assumed definition).

With n ≈ 50,000 almost every difference is statistically significant, so the app and workbook report effect sizes and label them (negligible / small / medium / large).

The source dataset does not state a currency, so money columns are shown as plain numbers.

## REST API

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/customers?q=&card=&occupation=&gender=&sort=&dir=&page=&pageSize=` | List / search |
| POST | `/api/customers` | Create (JSON body, all fields except `Customer_ID`) |
| GET | `/api/customers/:id` | Read one |
| PUT / PATCH | `/api/customers/:id` | Replace / partially update |
| DELETE | `/api/customers/:id` | Delete |
| GET | `/api/analysis` | Full statistical analysis as JSON |
| GET | `/api/status` | Excel load/save status — `503` until the data is loaded (Docker healthcheck) |
| GET | `/api/export/data.xlsx` · `/api/export/data.csv` | Current data (flushes pending edits first) |
| GET | `/api/export/report.xlsx` | Statistical report from the current data |

Validation errors return `422` with `{ "errors": { "Field": "message" } }`.

## Regenerating the Excel analysis workbook

```bash
python scripts/build_excel_analysis.py                       # from the live data file
python scripts/build_excel_analysis.py data/seed/credit_card_customers_seed.xlsx analysis/credit_card_analysis.xlsx
```

The shipped workbook was built from the original seed data and recalculated, so values show even in previewers that don't compute formulas. Excel recalculates everything on open.

## Project structure

```
credit-insight/
├── data/
│   ├── credit_card_customers.xlsx        ← the live Excel database (CRUD writes here)
│   └── seed/credit_card_customers_seed.xlsx  ← original Kaggle data
├── analysis/credit_card_analysis.xlsx    ← requirement 2: Excel statistical analysis
├── tableau/TABLEAU_GUIDE.md              ← requirement 3: how to build & publish the Tableau workbook
├── Dockerfile · docker-compose.yml       ← app container (+ ./data volume)
├── docker/report.Dockerfile              ← optional one-shot job that rebuilds the analysis workbook
├── scripts/
│   ├── build_excel_analysis.py           ← generates the analysis workbook
│   └── reset-data.js                     ← restore seed data
└── src/
    ├── hooks.server.ts                   ← preload Excel on start, flush on shutdown
    ├── lib/
    │   ├── schema.ts                     ← column definitions + validation (shared client/server)
    │   ├── format.ts
    │   ├── server/store.ts               ← Excel-backed store (load, CRUD, safe saving)
    │   ├── server/stats.ts               ← statistics engine (cached per data version)
    │   ├── server/report.ts              ← Excel report from live data
    │   └── components/                   ← CustomerForm
    └── routes/
        ├── +page.svelte                  ← Dashboard (Tableau embed, front page)
        ├── data/                         ← list, new, [id] edit
        └── api/                          ← REST + exports
```

## Tech

SvelteKit 2 · Svelte 5 · TypeScript · JSZip (row-level xlsx patching) · ExcelJS (Excel report export) · adapter-node · Tableau Embedding API v3. Light theme only.
