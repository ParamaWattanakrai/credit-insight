# Tableau workbook guide

This guide builds the Tableau workbook (`credit_insight.twbx`) that the web app embeds on its **Tableau** page.
It takes about 30–45 minutes in Tableau Desktop or Tableau Public Desktop (free).

> Tableau files can only be created inside Tableau itself, so the workbook is not pre-generated in this
> repository. Follow the steps below, save the result as `tableau/credit_insight.twbx`, and publish it.

---

## 0. Which Tableau?

| Option | Cost | Data refresh after edits in the web app | Notes |
|---|---|---|---|
| **Tableau Public Desktop + Tableau Public** | Free | Re-publish (File → Save to Tableau Public) | Workbook and data are public. Fine for this synthetic Kaggle data. |
| **Tableau Desktop + Tableau Cloud/Server** | Licence (free via *Tableau for Students / Teaching*) | Live connection or scheduled extract refresh | Private, sign-in required to view embed. |

Either way the web app embeds the view the same way: paste the **Share** link on the Tableau page.

---

## 1. Connect to the data

1. Start the web app from the project folder and make sure your edits are saved (green dot, top right):

   ```bash
   docker compose up -d --build      # → http://localhost:3000
   ```

   (Without Docker: `npm install && npm run dev` → http://localhost:5173. The Excel file is the same either way.)
2. In Tableau: **Connect → To a File → Microsoft Excel** and choose
   `data/credit_card_customers.xlsx` **in the project folder on your computer**. Docker shares that folder with the
   container, so it is the live database — Tableau doesn't need to talk to the container. (Or download the latest
   copy from **Data → Download .xlsx** in the app.)
3. Drag the **Customers** sheet onto the canvas.
4. In the data grid, select the seven spending columns
   (`Online_Shopping_Spending`, `Grocery_Spending`, `Fuel_Spending`, `Dining_Spending`,
   `Travel_Spending`, `Entertainment_Spending`, `Utility_Bill_Spending`) → right-click → **Pivot**.
   Rename `Pivot Field Names` → **Spending Category** and `Pivot Field Values` → **Category Spend**.

   > Pivoting multiplies rows by 7. That is why every customer-level measure below uses
   > `COUNTD([Customer_ID])` or an `AVG`, never `SUM`.

5. Tableau Public: keep **Extract**. Tableau Desktop with a local file: **Live** lets you just press
   **Data → Refresh** after editing in the web app.

## 2. Calculated fields

Create these via **Analysis → Create Calculated Field**:

```text
Customers            = COUNTD([Customer_ID])

Age Band             = IF [Age] < 25 THEN "18–24"
                       ELSEIF [Age] < 35 THEN "25–34"
                       ELSEIF [Age] < 45 THEN "35–44"
                       ELSEIF [Age] < 55 THEN "45–54"
                       ELSEIF [Age] < 65 THEN "55–64"
                       ELSE "65+" END

Credit Score Band    = IF [Credit_Score] < 580 THEN "Poor (<580)"
                       ELSEIF [Credit_Score] < 670 THEN "Fair (580–669)"
                       ELSEIF [Credit_Score] < 740 THEN "Good (670–739)"
                       ELSEIF [Credit_Score] < 800 THEN "Very good (740–799)"
                       ELSE "Excellent (800+)" END

High Risk            = [Credit_Utilization] >= 0.8 AND [Payment_Ratio] < 0.3

High Risk %          = COUNTD(IF [High Risk] THEN [Customer_ID] END) / COUNTD([Customer_ID])

Card Tier Order      = CASE [Card_Type] WHEN "Basic" THEN 1 WHEN "Silver" THEN 2
                       WHEN "Gold" THEN 3 WHEN "Platinum" THEN 4 WHEN "Signature" THEN 5 END
```

Right-click `Card_Type` → **Sort** → *Field* `Card Tier Order` (Minimum, ascending) so every chart shows tiers in order.
Format `Payment_Ratio`, `Credit_Utilization` and `High Risk %` as percentages.

## 3. Worksheets

Build one worksheet per row. Names matter only for your own navigation.

| # | Sheet name | Columns | Rows | Marks / details | Answers |
|---|---|---|---|---|---|
| 1 | **KPI** | Measure Names | — | Text: `Customers`, `AVG(Credit_Score)`, `AVG(Monthly_Spending)`, `High Risk %` | Headline numbers |
| 2 | **Spend by Card** | `AVG(Monthly_Spending)` | `Card_Type` | Bar; Label on | Which tier spends most? |
| 3 | **Score Distribution** | `Credit_Score (bin)` *(right-click Credit_Score → Create → Bins, size 15)* | `Customers` | Bar; add reference line = Average Credit_Score | Shape of credit-score distribution |
| 4 | **Payment vs Score** | `Payment_Ratio` | `Credit_Score` | Circle; **Analysis → uncheck Aggregate Measures**; Detail `Customer_ID`; Analytics pane → **Trend Line (Linear)** | Paying more ↔ higher score? (r ≈ 0.77) |
| 5 | **Spending Mix** | `SUM(Category Spend)` | `Card_Type` | Bar, Color `Spending Category`; Quick Table Calculation → **Percent of Total**, *Compute Using → Spending Category* | Composition of spend per tier |
| 6 | **Utilization Heatmap** | `Card_Type` | `Occupation` | Square; Color `AVG(Credit_Utilization)` (sequential blue); Label on | Who uses most of their limit? |
| 7 | **Score Bands** | `Customers` | `Credit Score Band` | Bar; Color `AVG(Payment_Ratio)` | Size and payment behaviour of each band |
| 8 | **Age × Gender** | `Age Band` | `Customers` | Bar; Color `Gender`, side-by-side | Customer demographics |

Tips
- Use **Measure Values / Measure Names** for the KPI sheet, or four small text sheets.
- For the scatter, 50k points is fine in Tableau, but lower opacity to ~30% (Color → Opacity).
- Add tooltips that show `Customers` and the measure being plotted.

## 4. Dashboard

1. **Dashboard → New Dashboard**, size **Automatic** (so it fits the web page width) or *Fixed* 1300 × 820.
2. Layout (suggested):

   ```
   ┌────────────────────────── KPI ──────────────────────────┐
   ├──── Spend by Card ────┬──── Score Distribution ─────────┤
   ├──── Spending Mix ─────┼──── Payment vs Score ───────────┤
   ├──── Utilization Heatmap ───────┬──── Score Bands ───────┤
   └────────────────────────────────┴────────────────────────┘
   Filters (right side): Card_Type · Occupation · Gender · Age Band
   ```

3. Show filters for `Card_Type`, `Occupation`, `Gender`, `Age Band` and set each to
   **Apply to Worksheets → All Using This Data Source**.
4. Add a **Highlight** dashboard action on *Spend by Card* so clicking a tier highlights it everywhere.
5. Title: *Credit Card Customer Behaviour*. Save as `tableau/credit_insight.twbx`.

Optionally create a second dashboard (*Risk*) with sheets 4, 6, 7 — the web app supports several views as tabs.

## 5. Publish and embed

**Tableau Public**
1. **File → Save to Tableau Public…**, sign in, give it a name.
2. On the published page click **Share** → copy the *Link*, e.g.
   `https://public.tableau.com/views/CreditInsight/Dashboard`.

**Tableau Cloud / Server**
1. **Server → Publish Workbook**. For live data either publish with a live connection through
   **Tableau Bridge**, or publish an extract and schedule a refresh.
2. Open the view → **Share** → copy link.

**In the web app**
- Open **Tableau → + Add view**, paste the link. It is remembered in your browser.
- To show it for everyone, put it in `.env`:
  `PUBLIC_TABLEAU_URL=https://public.tableau.com/views/CreditInsight/Dashboard` and restart.

## 6. Keeping Tableau in sync with CRUD edits

```
Web app edit ──► credit_card_customers.xlsx (saved within a few seconds)
                    │
                    ├─ Tableau Desktop (live)  : Data → Refresh
                    ├─ Tableau Public          : open the workbook, Data → Refresh, Save to Tableau Public
                    └─ Tableau Cloud/Server    : Bridge live connection, or extract refresh (schedule / REST API)
                    │
Web app Tableau page ◄── click "↻ Reload view"
```

For a class demo: add a customer in the web app → Refresh in Tableau Desktop → re-publish → Reload view in the app.
