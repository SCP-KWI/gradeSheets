"use strict";

/* ------------------------------------------------------------------ *
 *  Notenblätter — parse a points table and produce one A5 PDF page
 *  per student. 100% client-side (SheetJS + pdfmake).
 * ------------------------------------------------------------------ */

const els = {
  form: document.getElementById("form"),
  file: document.getElementById("file"),
  fileInfo: document.getElementById("fileInfo"),
  examName: document.getElementById("examName"),
  subtitle: document.getElementById("subtitle"),
  date: document.getElementById("date"),
  grade6: document.getElementById("grade6"),
  grade6Hint: document.getElementById("grade6Hint"),
  submit: document.getElementById("submit"),
  status: document.getElementById("status"),
  preview: document.getElementById("preview"),
};

// Holds the most recently parsed table so we can react to a file change
// (e.g. prefill the "points for grade 6" field with the max total).
let parsed = null;

// Default today's date.
els.date.valueAsDate = new Date();

/* --------------------------- helpers ------------------------------ */

// Format a number for display: round to 2 decimals, strip trailing zeros.
function fmt(n) {
  if (n === null || n === undefined || n === "" || isNaN(n)) return "0";
  const r = Math.round(Number(n) * 100) / 100;
  return String(r);
}

// Format the grade exactly as it appears in the table, only normalising a
// whole number to one decimal place (6 -> "6.0"); fractional grades such as
// 5.25 are preserved as-is. Non-numeric values are shown verbatim.
function fmtGrade(v) {
  const raw = norm(v);
  if (raw === "") return "–";
  const n = Number(raw.replace(",", "."));
  if (isNaN(n)) return raw;
  let s = String(Math.round(n * 100) / 100);
  if (!s.includes(".")) s += ".0";
  return s;
}

function formatDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

function setStatus(msg, kind) {
  els.status.hidden = false;
  els.status.className = "status " + (kind || "info");
  els.status.textContent = msg;
}

function norm(v) {
  return String(v == null ? "" : v).trim();
}

/* --------------------------- parsing ------------------------------ */

// Turn a sheet (array-of-arrays) into {exercises, max, students}.
function parseTable(rows) {
  if (!rows.length) throw new Error("Die Datei enthält keine Daten.");

  const header = rows[0].map(norm);

  // Find where the exercise columns end: the first column whose header is
  // Total / Note / Punkte / Durchschnitt etc. Exercises live between the
  // name columns (0 = Nachname, 1 = Vorname) and that boundary.
  const stopRe = /^(total|note|punkte|summe|durchschnitt|schnitt|mittel)/i;
  let endCol = header.length;
  for (let c = 2; c < header.length; c++) {
    if (stopRe.test(header[c])) { endCol = c; break; }
  }
  const exCols = [];
  for (let c = 2; c < endCol; c++) {
    if (header[c] !== "") exCols.push(c);
  }
  if (!exCols.length) {
    throw new Error("Keine Aufgaben-Spalten gefunden (erwartet: Nachname, Vorname, dann die Aufgaben).");
  }
  const exercises = exCols.map((c) => header[c]);

  // Locate the grade column. The grade is taken straight from the table
  // (the teacher's formula may vary), preferring a rounded column
  // ("Note gerundet") over a raw "Note" column.
  let gradeCol = -1;
  for (let c = 2; c < header.length; c++) {
    if (/note|grad/i.test(header[c])) {
      if (gradeCol === -1) gradeCol = c;
      if (/(gerund|rund)/i.test(header[c])) gradeCol = c;
    }
  }
  if (gradeCol === -1) {
    throw new Error('Keine Noten-Spalte gefunden. Die Tabelle muss eine Spalte "Note" (oder "Note gerundet") mit der fertigen Note pro Schüler:in enthalten.');
  }

  // Locate the "Max" row (Nachname === "Max"), giving per-exercise maxima.
  let maxRow = null;
  const dataRows = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const last = norm(row[0]);
    const first = norm(row[1]);
    if (!maxRow && last.toLowerCase() === "max") { maxRow = row; continue; }
    // Skip empty rows and the trailing average row (no name at all).
    if (last === "" && first === "") continue;
    dataRows.push(row);
  }
  if (!maxRow) {
    throw new Error('Keine "Max"-Zeile gefunden. Die erste Datenzeile muss in der Spalte Nachname "Max" enthalten und die maximale Punktzahl pro Aufgabe angeben.');
  }

  const num = (v) => {
    const n = Number(String(v == null ? "" : v).replace(",", "."));
    return isNaN(n) ? 0 : n;
  };

  const max = exCols.map((c) => num(maxRow[c]));
  const maxTotal = max.reduce((a, b) => a + b, 0);

  const students = dataRows.map((row) => {
    const last = norm(row[0]);
    const first = norm(row[1]);
    const points = exCols.map((c) => num(row[c]));
    const total = points.reduce((a, b) => a + b, 0);
    return {
      name: [first, last].filter(Boolean).join(" "),
      points,
      total,
      grade: fmtGrade(row[gradeCol]),
    };
  });

  return { exercises, max, maxTotal, students };
}

async function readFile(file) {
  const buf = await file.arrayBuffer();
  // SheetJS logs noisy (harmless) warnings for ODS conditional number
  // formats; mute just those while reading.
  const origErr = console.error;
  console.error = (...a) => {
    if (typeof a[0] === "string" && a[0].startsWith("ODS number format")) return;
    origErr.apply(console, a);
  };
  let wb;
  try {
    wb = XLSX.read(buf, { type: "array" });
  } finally {
    console.error = origErr;
  }
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: "" });
  return parseTable(rows);
}

/* --------------------------- preview ------------------------------ */

function renderPreview(p) {
  const head =
    "<tr><th>Schüler:in</th>" +
    p.exercises.map((e) => `<th>${e}</th>`).join("") +
    "<th>Total</th><th>Note</th></tr>";
  const maxRow =
    `<tr><th>Max</th>` +
    p.max.map((m) => `<td class="num">${fmt(m)}</td>`).join("") +
    `<td class="num">${fmt(p.maxTotal)}</td><td></td></tr>`;
  const body = p.students
    .map(
      (s) =>
        `<tr><td>${s.name}</td>` +
        s.points.map((v) => `<td class="num">${fmt(v)}</td>`).join("") +
        `<td class="num">${fmt(s.total)}</td><td class="num">${s.grade}</td></tr>`
    )
    .join("");
  els.preview.hidden = false;
  els.preview.innerHTML =
    `<p class="hint">${p.students.length} Schüler:in(nen), ${p.exercises.length} Aufgaben erkannt:</p>` +
    `<table>${head}${maxRow}${body}</table>`;
}

/* --------------------------- pdf ----------------------------------- */

function buildDocDefinition(p, meta) {
  const content = [];

  p.students.forEach((s, idx) => {
    const tableBody = [
      [
        { text: "Aufgabe", style: "th" },
        { text: "Punkte", style: "th", alignment: "right" },
      ],
    ];
    p.exercises.forEach((ex, i) => {
      tableBody.push([
        { text: "Aufgabe " + ex },
        { text: `${fmt(s.points[i])} / ${fmt(p.max[i])}`, alignment: "right" },
      ]);
    });
    tableBody.push([
      { text: "Total", bold: true },
      { text: `${fmt(s.total)} / ${fmt(p.maxTotal)}`, bold: true, alignment: "right" },
    ]);
    tableBody.push([
      { text: "Note", bold: true },
      { text: s.grade, bold: true, alignment: "right" },
    ]);

    const block = [
      { text: meta.examName, style: "title" },
    ];
    if (meta.subtitle) block.push({ text: meta.subtitle, style: "subtitle" });
    block.push(
      { text: "Datum: " + meta.dateText, style: "metaLine", margin: [0, 8, 0, 0] },
      { text: "Name: " + s.name, style: "metaLine", margin: [0, 2, 0, 8] },
      { text: "Punkte:", margin: [0, 0, 0, 4] },
      {
        table: { headerRows: 1, widths: ["*", "auto"], body: tableBody },
        layout: {
          hLineColor: () => "#cccccc",
          vLineColor: () => "#cccccc",
        },
      }
    );
    if (meta.grade6) {
      block.push({ text: `Note 6 für ${fmt(meta.grade6)} Punkte`, style: "footer", margin: [0, 10, 0, 0] });
    }

    content.push({
      stack: block,
      pageBreak: idx < p.students.length - 1 ? "after" : undefined,
    });
  });

  return {
    pageSize: "A5",
    pageMargins: [40, 40, 40, 40],
    content,
    defaultStyle: { fontSize: 11 },
    styles: {
      title: { fontSize: 18, bold: true, alignment: "center" },
      subtitle: { fontSize: 11, italics: true, color: "#555555", alignment: "center", margin: [0, 2, 0, 0] },
      metaLine: { fontSize: 11 },
      th: { bold: true, fillColor: "#f0f0f0" },
      footer: { fontSize: 10, color: "#555555", italics: true },
    },
  };
}

/* --------------------------- events -------------------------------- */

els.file.addEventListener("change", async () => {
  parsed = null;
  els.fileInfo.textContent = "";
  els.preview.hidden = true;
  els.status.hidden = true;
  const file = els.file.files[0];
  if (!file) return;
  try {
    parsed = await readFile(file);
    els.fileInfo.textContent =
      `${file.name} — ${parsed.students.length} Schüler:in(nen), ${parsed.exercises.length} Aufgaben.`;
    // Prefill points-for-6 with the maximum achievable total if empty.
    if (!els.grade6.value) els.grade6.value = fmt(parsed.maxTotal);
    els.grade6Hint.textContent = `Max. erreichbar laut "Max"-Zeile: ${fmt(parsed.maxTotal)} Punkte.`;
    renderPreview(parsed);
  } catch (err) {
    setStatus("Fehler beim Einlesen: " + err.message, "err");
  }
});

els.form.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!parsed) { setStatus("Bitte zuerst eine gültige Punktetabelle hochladen.", "err"); return; }

  const g6 = Number(els.grade6.value);
  const meta = {
    examName: els.examName.value.trim(),
    subtitle: els.subtitle.value.trim(),
    dateText: formatDate(els.date.value),
    grade6: g6 > 0 ? g6 : null, // footer only; optional
  };
  if (!parsed.students.length) {
    setStatus("Keine Schüler:innen in der Tabelle gefunden.", "err");
    return;
  }

  els.submit.disabled = true;
  setStatus("PDF wird erstellt …", "info");

  try {
    const def = buildDocDefinition(parsed, meta);
    const safe = (meta.examName || "Notenblaetter").replace(/[^\wÀ-ſ-]+/g, "_");
    pdfMake.createPdf(def).download(safe + ".pdf", () => {
      setStatus(`✓ PDF mit ${parsed.students.length} Notenblättern erstellt.`, "ok");
      els.submit.disabled = false;
    });
  } catch (err) {
    setStatus("Fehler bei der PDF-Erstellung: " + err.message, "err");
    els.submit.disabled = false;
  }
});
