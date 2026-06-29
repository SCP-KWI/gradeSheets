# Notenblätter (gradeSheets)

Static web app that turns a points table (`.xlsx` / `.ods`) into one A5 grade sheet
per student and downloads them as a single PDF. Everything runs in the browser —
no backend, no data leaves the machine.

## Use

1. Open the app.
2. Upload the points table.
3. Enter exam name, optional subtitle, date, and *Punkte für Note 6*
   (prefilled with the maximum achievable total).
4. Click **PDF erstellen & herunterladen**.

### Expected table format

| Nachname | Vorname | 1a | 1b | … | Total | Note | … |
|----------|---------|----|----|---|-------|------|---|
| Max      |         | 1  | 1  | … |       |      |   |  ← per-exercise maximum
| Arnold   | Adam   | 1  | 0.5| … |       |      |   |
| …        | …       |    |    |   |       |      |   |

- **Name columns** are auto-detected: either one column (e.g. `Student name`)
  or two (`Nachname`, `Vorname` → rendered "Vorname Nachname"). Any leading
  text columns before the first numeric column count as the name.
- **Exercise columns** are the numeric columns between the name column(s) and
  the first summary column (`Total` / `Sum` / `Note` …); extra columns to the
  right are ignored.
- A row whose first cell is **`Max`** supplies the maximum points per exercise.
- Empty rows and a trailing class-average row (no name) are skipped.
- The **grade is read directly from the table** — a `Note` column, or
  `Note gerundet` if present (preferred). It is *not* recalculated, so whatever
  formula the spreadsheet uses is what appears on the sheet.

*Punkte für Note 6* is optional and only prints as a footer line
(`Note 6 für X Punkte`); leave it blank to omit the footer.

## Libraries (vendored in `js/`)

- [SheetJS](https://sheetjs.com) — spreadsheet parsing
- [pdfmake](http://pdfmake.org) — PDF generation
