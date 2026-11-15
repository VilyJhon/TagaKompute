/* ---------- Logo: University of Makati seal (umak-seal.png) ---------- */
(function applyLogos() {
  document.querySelectorAll("img[data-logo]").forEach(img => { img.src = "umak-seal.png"; });
  let fav = document.querySelector('link[rel="icon"]');
  if (!fav) { fav = document.createElement("link"); fav.rel = "icon"; document.head.appendChild(fav); }
  fav.type = "image/png";
  fav.href = "umak-seal.png";
})();

/* ==========================================================================
   TagaKompute - Logic
   Grading basis: University of Makati - University Grades and Markings
   Each Student ID has its own record: program, subjects (with units), grades.
   A subject can optionally be graded by Midterm + Finals with its own
   percentage split (e.g. 40% / 60%).
   Records are stored in the browser (localStorage).
   ========================================================================== */

/* ---------- Grading Data ---------- */
/* [grade, adjectival equivalent, representative percentage] */
const GRADE_TABLE = [
  ["1.00", "Excellent", 98.5],
  ["1.25", "Superior", 95],
  ["1.50", "Superior", 92],
  ["1.75", "Very Good", 89],
  ["2.00", "Very Good", 86],
  ["2.25", "Good", 83],
  ["2.50", "Good", 80],
  ["2.75", "Fair", 77],
  ["3.00", "Fair", 75],
  ["4.00", "Conditional Failure", 72],
  ["5.00", "Failure", 65]
];

/* Special markings (not counted in GWA) */
const MARKINGS = {
  "INC": { label: "INCOMPLETE", status: "neutral" },
  "OD":  { label: "OFFICIALLY DROPPED", status: "neutral" },
  "UD":  { label: "UNOFFICIALLY DROPPED", status: "neutral" },
  "P":   { label: "PASSED", status: "pass" },
  "F":   { label: "FAILED", status: "fail" }
};

/* Markings offered next to Midterm / Finals inputs */
const TERM_MARKS = ["INC", "OD", "UD"];

const PASSING_GRADE = 3.0;
const STORAGE_KEY = "gradingSheet.records";
const DEFAULT_MID = 50;
const DEFAULT_FIN = 50;
const MAX_PARTS = 10;                       /* components allowed in one Grading Section */
const PART_PRESET = [{ name: "Quiz", weight: 30 }, { name: "Activity", weight: 40 }, { name: "Exam", weight: 30 }];
const clampScore = n => Math.min(100, Math.max(0, n));

/* ---------- State ---------- */
let mode = "pct";
/* current = { id, name, program, term,
     subjects: [{id, code, title, units, counted, type, terms, wMid, wFin}],
     entries: { [subjectId]: {m, v}  or, for terms subjects, {m:"pct", v:"" | marking, mid, fin} } } */
let current = null;

/* ---------- Helpers ---------- */
function esc(text) {
  return String(text).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function newSubjectId() {
  return "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function initials(id, name) {
  const source = (name || id).replace(/[^A-Za-z0-9 ,]/g, "").trim();
  const parts = source.split(/[ ,]+/).filter(Boolean);
  const text = parts.length > 1 ? parts[0][0] + parts[1][0] : source.slice(0, 2);
  return text.toUpperCase();
}

function countedSubjects(subjects) {
  return subjects.filter(s => s.counted);
}

function totalUnits(subjects) {
  return countedSubjects(subjects).reduce((sum, s) => sum + s.units, 0);
}

function formatUnits(n) {
  return Number.isInteger(n) ? n.toFixed(1) : String(n);
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/* Only accept photos we created ourselves (small image data URLs) */
function safePhoto(photo) {
  return typeof photo === "string" && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/.test(photo) ? photo : "";
}

/* Show the student's photo in an avatar, or their initials when there is none */
function setAvatar(el, photo, id, name) {
  const src = safePhoto(photo);
  if (src) {
    el.style.backgroundImage = "url('" + src + "')";
    el.classList.add("has-photo");
    el.textContent = "";
  } else {
    el.style.backgroundImage = "";
    el.classList.remove("has-photo");
    el.textContent = initials(id, name);
  }
}

/* Make sure a stored subject has every field the app expects */
function normalizeSubject(s) {
  const wMid = parseFloat(s.wMid);
  const wFin = parseFloat(s.wFin);
  const parts = Array.isArray(s.parts) ? s.parts.slice(0, MAX_PARTS).map(p => ({
    id: (p && p.id) || newSubjectId(), name: String((p && p.name) || "").slice(0, 24), weight: parseFloat(p && p.weight) || 0
  })) : [];
  const grading = !!s.grading && parts.length > 0;
  return {
    id: s.id || newSubjectId(),
    code: s.code || "",
    title: s.title || "",
    units: parseFloat(s.units) || 0,
    counted: s.counted !== false,
    type: s.type === "minor" ? "minor" : "major",
    terms: !!s.terms && !grading,
    wMid: isNaN(wMid) ? DEFAULT_MID : wMid,
    wFin: isNaN(wFin) ? DEFAULT_FIN : wFin,
    grading: grading,
    parts: grading ? parts : []
  };
}

/* ---------- Storage ---------- */
function loadRecords() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch (e) {
    return {};
  }
}

function saveRecords(records) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    return true;
  } catch (e) {
    return false;
  }
}

/* A record = one student: name, photo, program + a list of terms (year & semester),
   each with its own subjects and grades. current.term/subjects/entries mirror the active term. */
function recTerms(r) {
  if (r.terms && r.terms.length) return r.terms;
  return [{ id: "t1", term: r.term || "", subjects: r.subjects || [], entries: r.entries || {} }];
}

function syncActive() {
  if (!current || !current.terms) return;
  const t = current.terms.find(x => x.id === current.activeId);
  if (t) { t.term = current.term; t.subjects = current.subjects; t.entries = current.entries; }
}

function loadTermInto(t) {
  current.activeId = t.id;
  current.term = t.term || "";
  current.subjects = t.subjects.map(normalizeSubject);
  current.entries = t.entries || {};
}

/* "1st Year - 1st Sem" -> "1st Year - 2nd Sem" -> "2nd Year - 1st Sem" */
function nextTermLabel(label) {
  const ord = ["1st", "2nd", "3rd", "4th", "5th", "6th"];
  const y = String(label || "").match(/(\d)(?:st|nd|rd|th)\s+year/i);
  const m = String(label || "").match(/\b(1st|2nd)\s+sem/i);
  if (!y || !m) return "";
  let year = parseInt(y[1], 10), sem = m[1].toLowerCase();
  if (sem === "1st") sem = "2nd"; else { sem = "1st"; year++; }
  return (ord[year - 1] || year + "th") + " Year - " + sem + " Sem";
}

function cumulativeGwa() {
  syncActive();
  let points = 0, units = 0;
  current.terms.forEach(t => countedSubjects(t.subjects).forEach(s => {
    const r = evaluate(t.entries[s.id], s);
    if (r && !r.special) { points += r.grade * s.units; units += s.units; }
  }));
  return units ? points / units : null;
}

function persistCurrent() {
  if (!current || !current.subjects.length) return;
  syncActive();
  const records = loadRecords();
  records[current.id] = {
    name: current.name,
    photo: current.photo || "",
    program: current.program,
    terms: current.terms,
    activeId: current.activeId,
    updated: new Date().toISOString()
  };
  if (!saveRecords(records)) showToast("Could not save - browser storage is full");
}

/* ---------- Conversion ---------- */
function percentToGrade(percent) {
  if (percent >= 97) return 1.00;
  if (percent >= 94) return 1.25;
  if (percent >= 91) return 1.50;
  if (percent >= 88) return 1.75;
  if (percent >= 85) return 2.00;
  if (percent >= 82) return 2.25;
  if (percent >= 79) return 2.50;
  if (percent >= 76) return 2.75;
  if (percent >= 75) return 3.00;
  if (percent >= 70) return 4.00;
  return 5.00;
}

function lookupGrade(grade) {
  return GRADE_TABLE.find(entry => parseFloat(entry[0]) === grade);
}

function clampPercent(n) {
  return Math.min(100, Math.max(1, n));
}

/* Evaluate one stored entry -> result object, or null if empty/invalid.
   Subjects graded by Midterm + Finals combine both using their weights;
   both scores are needed before a grade is shown. */
function evaluate(entry, subject) {
  if (!entry) return null;

  if (entry.v && MARKINGS[entry.v]) {
    const mark = MARKINGS[entry.v];
    return { special: true, status: mark.status, badge: mark.label, note: "" };
  }

  let grade, percent, prefix = "";

  if (subject && subject.terms) {
    const mid = parseFloat(entry.mid);
    const fin = parseFloat(entry.fin);
    if (isNaN(mid) || isNaN(fin)) return null;
    const m = clampPercent(mid);
    const f = clampPercent(fin);
    const total = subject.wMid + subject.wFin;
    if (!(total > 0)) return null;
    percent = round2((m * subject.wMid + f * subject.wFin) / total);
    grade = percentToGrade(percent);
    prefix = "= " + lookupGrade(grade)[0] + " | ";
  } else if (subject && subject.grading) {
    /* Grading Section: every component needs a score, then they are combined by weight */
    const byGrade = entry.gm === "grade";
    const scores = (byGrade ? entry.gg : entry.g) || {};
    let sum = 0, total = 0;
    for (const p of subject.parts) {
      const v = parseFloat(scores[p.id]);
      if (isNaN(v)) return null;
      let sc;
      if (byGrade) { const row = lookupGrade(v); if (!row) return null; sc = row[2]; }   /* 1.25 -> its percentage equivalent */
      else sc = clampScore(v);
      sum += sc * p.weight;
      total += p.weight;
    }
    if (!(total > 0)) return null;
    percent = round2(sum / total);
    grade = percentToGrade(percent);
    prefix = "= " + lookupGrade(grade)[0] + " | ";
  } else {
    if (entry.v === undefined || entry.v === "") return null;
    if (entry.m === "pct") {
      percent = clampPercent(parseFloat(entry.v));
      if (isNaN(percent)) return null;
      grade = percentToGrade(percent);
      prefix = "= " + lookupGrade(grade)[0] + " | ";
    } else {
      grade = parseFloat(entry.v);
      if (isNaN(grade) || !lookupGrade(grade)) return null;
      percent = lookupGrade(grade)[2];
    }
  }

  const row = lookupGrade(grade);
  const passed = grade <= PASSING_GRADE;
  return {
    special: false,
    status: passed ? "pass" : "fail",
    badge: passed ? "PASSED" : (grade === 4 ? "COND. FAILURE" : "FAILED"),
    note: prefix + row[1],
    grade: grade,
    percent: percent
  };
}

/* Summary of grades (only subjects counted in GWA), with major / minor breakdown */
function summarize(subjects, entries) {
  let points = 0, percentSum = 0, gradedUnits = 0, earned = 0, passed = 0, failed = 0;
  const byType = { major: { points: 0, units: 0 }, minor: { points: 0, units: 0 } };

  countedSubjects(subjects).forEach(subject => {
    const result = evaluate(entries[subject.id], subject);
    if (!result) return;

    if (result.status === "pass") { passed++; earned += subject.units; }
    if (result.status === "fail") { failed++; }
    if (!result.special) {
      const type = subject.type === "minor" ? "minor" : "major";
      gradedUnits += subject.units;
      points += result.grade * subject.units;
      percentSum += result.percent * subject.units;
      byType[type].points += result.grade * subject.units;
      byType[type].units += subject.units;
    }
  });

  return {
    gwa: gradedUnits ? (points / gradedUnits).toFixed(2) : null,
    avg: gradedUnits ? (percentSum / gradedUnits).toFixed(1) : null,
    majorGwa: byType.major.units ? (byType.major.points / byType.major.units).toFixed(2) : null,
    minorGwa: byType.minor.units ? (byType.minor.points / byType.minor.units).toFixed(2) : null,
    passed: passed,
    failed: failed,
    earned: earned
  };
}

/* ---------- UI Helpers ---------- */
function animateValue(el, target, decimals, suffix) {
  cancelAnimationFrame(el._raf);
  if (target === null) {
    el.textContent = "–";
    el._value = 0;
    return;
  }
  const from = el._value || 0;
  const start = performance.now();
  const duration = 500;

  function step(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = (from + (target - from) * eased).toFixed(decimals) + suffix;
    if (t < 1) el._raf = requestAnimationFrame(step);
    else el._value = target;
  }
  el._raf = requestAnimationFrame(step);
}

let toastTimer;
function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2200);
}

const screens = {
  gate: document.getElementById("gate"),
  setup: document.getElementById("setup"),
  app: document.getElementById("app")
};

function showScreen(name) {
  Object.keys(screens).forEach(key => { screens[key].hidden = key !== name; });
  window.scrollTo(0, 0);
}

/* ---------- Login & Saved Records ---------- */
const gateForm = document.getElementById("gateForm");
const recordList = document.getElementById("recordList");

function gateError(message) {
  const el = document.getElementById("gateError");
  el.textContent = message;
  el.hidden = false;
  el.style.animation = "none";
  void el.offsetWidth;
  el.style.animation = "";
}

function renderRecords() {
  const records = loadRecords();
  const ids = Object.keys(records).sort((a, b) =>
    String(records[b].updated || "").localeCompare(String(records[a].updated || "")));

  if (!ids.length) {
    recordList.innerHTML = '<p class="record-empty">No saved records yet.</p>';
    return;
  }

  recordList.innerHTML = ids.map(id => {
    const r = records[id];
    const rt = recTerms(r);
    const act = rt.find(t => t.id === r.activeId) || rt[rt.length - 1];
    const count = (act.subjects || []).length;
    const photo = safePhoto(r.photo);
    const avatar = photo
      ? `<div class="avatar has-photo" style="background-image:url('${photo}')"></div>`
      : `<div class="avatar">${esc(initials(id, r.name))}</div>`;
    return `
      <div class="record-item">
        ${avatar}
        <div class="record-info">
          <b>${esc(id)}${r.name ? " &middot; " + esc(r.name) : ""}</b>
          <small>${esc(r.program || "No program")} &middot; ${act.term ? esc(act.term) + " &middot; " : ""}${count} subject${count === 1 ? "" : "s"}${rt.length > 1 ? " &middot; " + rt.length + " terms" : ""}</small>
        </div>
        <div class="record-buttons">
          <button type="button" data-act="open" data-id="${esc(id)}">Open</button>
          <button type="button" class="danger" data-act="delete" data-id="${esc(id)}">Delete</button>
        </div>
      </div>`;
  }).join("");
}

function enterRecord(id, name) {
  const rec = loadRecords()[id];
  const terms = rec ? recTerms(rec).filter(t => t.subjects && t.subjects.length) : [];
  const base = {
    id: id, name: name || (rec && rec.name) || "", photo: safePhoto(rec && rec.photo),
    program: (rec && rec.program) || "", terms: [], activeId: "", term: "", subjects: [], entries: {}
  };
  current = base;
  if (terms.length) {
    base.terms = terms.map(t => ({ id: t.id || newSubjectId(), term: t.term || "", subjects: t.subjects.map(normalizeSubject), entries: t.entries || {} }));
    loadTermInto(base.terms.find(t => t.id === rec.activeId) || base.terms[base.terms.length - 1]);
    persistCurrent();
    showSheet();
  } else {
    openSetup(false);
  }
}

gateForm.addEventListener("submit", event => {
  event.preventDefault();
  const id = document.getElementById("studentId").value.trim().toUpperCase();
  const name = document.getElementById("studentName").value.trim();
  if (!/^[A-Z0-9-]{3,20}$/.test(id)) {
    return gateError("Enter a valid Student ID (letters, numbers and dashes, 3-20 characters).");
  }
  document.getElementById("gateError").hidden = true;
  enterRecord(id, name);
});

recordList.addEventListener("click", event => {
  const button = event.target.closest("button[data-act]");
  if (!button) return;
  const id = button.dataset.id;

  if (button.dataset.act === "open") {
    enterRecord(id, "");
  } else if (button.dataset.act === "delete") {
    if (!confirm("Delete the saved record for " + id + "? This cannot be undone.")) return;
    const records = loadRecords();
    delete records[id];
    saveRecords(records);
    renderRecords();
    showToast("Record deleted");
  }
});

/* ---------- TagaKompute ---------- */
const list = document.getElementById("list");

/* Value shown in the input for the active mode */
function displayValue(entry) {
  if (!entry || entry.v === undefined || entry.v === "") return "";
  if (MARKINGS[entry.v] || entry.m === mode) return entry.v;
  if (entry.m === "pct" && mode === "grade") {
    const n = parseFloat(entry.v);
    return isNaN(n) ? "" : percentToGrade(n).toFixed(2);
  }
  return "";   /* grade -> percentage cannot be recovered */
}

function buildInput(subjectId, value) {
  if (mode === "pct") {
    return `<input type="number" min="1" max="100" step="0.01" placeholder="%" data-id="${subjectId}" value="${esc(value)}">`;
  }
  const grades = GRADE_TABLE.map(g => `<option${g[0] === value ? " selected" : ""}>${g[0]}</option>`).join("");
  const marks = Object.keys(MARKINGS).map(m => `<option${m === value ? " selected" : ""}>${m}</option>`).join("");
  return `<select data-id="${subjectId}"><option value="">Grade</option>${grades}${marks}</select>`;
}

/* Midterm + Finals = Semester Grade, shown as separate parts */
function breakdownHTML(subject, entry, result) {
  const e = entry || {};
  const mid = parseFloat(e.mid), fin = parseFloat(e.fin);
  const hasMid = !isNaN(mid), hasFin = !isNaN(fin);
  const part = (label, weight, has, value) => {
    const shown = has ? clampPercent(value) : null;
    return `<div class="bd-cell"><small>${label} &times; ${weight}%</small>` +
      `<b>${has ? round2(shown) + " &rarr; " + round2(shown * weight / 100) : "&ndash;"}</b></div>`;
  };

  let total;
  if (result && result.special) {
    total = result.badge;
  } else if (result) {
    total = result.percent.toFixed(2) + "% &middot; " + lookupGrade(result.grade)[0];
  } else {
    total = "&ndash;";
  }

  return part("Midterm", subject.wMid, hasMid, mid) +
    '<span class="bd-op">+</span>' +
    part("Finals", subject.wFin, hasFin, fin) +
    '<span class="bd-op">=</span>' +
    `<div class="bd-cell total"><small>Semester grade</small><b>${total}</b></div>`;
}

/* Midterm + Finals inputs (always entered as percentages) */
function buildTermInputs(subject, entry) {
  const e = entry || {};
  const marks = TERM_MARKS.map(m => `<option${e.v === m ? " selected" : ""}>${m}</option>`).join("");
  return `
    <div class="terms">
      <label>Midterm &middot; ${subject.wMid}%
        <input type="number" min="1" max="100" step="0.01" placeholder="%" data-id="${subject.id}" data-part="mid" value="${esc(e.mid === undefined ? "" : e.mid)}">
      </label>
      <label>Finals &middot; ${subject.wFin}%
        <input type="number" min="1" max="100" step="0.01" placeholder="%" data-id="${subject.id}" data-part="fin" value="${esc(e.fin === undefined ? "" : e.fin)}">
      </label>
    </div>
    <select class="mark" data-id="${subject.id}" data-part="mark" title="Special marking"><option value="">Computed grade</option>${marks}</select>`;
}

/* Student photo, ID and name in the top bar */
function renderHeader() {
  setAvatar(document.getElementById("avatar"), current.photo, current.id, current.name);
  document.getElementById("chipId").textContent = current.id;
  document.getElementById("chipName").textContent = current.name;
}

function build() {
  const units = totalUnits(current.subjects);
  document.getElementById("navTitle").textContent = current.program;
  document.getElementById("navSub").textContent =
    (current.term ? current.term + " · " : "") + formatUnits(units) + " units counted";
  renderHeader();
  renderTermsBar();

  list.innerHTML = "";
  current.subjects.forEach((subject, i) => {
    const row = document.createElement("div");
    row.className = "row" + (subject.counted ? "" : " skip") + (subject.terms ? " has-terms" : "") + (subject.grading ? " has-grading" : "");
    row.id = "r" + i;
    row.style.setProperty("--d", i * 60 + "ms");

    const entry = current.entries[subject.id];
    const inputs = subject.terms ? buildTermInputs(subject, entry) : subject.grading ? buildGradingInputs(subject, entry) : buildInput(subject.id, displayValue(entry));
    const right = subject.counted
      ? `<div class="right">${inputs}<div class="eq"></div><span class="badge">PENDING</span></div>`
      : `<div class="right"><span class="skip-note">Not counted</span></div>`;

    const split = subject.terms ? `<span class="split">Mid ${subject.wMid}% / Final ${subject.wFin}%</span>`
      : subject.grading ? `<span class="split">Grading Section &middot; ${subject.parts.map(p => esc(p.name) + " " + round2(p.weight) + "%").join(" / ")}</span>` : "";

    row.innerHTML = `
      <div>
        <div class="code">${subject.code ? `<span>${esc(subject.code)}</span>` : ""}<em class="type-chip ${subject.type === "minor" ? "minor" : "major"}">${subject.type === "minor" ? "Minor" : "Major"}</em>${subject.counted ? "" : "Excluded from GWA"}</div>
        <div class="title">${esc(subject.title)}</div>
        <div class="units">${formatUnits(subject.units)} units${split}</div>
        ${(subject.terms || subject.grading) && subject.counted ? '<div class="breakdown"></div>' : ""}
      </div>
      ${right}`;
    list.appendChild(row);
  });

  document.getElementById("rule").textContent = mode === "pct"
    ? "75% up: Passed | 70-74%: Cond. Failure | 69% below: Failure"
    : "1.00-3.00: Passed | 4.00: Cond. Failure | 5.00: Failure";
  refresh();
}

function refresh() {
  /* Read fields into the current record */
  document.querySelectorAll("#list [data-id]").forEach(field => {
    const id = field.dataset.id;
    const part = field.dataset.part;

    if (part) {
      const e = current.entries[id] || (current.entries[id] = { m: "pct", v: "" });
      if (part === "mark") e.v = field.value;
      else if (part === "g" || part === "gg") {
        e[part] = e[part] || {};
        if (field.value === "") delete e[part][field.dataset.gid]; else e[part][field.dataset.gid] = field.value;
      }
      else if (field.value === "") delete e[part];
      else e[part] = field.value;
    } else if (field.value === "") {
      delete current.entries[id];
    } else {
      current.entries[id] = { m: mode, v: field.value };
    }
  });

  /* Drop empty Midterm / Finals records */
  Object.keys(current.entries).forEach(id => {
    const e = current.entries[id];
    if (e && e.g && !Object.keys(e.g).length) delete e.g;
    if (e && e.gg && !Object.keys(e.gg).length) delete e.gg;
    if (e && e.mid === undefined && e.fin === undefined && !e.g && !e.gg && !e.gm && !e.v) delete current.entries[id];
  });

  /* Per-row display */
  current.subjects.forEach((subject, i) => {
    if (!subject.counted) return;
    const row = document.getElementById("r" + i);
    const result = evaluate(current.entries[subject.id], subject);
    row.className = "row" + (subject.terms ? " has-terms" : "") + (subject.grading ? " has-grading" : "");
    row.querySelector(".badge").textContent = "PENDING";
    row.querySelector(".eq").textContent = "";
    const bd = row.querySelector(".breakdown");
    if (bd) bd.innerHTML = (subject.grading ? gradingBreakdownHTML : breakdownHTML)(subject, current.entries[subject.id], result);
    if (subject.grading) row.querySelectorAll('input[data-part="g"]').forEach(inp => {
      const v = parseFloat(inp.value);
      inp.classList.toggle("bad", inp.value !== "" && (isNaN(v) || v < 0 || v > 100));
    });
    const nowSt = result ? result.status : "";
    const prevSt = row.dataset.st;
    row.dataset.st = nowSt;
    if (prevSt !== undefined && prevSt !== nowSt && nowSt) row.classList.add("flash");
    if (!result) return;
    if (result.status !== "neutral") row.classList.add(result.status);
    row.querySelector(".badge").textContent = result.badge;
    row.querySelector(".eq").textContent = result.note;
  });

  /* Totals */
  const units = totalUnits(current.subjects);
  const s = summarize(current.subjects, current.entries);
  animateValue(document.getElementById("gwa"), s.gwa === null ? null : parseFloat(s.gwa), 2, "");
  animateValue(document.getElementById("avg"), s.avg === null ? null : parseFloat(s.avg), 1, "%");
  animateValue(document.getElementById("majorGwa"), s.majorGwa === null ? null : parseFloat(s.majorGwa), 2, "");
  animateValue(document.getElementById("minorGwa"), s.minorGwa === null ? null : parseFloat(s.minorGwa), 2, "");
  document.getElementById("cumStat").hidden = current.terms.length < 2;
  animateValue(document.getElementById("cumGwa"), cumulativeGwa(), 2, "");
  updateHero(s);
  if (window.updateMascot) updateMascot(s);
  updateTermChips();
  animateValue(document.getElementById("np"), s.passed, 0, "");
  animateValue(document.getElementById("nf"), s.failed, 0, "");
  document.getElementById("unitsText").textContent = formatUnits(s.earned) + " / " + formatUnits(units);
  document.getElementById("prog").style.width = (units ? s.earned / units * 100 : 0) + "%";
}

function renderTermsBar() {
  syncActive();
  document.getElementById("termsBar").innerHTML = current.terms.map((t, i) =>
    `<button type="button" class="term-chip${t.id === current.activeId ? " active" : ""}" data-term="${esc(t.id)}">${esc(t.term || "Term " + (i + 1))}<i class="chip-gwa"></i></button>`
  ).join("") + '<button type="button" class="term-chip add" id="addTerm">+ Next term</button>';
}

function switchTerm(id) {
  const target = current.terms.find(t => t.id === id);
  if (!target) return;
  const from = current.terms.findIndex(t => t.id === current.activeId);
  const to = current.terms.indexOf(target);
  persistCurrent();
  const wrap = document.querySelector("#app .wrap");
  wrap.dataset.dir = to > from ? "next" : "prev";
  wrap.classList.add("swap-out");
  setTimeout(() => {
    loadTermInto(target);
    persistCurrent();
    build();
    wrap.classList.remove("swap-out");
    wrap.classList.add("swap-in");
    setTimeout(() => wrap.classList.remove("swap-in"), 450);
  }, 180);
}

document.getElementById("termsBar").addEventListener("click", event => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.id === "addTerm") { persistCurrent(); openSetup(false, true); return; }
  if (button.dataset.term !== current.activeId) switchTerm(button.dataset.term);
});

function onEdit() {
  refresh();
  persistCurrent();
}

function showSheet() {
  newTermMode = false;
  showScreen("app");
  const app = screens.app;
  app.classList.remove("enter");
  void app.offsetWidth;
  app.classList.add("enter");
  build();
}

function setMode(next) {
  mode = next;
  document.getElementById("seg").dataset.mode = next;
  document.getElementById("modePct").classList.toggle("active", next === "pct");
  document.getElementById("modeGrade").classList.toggle("active", next === "grade");
  build();
  persistCurrent();
}

list.addEventListener("input", onEdit);
list.addEventListener("change", onEdit);

document.getElementById("modePct").onclick = () => setMode("pct");
document.getElementById("modeGrade").onclick = () => setMode("grade");

document.getElementById("saveBtn").onclick = () => {
  persistCurrent();
  showToast("Record saved");
};

document.getElementById("reset").onclick = () => {
  if (!confirm("Clear all grades for this record? Your subjects will be kept.")) return;
  current.entries = {};
  build();
  persistCurrent();
  showToast("Grades cleared");
};

document.getElementById("editBtn").onclick = () => openSetup(true);

document.getElementById("switchBtn").onclick = () => {
  persistCurrent();
  current = null;
  document.getElementById("studentId").value = "";
  document.getElementById("studentName").value = "";
  renderRecords();
  showScreen("gate");
};

/* ---------- Student Profile (photo & name) ---------- */
const profileModal = document.getElementById("profileModal");
const profileName = document.getElementById("profileName");
const photoFile = document.getElementById("photoFile");
let draftPhoto = "";

/* Center-crop to a square and shrink so it stays small in browser storage */
function resizePhoto(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const size = 256;
      const side = Math.min(img.width, img.height);
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("bad image"));
    };
    img.src = url;
  });
}

function paintProfileAvatar() {
  setAvatar(document.getElementById("profileAvatar"), draftPhoto, current.id, profileName.value.trim() || current.name);
}

function openProfile() {
  if (!current) return;
  draftPhoto = current.photo || "";
  profileName.value = current.name || "";
  document.getElementById("profileId").textContent = current.id;
  paintProfileAvatar();
  profileModal.hidden = false;
  profileName.focus();
}

function closeProfile() {
  profileModal.hidden = true;
}

document.getElementById("avatar").onclick = openProfile;
document.getElementById("studentText").onclick = openProfile;
document.getElementById("photoUpload").onclick = () => photoFile.click();
document.getElementById("photoRemove").onclick = () => {
  draftPhoto = "";
  paintProfileAvatar();
};
document.getElementById("profileCancel").onclick = closeProfile;
profileName.addEventListener("input", paintProfileAvatar);

photoFile.addEventListener("change", () => {
  const file = photoFile.files && photoFile.files[0];
  photoFile.value = "";
  if (!file) return;
  resizePhoto(file)
    .then(dataUrl => { draftPhoto = dataUrl; paintProfileAvatar(); })
    .catch(() => showToast("Could not read that image. Try a JPG or PNG."));
});

document.getElementById("profileSave").onclick = () => {
  current.name = profileName.value.trim();
  current.photo = draftPhoto;
  persistCurrent();
  renderHeader();
  closeProfile();
  showToast("Profile updated");
};

profileModal.addEventListener("click", event => {
  if (event.target === profileModal) closeProfile();
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && !profileModal.hidden) closeProfile();
});

/* ---------- Setup (program & subjects) ---------- */
const editor = document.getElementById("subjectEditor");
let editingExisting = false;
let newTermMode = false;

function addEditorRow(subject) {
  const s = subject ? normalizeSubject(subject) : {
    id: newSubjectId(), code: "", title: "", units: "", counted: true, type: "major",
    terms: false, wMid: DEFAULT_MID, wFin: DEFAULT_FIN, grading: false, parts: []
  };
  const row = document.createElement("div");
  row.className = "ed-row";
  row.dataset.id = s.id;
  row.dataset.type = s.type;
  row.innerHTML = `
    <div class="ed-top">
      <span class="ed-num"></span>
      <button type="button" class="ed-del" aria-label="Remove subject">&times;</button>
    </div>
    <div class="ed-fields">
      <label class="ed-f ed-f-code"><span>Code</span>
        <input class="ed-code" type="text" maxlength="20" placeholder="e.g. GEAA" value="${esc(s.code)}"></label>
      <label class="ed-f ed-f-title"><span>Subject title</span>
        <input class="ed-title" type="text" maxlength="120" placeholder="e.g. Art Appreciation" value="${esc(s.title)}"></label>
      <label class="ed-f ed-f-units"><span>Units</span>
        <input class="ed-units" type="number" min="0.5" max="12" step="0.5" inputmode="decimal" placeholder="3" value="${esc(s.units)}"></label>
      <label class="ed-f ed-f-type"><span>Subject type</span>
        <select class="ed-type">
          <option value="major"${s.type === "major" ? " selected" : ""}>Major</option>
          <option value="minor"${s.type === "minor" ? " selected" : ""}>Minor</option>
        </select></label>
      <label class="switch" title="Include this subject in the GWA">
        <input class="ed-counted" type="checkbox"${s.counted ? " checked" : ""}><i></i><span>Count in GWA</span></label>
      <div class="ed-terms-box">
        <label class="switch" title="Grade this subject from a Midterm and a Finals score">
          <input class="ed-terms" type="checkbox"${s.terms ? " checked" : ""}><i></i><span>Compute from Midterm &amp; Finals</span></label>
        <div class="ed-weights"${s.terms ? "" : " hidden"}>
          <label class="ed-f"><span>Midterm weight <b>%</b></span>
            <input class="ed-wmid" type="number" min="0" max="100" step="0.01" inputmode="decimal" value="${esc(s.wMid)}"></label>
          <label class="ed-f"><span>Finals weight <b>%</b></span>
            <input class="ed-wfin" type="number" min="0" max="100" step="0.01" inputmode="decimal" value="${esc(s.wFin)}"></label>
          <p class="ed-sum"></p>
        </div>
      </div>
      ${gradingBoxHTML(s)}
    </div>`;
  editor.appendChild(row);
  updateWeightSum(row);
  updatePartSum(row);
  updateSetupUnits();
}

function updateWeightSum(row) {
  const mid = parseFloat(row.querySelector(".ed-wmid").value);
  const fin = parseFloat(row.querySelector(".ed-wfin").value);
  const el = row.querySelector(".ed-sum");
  const total = (isNaN(mid) ? 0 : mid) + (isNaN(fin) ? 0 : fin);
  const ok = Math.abs(total - 100) < 0.001;
  el.textContent = "Total: " + round2(total) + "%" + (ok ? "" : " (must be 100%)");
  el.className = "ed-sum " + (ok ? "ok" : "bad");
}

/* Keep the two weights adding up to 100 while the student types */
function syncWeights(row, changed) {
  const from = row.querySelector(changed === "mid" ? ".ed-wmid" : ".ed-wfin");
  const to = row.querySelector(changed === "mid" ? ".ed-wfin" : ".ed-wmid");
  const value = parseFloat(from.value);
  if (isNaN(value)) {
    to.value = "";
  } else {
    to.value = round2(Math.min(100, Math.max(0, 100 - value)));
  }
  updateWeightSum(row);
}

function updateSetupUnits() {
  let total = 0;
  editor.querySelectorAll(".ed-row").forEach(row => {
    const units = parseFloat(row.querySelector(".ed-units").value);
    if (row.querySelector(".ed-counted").checked && units > 0) total += units;
  });
  document.getElementById("setupUnits").textContent = formatUnits(total);
  editor.querySelectorAll(".ed-num").forEach((el, index) => { el.textContent = index + 1; });
}

function isBlankEditorRow(row) {
  return !row.querySelector(".ed-title").value.trim() &&
         !row.querySelector(".ed-code").value.trim() &&
         !row.querySelector(".ed-units").value;
}

function openSetup(existing, newTerm) {
  newTermMode = !!newTerm;
  editingExisting = existing;
  const suggestion = newTerm ? nextTermLabel(current.term) : "";
  editor.innerHTML = "";
  document.getElementById("programInput").value = (existing || newTerm) ? current.program : "";
  document.getElementById("termInput").value = newTerm ? suggestion : (existing ? current.term : "");
  document.getElementById("termInput").dataset.auto = suggestion;
  document.getElementById("setupTitle").textContent = newTerm ? "Start a new term" : (existing ? "Edit program & subjects" : "Set up your program");
  document.getElementById("setupCancel").hidden = !(existing || newTerm);
  document.getElementById("setupDelete").hidden = !(existing && !newTerm && current.terms.length > 1);
  document.getElementById("setupError").hidden = true;
  document.getElementById("corStatus").hidden = true;
  document.getElementById("corRaw").hidden = true;
  closeScanReview();

  if (existing && current.subjects.length) current.subjects.forEach(addEditorRow);
  else addEditorRow();
  showScreen("setup");
}

function setupError(message) {
  const el = document.getElementById("setupError");
  el.textContent = message;
  el.hidden = false;
  el.style.animation = "none";
  void el.offsetWidth;
  el.style.animation = "";
}

function saveSetup() {
  const program = document.getElementById("programInput").value.trim();
  const term = document.getElementById("termInput").value.trim();
  const subjects = [];

  if (!program) return setupError("Please enter your program or course.");

  const rows = editor.querySelectorAll(".ed-row");
  for (const row of rows) {
    const title = row.querySelector(".ed-title").value.trim();
    const code = row.querySelector(".ed-code").value.trim();
    const units = parseFloat(row.querySelector(".ed-units").value);
    const counted = row.querySelector(".ed-counted").checked;
    const type = row.querySelector(".ed-type").value === "minor" ? "minor" : "major";
    const grading = row.querySelector(".ed-grading").checked;
    const terms = row.querySelector(".ed-terms").checked && !grading;
    let wMid = parseFloat(row.querySelector(".ed-wmid").value);
    let wFin = parseFloat(row.querySelector(".ed-wfin").value);

    if (!title && !code && isNaN(units)) continue;   /* ignore blank rows */
    if (!title) return setupError("Every subject needs a title.");
    if (isNaN(units) || units <= 0 || units > 12) return setupError('Enter valid units (0.5 to 12) for "' + title + '".');

    let parts = [];
    if (grading) {
      const res = readParts(row, title);
      if (res.error) return setupError(res.error);
      parts = res.parts;
    }

    if (terms) {
      if (isNaN(wMid) || isNaN(wFin) || wMid < 0 || wFin < 0 || Math.abs(wMid + wFin - 100) > 0.001) {
        return setupError('The Midterm and Finals percentages for "' + title + '" must add up to 100%.');
      }
    } else {
      if (isNaN(wMid)) wMid = DEFAULT_MID;
      if (isNaN(wFin)) wFin = DEFAULT_FIN;
    }

    subjects.push({
      id: row.dataset.id, code: code, title: title, units: units, counted: counted,
      type: type, terms: terms, wMid: wMid, wFin: wFin, grading: grading, parts: parts
    });
  }

  if (!subjects.length) return setupError("Add at least one subject.");
  if (!countedSubjects(subjects).length) return setupError("At least one subject must be counted in the GWA.");
  if (term && current.terms.some(t => (newTermMode || t.id !== current.activeId) && (t.term || "").toLowerCase() === term.toLowerCase())) {
    return setupError("You already have a record for " + term + ". Choose a different year & term.");
  }

  /* Keep grades only for subjects that still exist and still use the same grading method */
  let entries = {};
  if (newTermMode) {
    syncActive();
    const id = "t" + Date.now().toString(36);
    current.terms.push({ id: id, term: term, subjects: [], entries: {} });
    current.activeId = id;
    current.subjects = [];
  } else {
    if (!current.terms.length) {
      current.terms.push({ id: "t1", term: term, subjects: [], entries: {} });
      current.activeId = "t1";
    }
    subjects.forEach(s => {
      const old = current.subjects.find(o => o.id === s.id);
      const entry = current.entries[s.id];
      if (entry && old && !!old.terms === s.terms && !!old.grading === s.grading) entries[s.id] = keepGrades(entry, s);
    });
  }

  current.program = program;
  current.term = term;
  current.subjects = subjects;
  current.entries = entries;
  persistCurrent();
  showSheet();
  showToast("Program saved");
}

editor.addEventListener("input", event => {
  const target = event.target;
  const row = target.closest(".ed-row");
  if (row) {
    if (target.classList.contains("ed-wmid")) syncWeights(row, "mid");
    else if (target.classList.contains("ed-wfin")) syncWeights(row, "fin");
  }
  updateSetupUnits();
});

editor.addEventListener("change", event => {
  const target = event.target;
  if (target.classList.contains("ed-type")) target.closest(".ed-row").dataset.type = target.value;
  if (target.classList.contains("ed-terms")) {
    const row = target.closest(".ed-row");
    row.querySelector(".ed-weights").hidden = !target.checked;
    updateWeightSum(row);
  }
  updateSetupUnits();
});

editor.addEventListener("click", event => {
  const button = event.target.closest(".ed-del");
  if (!button) return;
  const row = button.closest(".ed-row");
  if (editor.querySelectorAll(".ed-row").length === 1) {
    row.querySelectorAll("input[type=text], input[type=number].ed-units").forEach(input => { input.value = ""; });
  } else {
    row.remove();
  }
  updateSetupUnits();
});

document.getElementById("addSubject").onclick = () => {
  addEditorRow();
  const rows = editor.querySelectorAll(".ed-row");
  rows[rows.length - 1].querySelector(".ed-code").focus();
};
document.getElementById("setupSave").onclick = saveSetup;
document.getElementById("setupCancel").onclick = showSheet;
document.getElementById("setupDelete").onclick = () => {
  if (current.terms.length < 2 || !confirm("Delete the subjects and grades of " + (current.term || "this term") + "? This cannot be undone.")) return;
  current.terms = current.terms.filter(t => t.id !== current.activeId);
  loadTermInto(current.terms[current.terms.length - 1]);
  persistCurrent();
  showSheet();
  showToast("Term deleted");
};

/* ---------- Grading Section (weighted components: Quiz / Activity / Exam ...) ---------- */
/* A subject can be graded from components that must total 100%, e.g. 30% Quiz + 40% Activity + 30% Exam.
   Stored on the subject as parts: [{id, name, weight}] and per grade entry as g: {partId: score}. */
function gradingBoxHTML(s) {
  return `<div class="ed-grading-box">
    <label class="switch" title="Grade this subject from weighted components such as Quiz, Activity and Exam">
      <input class="ed-grading" type="checkbox"${s.grading ? " checked" : ""}><i></i><span>Compute from Grading Section</span></label>
    <div class="gp-wrap"${s.grading ? "" : " hidden"}>
      <p class="gp-hint">Split the grade into parts, like 30% Quiz, 40% Activity, 30% Exam. The weights must total 100%.</p>
      <div class="gp-list">${(s.parts || []).map(partRowHTML).join("")}</div>
      <div class="gp-tools"><button type="button" class="ghost gp-add">+ Add component</button><button type="button" class="ghost gp-preset">Quiz / Activity / Exam</button></div>
      <p class="gp-sum"></p>
    </div>
  </div>`;
}

function partRowHTML(p) {
  return `<div class="gp-row" data-pid="${esc(p.id)}">
    <input class="gp-name" type="text" maxlength="24" placeholder="e.g. Quiz" aria-label="Component name" value="${esc(p.name)}">
    <input class="gp-weight" type="number" min="0.01" max="100" step="0.01" inputmode="decimal" placeholder="%" aria-label="Weight in percent" value="${esc(p.weight)}">
    <button type="button" class="gp-del" aria-label="Remove component">&times;</button>
  </div>`;
}

function presetRows() {
  return PART_PRESET.map(p => partRowHTML({ id: newSubjectId(), name: p.name, weight: p.weight })).join("");
}

function updatePartSum(row) {
  const el = row.querySelector(".gp-sum");
  if (!el) return;
  let total = 0;
  row.querySelectorAll(".gp-weight").forEach(i => { const v = parseFloat(i.value); if (!isNaN(v)) total += v; });
  const ok = Math.abs(total - 100) < 0.001;
  el.textContent = "Total: " + round2(total) + "%" + (ok ? "" : total < 100 ? " (" + round2(100 - total) + "% left to assign)" : " (" + round2(total - 100) + "% over, must be 100%)");
  el.className = "gp-sum " + (ok ? "ok" : "bad");
}

/* Validate and read the components of one subject row */
function readParts(row, title) {
  const rows = row.querySelectorAll(".gp-row"), parts = [], seen = {};
  let total = 0;
  if (!rows.length) return { error: 'Add at least one Grading Section component for "' + title + '".' };
  for (const r of rows) {
    const name = r.querySelector(".gp-name").value.trim();
    const w = parseFloat(r.querySelector(".gp-weight").value);
    if (!name) return { error: 'Every Grading Section component of "' + title + '" needs a name.' };
    if (seen[name.toLowerCase()]) return { error: 'The component "' + name + '" is listed twice in "' + title + '". Use different names.' };
    if (isNaN(w) || w <= 0 || w > 100) return { error: 'Enter a weight from 0.01 to 100 for "' + name + '" in "' + title + '".' };
    seen[name.toLowerCase()] = true;
    total += w;
    parts.push({ id: r.dataset.pid || newSubjectId(), name: name, weight: w });
  }
  if (Math.abs(total - 100) > 0.001) return { error: 'The Grading Section weights of "' + title + '" add up to ' + round2(total) + '%. They must total 100%.' };
  return { parts: parts };
}

/* Keep saved scores only for components that still exist */
function keepGrades(entry, s) {
  if (!s.grading) return entry;
  const ids = {}, g = {}, gg = {};
  s.parts.forEach(p => { ids[p.id] = true; });
  Object.keys(entry.g || {}).forEach(k => { if (ids[k]) g[k] = entry.g[k]; });
  Object.keys(entry.gg || {}).forEach(k => { if (ids[k]) gg[k] = entry.gg[k]; });
  return Object.assign({}, entry, { g: g, gg: gg });
}

/* Score inputs on the main sheet: percentage (0-100) or grade (1.00-5.00), chosen per subject */
function buildGradingInputs(subject, entry) {
  const e = entry || {}, byGrade = e.gm === "grade", src = (byGrade ? e.gg : e.g) || {};
  const marks = TERM_MARKS.map(m => `<option${e.v === m ? " selected" : ""}>${m}</option>`).join("");
  const field = p => {
    const v = src[p.id] === undefined ? "" : src[p.id], at = `data-id="${subject.id}" data-gid="${esc(p.id)}"`;
    return byGrade
      ? `<select ${at} data-part="gg"><option value="">Grade</option>${GRADE_TABLE.map(t => `<option${t[0] === v ? " selected" : ""}>${t[0]}</option>`).join("")}</select>`
      : `<input type="number" min="0" max="100" step="0.01" placeholder="%" ${at} data-part="g" value="${esc(v)}">`;
  };
  return `<div class="gm-seg" data-sid="${subject.id}" role="group" aria-label="Score type">
      <button type="button" data-gm="pct" class="${byGrade ? "" : "on"}">Percent</button><button type="button" data-gm="grade" class="${byGrade ? "on" : ""}">1.00 - 5.00</button></div>
    <div class="gparts">${subject.parts.map(p => `
      <label><span>${esc(p.name)} &middot; ${round2(p.weight)}%</span>${field(p)}</label>`).join("")}</div>
    <select class="mark" data-id="${subject.id}" data-part="mark" title="Special marking"><option value="">Computed grade</option>${marks}</select>`;
}

/* Quiz x 30% + Activity x 40% + Exam x 30% = Semester grade */
function gradingBreakdownHTML(subject, entry, result) {
  const byGrade = !!(entry && entry.gm === "grade"), src = (entry && (byGrade ? entry.gg : entry.g)) || {};
  let html = "", got = 0, done = 0, count = 0, over = false;
  subject.parts.forEach((p, i) => {
    const raw = parseFloat(src[p.id]), row = byGrade ? lookupGrade(raw) : null;
    const has = byGrade ? !!row : !isNaN(raw), sc = !has ? 0 : byGrade ? row[2] : clampScore(raw);
    if (has) { count++; got += sc * p.weight / 100; done += p.weight; if (!byGrade && (raw < 0 || raw > 100)) over = true; }
    html += (i ? '<span class="bd-op">+</span>' : "") +
      `<div class="bd-cell"><small>${esc(p.name)} &times; ${round2(p.weight)}%</small><b>${has ? (byGrade ? raw.toFixed(2) + " (" + round2(sc) + "%)" : round2(sc)) + " &rarr; " + round2(sc * p.weight / 100) : "&ndash;"}</b></div>`;
  });
  const total = !result ? "&ndash;" : result.special ? result.badge : result.percent.toFixed(2) + "% &middot; " + lookupGrade(result.grade)[0];
  html += '<span class="bd-op">=</span><div class="bd-cell total"><small>Semester grade</small><b>' + total + "</b></div>";
  const left = subject.parts.length - count;
  if (over) html += '<p class="bd-hint warn">Scores must be 0 to 100. Anything outside that is counted as the nearest limit.</p>';
  else {
    if (count && left) html += `<p class="bd-hint">Earned so far: ${round2(got)} of ${round2(done)}% &middot; ${left} component${left === 1 ? "" : "s"} left</p>`;
    if (byGrade) html += '<p class="bd-hint">Each 1.00-5.00 grade is converted to its percentage equivalent, then combined by weight.</p>';
  }
  return html;
}

/* Switch a subject between percentage scores and 1.00-5.00 grades (both are kept, nothing is lost) */
list.addEventListener("click", event => {
  const b = event.target.closest(".gm-seg button");
  if (!b) return;
  const id = b.parentNode.dataset.sid, want = b.dataset.gm === "grade";
  const e = current.entries[id] || (current.entries[id] = { m: "pct", v: "" });
  if ((e.gm === "grade") === want) return;
  if (want) e.gm = "grade"; else delete e.gm;
  const y = window.scrollY;
  build();
  persistCurrent();
  window.scrollTo(0, y);
});

editor.addEventListener("click", event => {
  const b = event.target.closest(".gp-add, .gp-del, .gp-preset");
  if (!b) return;
  const row = b.closest(".ed-row"), list = row.querySelector(".gp-list");
  if (b.classList.contains("gp-del")) {
    b.closest(".gp-row").remove();
  } else if (b.classList.contains("gp-preset")) {
    list.innerHTML = presetRows();
  } else {
    if (list.children.length >= MAX_PARTS) return setupError("A subject can have up to " + MAX_PARTS + " components.");
    list.insertAdjacentHTML("beforeend", partRowHTML({ id: newSubjectId(), name: "", weight: "" }));
    list.lastElementChild.querySelector(".gp-name").focus();
  }
  updatePartSum(row);
});

editor.addEventListener("input", event => {
  if (event.target.closest(".gp-row")) updatePartSum(event.target.closest(".ed-row"));
});

/* Grading Section and Midterm/Finals are two different ways to grade a subject: only one at a time */
editor.addEventListener("change", event => {
  const t = event.target, row = t.closest(".ed-row");
  if (!row) return;
  if (t.classList.contains("ed-grading")) {
    row.querySelector(".gp-wrap").hidden = !t.checked;
    if (!t.checked) return;
    const tm = row.querySelector(".ed-terms");
    if (tm.checked) { tm.checked = false; row.querySelector(".ed-weights").hidden = true; }
    const list = row.querySelector(".gp-list");
    if (!list.children.length) list.innerHTML = presetRows();
    updatePartSum(row);
  } else if (t.classList.contains("ed-terms") && t.checked) {
    const gr = row.querySelector(".ed-grading");
    if (gr.checked) { gr.checked = false; row.querySelector(".gp-wrap").hidden = true; }
  }
});

/* ---------- COR Scan (OCR) ---------- */
/* Reads a Certificate of Registration image in the browser (Tesseract.js).
   Improvements over the first version:
   - adaptive-threshold cleanup (handles shadows / uneven phone lighting)
   - keeps column spacing so Code | Title | Units are read as columns
   - second recognition pass with a different layout mode when the first is weak
   - fixes common OCR slips (O/0, I/1, "3,0", wrapped titles)
   - several photos at once (e.g. a 2-page COR)
   - fills Program and Year/Term automatically when they are empty
   - review list is editable, flags doubtful rows, skips duplicates */

const COR_SKIP_LINE = /\b(total\s+(?:units?|number|amount|assessment)|tuition|assessment|registrar|certificate of registration|miscellaneous|amount due|printed|signature|adviser)\b/i;
const COR_HEADER_LINE = /^\s*(?:no\.?\s+)?(?:subject\s*code|code|subject|description)\b.*\b(?:title|units?|section|schedule|room|description)\b/i;
const COR_DAY = /^(?:M|T|W|TH|F|S|SU|MON|TUE|TUES|WED|THU|THUR|THURS|FRI|SAT|SUN|MWF|TTH|MW|TF|WF|MTH|DAILY|TBA)\.?$/i;
const COR_CODE_RE = /^(?:[A-Z]\d{5,8}\s+)?(?:\d{1,2}[.)]?\s+)?([A-Z]{2,8}(?:-[A-Z]{2,8})?(?:[- ]?(?=[0-9OIl]*\d)[0-9OIl]{1,4}[A-Z]?)?)\s+(.+)$/;
const COR_TIME_RE = /\b\d{1,2}[:;]\d{2}\b|\b\d{1,2}\s?(?:AM|PM)\b/i;

function corClean(raw) {
  return String(raw)
    .replace(/[|│¦]/g, "  ")             /* table borders act as column gaps */
    .replace(/[\[\]{}_~`]/g, " ")
    .replace(/\t/g, "  ")
    .replace(/(\d),(\d)/g, "$1.$2")       /* 3,0 -> 3.0 */
    .replace(/(\d)\.[Oo](?![A-Za-z0-9])/g, "$1.0")
    .trim();
}

/* ITEC 1O1 -> ITEC 101, NSTP-I -> stays, only touches the number part */
function corFixCode(code) {
  const m = code.match(/^([A-Z]{2,8})([- ]?)([0-9OIlS]{1,4})([A-Z]?)$/);
  if (!m || !/\d/.test(m[3])) return code.replace(/\s+/g, " ").trim();
  const digits = m[3].replace(/O/g, "0").replace(/[Il]/g, "1").replace(/S/g, "5");
  return m[1] + m[2] + digits + m[4];
}

function corIsNum(text) {
  return /^\d{1,2}(?:\.\d{1,2})?$/.test(text);
}

/* ALL CAPS text from a COR -> "Art Appreciation", "Mathematics in the Modern World" */
const COR_SMALL = ["and", "in", "of", "the", "to", "sa", "ng", "for", "on", "at", "a", "an", "with", "by", "or", "at"];
const COR_KEEP = ["IT", "ICT", "NSTP", "CWTS", "ROTC", "PE", "PATHFIT", "CS", "IS", "IT", "NC"];

function corSmartCase(text) {
  const cap = w => w.split(/([-\/])/).map(p => /^[-\/]$/.test(p) ? p : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join("");
  return String(text).replace(/\s-(?=[A-Za-z])/g, " - ").replace(/\s+/g, " ").trim().split(" ").map((w, i) => {
    const bare = w.replace(/[^A-Za-z]/g, "");
    if (/[()]/.test(w) || /^\d/.test(w)) return w;
    if (COR_KEEP.indexOf(bare.toUpperCase()) >= 0 || /^[IVX]{1,4}$/.test(bare)) return w.toUpperCase();
    if (i > 0 && COR_SMALL.indexOf(bare.toLowerCase()) >= 0) return w.toLowerCase();
    return cap(w);
  }).join(" ");
}

function corTidyTitle(title) {
  const t = title.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9)]+$/g, "").replace(/\s+/g, " ").trim();
  return /[a-z]/.test(t) ? t : corSmartCase(t);
}

/* One table row -> {code, title, units, warn} or null */
function corParseRow(line) {
  const m = line.match(COR_CODE_RE);
  if (!m) return null;
  const code = corFixCode(m[1].replace(/\s+/g, " ").trim());
  let body = m[2];
  const t = body.search(COR_TIME_RE);
  if (t >= 0) body = body.slice(0, t);
  body = body.trim();

  let title = "", units = NaN, warn = "";

  /* 1) Column-aware: cells separated by 2+ spaces */
  const cells = body.split(/\s{2,}/).map(c => c.trim()).filter(Boolean);
  if (cells.length >= 2) {
    let k = 0;
    while (k < cells.length && !corIsNum(cells[k])) k++;
    if (k >= 1 && k < cells.length) {
      const run = [];
      for (let j = k; j < cells.length && corIsNum(cells[j]); j++) run.push(cells[j]);
      title = cells.slice(0, k).join(" ");
      units = parseFloat(run[run.length - 1]);
      if (run.length === 2 && /^\d$/.test(run[0]) && run[1].indexOf(".") >= 0) title += " " + run[0];
    }
  }

  /* 2) Token-based: title, then the first decimal number is the units */
  if (isNaN(units)) {
    const tokens = body.replace(/\s+/g, " ").split(" ").filter(Boolean);
    let d = -1;
    for (let i = 1; i < tokens.length; i++) {
      if (/^\d{1,2}\.\d{1,2}$/.test(tokens[i])) { d = i; break; }
    }
    if (d > 0) {
      let e = d;
      while (e + 1 < tokens.length && corIsNum(tokens[e + 1])) e++;
      const ts = tokens.slice(0, d);
      if (ts.length > 2 && /^\S{0,6}-[A-Z]{3,}\d*$/.test(ts[ts.length - 1])) ts.pop();   /* section column */
      title = ts.join(" ");
      units = parseFloat(tokens[e]);
    } else {
      /* no decimal: drop trailing section / day tokens, then read the trailing whole numbers */
      let tail = tokens.slice();
      while (tail.length > 1) {
        const last = tail[tail.length - 1];
        if (COR_DAY.test(last) || (/\d/.test(last) && !/^\d+$/.test(last))) tail.pop();
        else break;
      }
      let s = tail.length;
      while (s > 1 && /^\d+$/.test(tail[s - 1])) s--;
      const nums = tail.slice(s);
      if (!nums.length) return null;
      units = parseFloat(nums[nums.length - 1]);
      title = tail.slice(0, s).join(" ");
      if (nums.length === 2) title += " " + nums[0];
      warn = "Units were guessed - please check";
    }
  }

  title = corTidyTitle(title);
  if (!/[A-Za-z]{3,}/.test(title) || isNaN(units) || units < 0.5 || units > 12) return null;
  if (!warn && (units * 2) % 1 !== 0) warn = "Unusual units - please check";
  if (!warn && title.length < 5) warn = "Short title - please check";
  return { code: code, title: title, units: units, warn: warn };
}

function parseCOR(text) {
  const found = [];
  const seen = {};
  let prev = null;

  String(text).split(/\r?\n/).forEach(raw => {
    const line = corClean(raw);
    if (!line) return;
    if (line.length < 4 || COR_SKIP_LINE.test(line) || COR_HEADER_LINE.test(line)) { prev = null; return; }

    const row = corParseRow(line);
    if (row) {
      const key = (row.code + "|" + row.title).toLowerCase();
      if (seen[key]) { prev = null; return; }
      seen[key] = true;
      found.push(row);
      prev = row;
      return;
    }

    /* a title that wrapped onto the next line */
    const plain = line.replace(/\s+/g, " ");
    if (prev && /^[A-Z][A-Za-z ,&'()\/.-]{3,40}$/.test(plain) && plain.split(" ").length <= 5 &&
        !COR_DAY.test(plain) && !/^[A-Z]{2,6}$/.test(plain)) {
      prev.title = corTidyTitle(prev.title + " " + plain);
      prev.warn = prev.warn || "Title joined from the next line - please check";
    }
    prev = null;
  });

  return found;
}

/* Program and Year / Term from the COR header */
function parseCORMeta(text) {
  const flat = String(text).replace(/[|│¦]/g, " ");
  const ord = { first: "1st", second: "2nd", third: "3rd", fourth: "4th", fifth: "5th" };
  const norm = w => ord[w.toLowerCase()] || w.toLowerCase();
  let program = "", term = "";

  const p = flat.match(/Bachelor\s+of\s+[A-Za-z][A-Za-z ,&'()\-]{3,70}/i);
  if (p) {
    program = p[0]
      .replace(/\s{2,}.*$/, "")
      .replace(/\s+(?:year|section|sem(?:ester)?|major|curriculum|sy|a\.?y\.?)\b.*$/i, "")
      .trim();
    if (!/[a-z]/.test(program)) program = corSmartCase(program);
  }

  const y = flat.match(/\b(1st|2nd|3rd|4th|5th|first|second|third|fourth|fifth)\s+year\b/i);
  let s = flat.match(/\b(1st|2nd|3rd|first|second|third)\s+(?:sem(?:ester)?|term)\b/i);
  if (!s) s = flat.match(/\bsem(?:ester)?\s*[:\-]?\s*(1st|2nd|3rd|first|second|third)\b/i);
  const summer = /\b(?:summer|mid\s?year)\b/i.test(flat);

  const parts = [];
  if (y) parts.push(norm(y[1]) + " Year");
  if (s) parts.push(norm(s[1]) + " Sem");
  else if (summer) parts.push("Summer");
  term = parts.join(" - ");

  const nm = flat.match(/\bName\s+([A-Z][A-Z ,.'-]{4,50}?)(?:\s{2,}|\s+Student)/);
  const no = flat.match(/Student\s+No\.?\s*:?\s*([A-Z][0-9OIl]{5,12})/i);
  return {
    program: program, term: term,
    name: nm ? corSmartCase(nm[1].trim()) : "",
    studentNo: no ? no[1].toUpperCase().replace(/O/g, "0").replace(/[Il]/g, "1") : ""
  };
}

/* ----- Image cleanup ----- */
function grayToCanvas(gray, w, h) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  const out = ctx.createImageData(w, h);
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    out.data[p] = out.data[p + 1] = out.data[p + 2] = gray[i];
    out.data[p + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
  return canvas;
}

/* Local-mean threshold: dark text on any background becomes black on white */
function adaptiveThreshold(gray, w, h) {
  const W = w + 1;
  const integral = new Uint32Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += gray[y * w + x];
      integral[(y + 1) * W + x + 1] = integral[y * W + x + 1] + row;
    }
  }
  const r = Math.max(12, Math.round(w / 50));
  const out = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      const sum = integral[y1 * W + x1] - integral[y0 * W + x1] - integral[y1 * W + x0] + integral[y0 * W + x0];
      const mean = sum / ((x1 - x0) * (y1 - y0));
      out[y * w + x] = gray[y * w + x] < mean - 14 ? 0 : 255;
    }
  }
  return out;
}

/* Returns two versions ("clean" = adaptive black/white, "plain" = gray) of the page.
   Dark phone / PDF-app bars around a screenshot are cropped away first. */
function prepareImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        let w = Math.min(2600, Math.max(2000, img.width));
        let h = Math.round(img.height * w / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        const px = ctx.getImageData(0, 0, w, h).data;
        let gray = new Uint8ClampedArray(w * h);
        for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
          gray[i] = (0.299 * px[p] + 0.587 * px[p + 1] + 0.114 * px[p + 2]) | 0;
        }

        /* crop to the bright page area */
        let y0 = 0, y1 = h - 1;
        const rowBright = y => { let c = 0; for (let x = 0; x < w; x += 4) if (gray[y * w + x] > 190) c++; return c / (w / 4); };
        while (y0 < h && rowBright(y0) < 0.5) y0++;
        while (y1 > y0 && rowBright(y1) < 0.5) y1--;
        if (y1 - y0 > h * 0.3) {
          const colBright = x => { let c = 0, n = 0; for (let y = y0; y <= y1; y += 4, n++) if (gray[y * w + x] > 190) c++; return c / n; };
          let x0 = 0, x1 = w - 1;
          while (x0 < w && colBright(x0) < 0.5) x0++;
          while (x1 > x0 && colBright(x1) < 0.5) x1--;
          if (x1 - x0 > w * 0.5 && (x1 - x0 + 1 < w || y1 - y0 + 1 < h)) {
            const nw = x1 - x0 + 1, nh = y1 - y0 + 1;
            const cropped = new Uint8ClampedArray(nw * nh);
            for (let y = 0; y < nh; y++) cropped.set(gray.subarray((y + y0) * w + x0, (y + y0) * w + x0 + nw), y * nw);
            gray = cropped; w = nw; h = nh;
          }
        }

        /* stretch contrast between the 1st and 99th percentile */
        const n = w * h, hist = new Uint32Array(256);
        for (let i = 0; i < n; i++) hist[gray[i]]++;
        let lo = 0, hi = 255, acc = 0;
        for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= n * 0.01) { lo = v; break; } }
        acc = 0;
        for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= n * 0.01) { hi = v; break; } }
        if (hi - lo < 30) { lo = 0; hi = 255; }
        for (let i = 0; i < n; i++) gray[i] = (gray[i] - lo) * 255 / (hi - lo);

        resolve({ plain: grayToCanvas(gray, w, h), clean: grayToCanvas(adaptiveThreshold(gray, w, h), w, h) });
      } catch (err) {
        reject(err);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not open that image."));
    };
    img.src = url;
  });
}

/* ----- Table reader: uses word positions and the header columns of the COR table
   (CFN | Course Code | Descriptive Title | Section | Units | Time ...) ----- */
function corJoin(list, h) {
  const sorted = list.slice().sort((a, b) => a.yc - b.yc);
  const lines = [];
  sorted.forEach(w => {
    const l = lines[lines.length - 1];
    if (l && Math.abs(w.yc - l.yc) < h * 0.6) l.w.push(w);
    else lines.push({ yc: w.yc, w: [w] });
  });
  return lines.map(l => l.w.sort((a, b) => a.x0 - b.x0).map(w => w.t).join(" ")).join(" ");
}

function corTableRows(data) {
  const W = (data.words || []).filter(w => w.text && w.text.trim() && w.bbox).map(w => ({
    t: w.text.trim(), x0: w.bbox.x0, x1: w.bbox.x1, y0: w.bbox.y0, y1: w.bbox.y1,
    yc: (w.bbox.y0 + w.bbox.y1) / 2, h: w.bbox.y1 - w.bbox.y0, c: w.confidence
  }));
  const norm = t => t.replace(/[^A-Za-z]/g, "").toLowerCase();

  /* Header words are matched loosely so small OCR slips ("Descnptive", "Cou rse") still work */
  const desc = W.find(w => /^desc/.test(norm(w.t)) && norm(w.t).length >= 5);
  if (!desc) return [];
  const near = re => W.find(w => re.test(norm(w.t)) && Math.abs(w.yc - desc.yc) < desc.h * 0.9);
  const hCfn = near(/^c[fl]n$/), hCode = near(/^cou/), hSec = near(/^sec/), hUnits = near(/^uni/), hTime = near(/^tim/);
  if (!hCode || !hSec || !hUnits) return [];

  /* Only Code, Title and Units are used - Section, Time, Days and Room are ignored */
  const m = desc.h * 0.6;
  const col = {
    code: hCode.x0 - m, title: desc.x0 - m, sec: hSec.x0 - m, units: hUnits.x0 - m,
    time: hTime ? hTime.x0 - m : hUnits.x0 + desc.h * 4
  };

  const totals = W.filter(w => /^total$/i.test(w.t) && w.yc > desc.yc && w.x0 < col.title).map(w => w.yc);
  const stopY = totals.length ? Math.min.apply(null, totals) : Infinity;
  const body = W.filter(w => w.y0 > desc.y1 && w.yc < stopY);

  /* Each subject starts at its CFN (e.g. A1260247). If those are unreadable, use the course code itself. */
  let anchors = body.filter(w => w.x0 < col.code && (!hCfn || w.x0 > hCfn.x0 - desc.h * 2) &&
    /^[A-Za-z][0-9OIlSB]{5,9}$/.test(w.t) && (w.t.match(/\d/g) || []).length >= 3).sort((a, b) => a.y0 - b.y0);
  if (anchors.length < 2) {
    anchors = [];
    body.filter(w => w.x0 >= col.code && w.x0 < col.title && /^[A-Z][A-Z0-9-]{2,}$/.test(w.t))
      .sort((a, b) => a.y0 - b.y0)
      .forEach(w => { const last = anchors[anchors.length - 1]; if (!last || w.yc - last.yc > w.h * 1.2) anchors.push(w); });
  }

  const rows = [];
  anchors.forEach((a, i) => {
    const top = a.y0 - a.h * 0.6;
    const bottom = i + 1 < anchors.length ? anchors[i + 1].y0 - a.h * 0.6 : Math.min(stopY - a.h * 0.3, a.y0 + a.h * 5);
    const band = body.filter(w => w.yc >= top && w.yc < bottom);
    const pick = (x0, x1) => band.filter(w => w.x0 >= x0 && w.x0 < x1);

    const codeW = pick(col.code, col.title), titleW = pick(col.title, col.sec), unitW = pick(col.units, col.time);
    const code = corFixCode(corJoin(codeW, a.h).replace(/\s+/g, " ").trim());
    const title = corTidyTitle(corJoin(titleW, a.h));
    if (!code || !/[A-Za-z]{2,}/.test(title)) return;

    const unitText = unitW.map(w => w.t).join(" ").replace(/,/g, ".").replace(/[Oo]/g, "0");
    let units = "";
    const um = unitText.match(/\d{1,2}\.\d{1,2}/) || unitText.match(/\b\d{1,2}\b/);
    if (um) {
      units = parseFloat(um[0]);
      if (um[0].indexOf(".") < 0 && um[0].length === 2 && um[0][1] === "0") units = units / 10;   /* "30" -> 3.0 */
    }
    const confs = codeW.concat(titleW).map(w => w.c).filter(c => typeof c === "number");
    const avg = confs.length ? confs.reduce((x, y) => x + y, 0) / confs.length : 100;

    let warn = "";
    if (units === "" || units < 0.5 || units > 12) { warn = "Units not read - please enter them"; units = ""; }
    else if (avg < 70) warn = "Low scan confidence - please check";
    rows.push({ code: code, title: title, units: units, warn: warn });
  });
  return rows;
}

function corTotalUnits(text) {
  const m = String(text).replace(/,/g, ".").match(/Total\s+Units\s*:?[\s\S]{0,40}?(\d{1,3}\.\d)/i);
  return m ? parseFloat(m[1]) : null;
}

function corGuessType(s) {
  return /^(GE|PE|PATHFIT|NSTP|CWTS|ROTC|LTS)/i.test(s.code) || /nstp|cwts/i.test(s.title) ? "minor" : "major";
}

/* ----- UI ----- */
const corFile = document.getElementById("corFile");
const corBtn = document.getElementById("corBtn");
const corStatus = document.getElementById("corStatus");
const corReview = document.getElementById("corReview");
const corReviewList = document.getElementById("corReviewList");
let scanFound = [];
let corLabel = "Reading text";
const corBar = document.createElement("div");
corBar.className = "cor-bar";
corBar.hidden = true;
corBar.innerHTML = "<i></i>";
corStatus.after(corBar);

function setCorStatus(message, bad) {
  corStatus.textContent = message;
  corStatus.classList.toggle("bad", !!bad);
  corStatus.hidden = !message;
}

function closeScanReview() {
  scanFound = [];
  corReviewList.innerHTML = "";
  corReview.hidden = true;
}

function editorKeys() {
  const keys = {};
  editor.querySelectorAll(".ed-row").forEach(row => {
    const code = row.querySelector(".ed-code").value.trim().toLowerCase();
    const title = row.querySelector(".ed-title").value.trim().toLowerCase();
    if (code || title) keys[code + "|" + title] = true;
  });
  return keys;
}

function openScanReview(found) {
  const existing = editorKeys();
  scanFound = found.map(s => Object.assign({}, s, { dup: !!existing[(s.code + "|" + s.title).toLowerCase()] }));
  corReviewList.innerHTML = scanFound.map((s, i) => `
    <div class="cor-item${s.warn ? " warn" : ""}" data-i="${i}">
      <label class="switch cor-inc"><input class="cor-include" type="checkbox"${s.dup ? "" : " checked"}><i></i><span>Add</span></label>
      <div class="cor-edit">
        <input class="cor-code" type="text" maxlength="20" aria-label="Code" value="${esc(s.code)}">
        <input class="cor-title" type="text" maxlength="120" aria-label="Subject title" value="${esc(s.title)}">
        <input class="cor-units" type="number" min="0.5" max="12" step="0.5" inputmode="decimal" aria-label="Units" value="${esc(s.units)}">
      </div>
      <div class="cor-opts">
        <select class="cor-type" aria-label="Subject type">
          <option value="major"${corGuessType(s) === "major" ? " selected" : ""}>Major</option>
          <option value="minor"${corGuessType(s) === "minor" ? " selected" : ""}>Minor</option>
        </select>
        <label class="switch"><input class="cor-counted" type="checkbox" checked><i></i><span>Count in GWA</span></label>
      </div>
      ${s.dup ? '<p class="cor-warn">Already in your subject list</p>' : ""}
      ${s.warn ? '<p class="cor-warn">' + esc(s.warn) + "</p>" : ""}
    </div>`).join("");
  corReview.hidden = false;
}

/* One OCR run over one or more images; the best pass per image wins */
async function scanCOR(files) {
  closeScanReview();
  document.getElementById("corRaw").hidden = true;
  corBtn.disabled = true;
  let worker = null;

  try {
    if (typeof Tesseract === "undefined") {
      throw new Error("The scanner could not load. Check your internet connection and try again.");
    }

    const all = [];
    const seen = {};
    const texts = [];

    for (let f = 0; f < files.length; f++) {
      const tag = files.length > 1 ? "Image " + (f + 1) + " of " + files.length + " - " : "";
      setCorStatus(tag + "Preparing image...");
      const imgs = await prepareImage(files[f]);

      if (!worker) {
        worker = await Tesseract.createWorker("eng", 1, {
          logger: m => {
            if (m.status === "recognizing text") {
              setCorStatus(corLabel + "... " + Math.round(m.progress * 100) + "%");
              corBar.hidden = false;
              corBar.firstChild.style.width = Math.round(m.progress * 100) + "%";
            }
          }
        });
      }

      const attempts = [
        { canvas: imgs.clean, psm: "6", name: "pass 1" },
        { canvas: imgs.plain, psm: "4", name: "pass 2" }
      ];
      let best = { found: [], text: "", score: -1 };

      for (let a = 0; a < attempts.length; a++) {
        corLabel = tag + "Reading text (" + attempts[a].name + ")";
        await worker.setParameters({
          tessedit_pageseg_mode: attempts[a].psm,
          preserve_interword_spaces: "1"
        });
        const result = await worker.recognize(attempts[a].canvas);
        const text = result.data.text || "";
        let found = corTableRows(result.data);
        if (!found.length) found = parseCOR(text);
        const warns = found.filter(s => s.warn).length;
        const score = found.length - warns * 0.5;
        if (score > best.score) best = { found: found, text: text, score: score };
        if (found.length >= 4 && warns === 0) break;      /* clean result, no need for pass 2 */
      }

      texts.push(best.text);
      best.found.forEach(s => {
        const key = (s.code + "|" + s.title).toLowerCase();
        if (seen[key]) return;
        seen[key] = true;
        all.push(s);
      });
    }

    const fullText = texts.join("\n\n----- next image -----\n\n");
    document.getElementById("corRawText").textContent = fullText;
    document.getElementById("corRaw").hidden = false;

    /* Fill program and term when they are still empty */
    const meta = parseCORMeta(fullText);
    const filled = [];
    const programInput = document.getElementById("programInput");
    const termInput = document.getElementById("termInput");
    if (meta.program && !programInput.value.trim()) { programInput.value = meta.program; filled.push("program"); }
    if (meta.term && (!termInput.value.trim() || termInput.value === termInput.dataset.auto)) { termInput.value = meta.term; filled.push("year & term"); }

    if (meta.name && current && !current.name) { current.name = meta.name; filled.push("name"); }

    if (!all.length) {
      setCorStatus("No subjects were recognized. Try a clearer, straighter, well-lit photo, or add them manually.", true);
    } else {
      const doubtful = all.filter(s => s.warn).length;
      let msg = "Found " + all.length + " subject" + (all.length === 1 ? "" : "s") + ".";
      if (doubtful) msg += " " + doubtful + " marked for checking.";
      if (filled.length) msg += " Filled in " + filled.join(" and ") + ".";
      const total = corTotalUnits(fullText);
      const sum = all.reduce((t, s) => t + (parseFloat(s.units) || 0), 0);
      if (total !== null) {
        msg += Math.abs(sum - total) < 0.01
          ? " Units add up to " + formatUnits(total) + " (matches the COR)."
          : " Units add up to " + formatUnits(sum) + " but the COR says " + formatUnits(total) + " - a subject may be missing.";
      }
      if (meta.studentNo && current && meta.studentNo !== current.id) msg += " Note: this COR shows Student No. " + meta.studentNo + ".";
      setCorStatus(msg + " Please review below.");
      openScanReview(all);
    }
  } catch (err) {
    setCorStatus(err && err.message ? err.message : "Scanning failed. Please try again.", true);
  } finally {
    if (worker) { try { await worker.terminate(); } catch (e) { /* ignore */ } }
    corBtn.disabled = false;
    corBar.hidden = true;
  }
}

corBtn.onclick = () => corFile.click();

/* Drag & drop a screenshot onto the box, or paste one (Ctrl+V) while on the setup screen */
const corBox = document.querySelector(".cor-box");
["dragenter", "dragover"].forEach(ev => corBox.addEventListener(ev, e => { e.preventDefault(); corBox.classList.add("drag"); }));
["dragleave", "drop"].forEach(ev => corBox.addEventListener(ev, e => { e.preventDefault(); corBox.classList.remove("drag"); }));
corBox.addEventListener("drop", e => {
  const files = Array.from(e.dataTransfer.files || []).filter(f => f.type.indexOf("image/") === 0);
  if (files.length) scanCOR(files.slice(0, 4));
});
document.addEventListener("paste", e => {
  if (screens.setup.hidden || corBtn.disabled) return;
  const files = Array.from((e.clipboardData && e.clipboardData.files) || []).filter(f => f.type.indexOf("image/") === 0);
  if (files.length) scanCOR(files.slice(0, 4));
});
corFile.addEventListener("change", () => {
  const files = Array.from(corFile.files || []);
  corFile.value = "";
  if (files.length) scanCOR(files.slice(0, 4));
});

document.getElementById("corReviewCancel").onclick = () => {
  closeScanReview();
  setCorStatus("");
};

document.getElementById("corReviewAdd").onclick = () => {
  const items = Array.from(corReviewList.querySelectorAll(".cor-item"));
  if (!items.length) return;

  const chosen = [];
  let skipped = 0;
  items.forEach(item => {
    if (!item.querySelector(".cor-include").checked) return;
    const title = item.querySelector(".cor-title").value.trim();
    const units = parseFloat(item.querySelector(".cor-units").value);
    if (!title || isNaN(units) || units <= 0 || units > 12) { skipped++; return; }
    chosen.push({
      id: newSubjectId(),
      code: item.querySelector(".cor-code").value.trim(),
      title: title,
      units: units,
      counted: item.querySelector(".cor-counted").checked,
      type: item.querySelector(".cor-type").value,
      terms: false,
      wMid: DEFAULT_MID,
      wFin: DEFAULT_FIN
    });
  });

  if (!chosen.length) {
    setCorStatus(skipped ? "Fix the title and units (0.5 to 12) of the ticked subjects first." : "Nothing is ticked to add.", true);
    return;
  }

  /* Replace the lone empty starter row, if that is all there is */
  const rows = editor.querySelectorAll(".ed-row");
  if (rows.length === 1 && isBlankEditorRow(rows[0])) rows[0].remove();

  chosen.forEach(addEditorRow);
  closeScanReview();
  setCorStatus(chosen.length + " subject" + (chosen.length === 1 ? "" : "s") + " added below." +
    (skipped ? " " + skipped + " skipped (missing title or units)." : ""));
  updateSetupUnits();
};

/* ---------- Start ---------- */
renderRecords();
showScreen("gate");


/* ---------- Visual polish: hero ring, ripple, spotlight, focus ---------- */
const RING_C = 2 * Math.PI * 52;

let heroView = "term";   /* "term" = this term's GWA, "cum" = cumulative GWA (CGWA) over all terms */

/* Cumulative figures across every term (units-weighted, same rules as the GWA) */
function cumStats() {
  syncActive();
  let pts = 0, pct = 0, units = 0, earned = 0, passed = 0, failed = 0;
  const rows = [];
  current.terms.forEach((t, i) => {
    rows.push({ label: t.term || "Term " + (i + 1), gwa: summarize(t.subjects, t.entries).gwa });
    countedSubjects(t.subjects).forEach(sub => {
      const r = evaluate(t.entries[sub.id], sub);
      if (!r) return;
      if (r.status === "pass") { passed++; earned += sub.units; }
      if (r.status === "fail") failed++;
      if (!r.special) { pts += r.grade * sub.units; pct += r.percent * sub.units; units += sub.units; }
    });
  });
  return {
    gwa: units ? (pts / units).toFixed(2) : null,
    avg: units ? (pct / units).toFixed(1) : null,
    passed: passed, failed: failed, earned: earned, rows: rows
  };
}

function updateHero(s) {
  const hero = document.getElementById("hero");
  const fg = document.getElementById("ringFg");
  const tag = document.getElementById("heroTag");
  const note = document.getElementById("heroNote");
  const toggle = document.getElementById("heroToggle");
  const trend = document.getElementById("trend");
  const multi = current.terms.length > 1;
  if (!multi) heroView = "term";
  toggle.hidden = !multi;
  toggle.querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.view === heroView));
  document.getElementById("ringLabel").textContent = heroView === "cum" ? "CGWA" : "GWA";

  let d = s;
  if (heroView === "cum") {
    d = cumStats();
    animateValue(document.getElementById("gwa"), d.gwa === null ? null : parseFloat(d.gwa), 2, "");
    animateValue(document.getElementById("avg"), d.avg === null ? null : parseFloat(d.avg), 1, "%");
  }

  /* Per-term trend, only in the cumulative view */
  if (heroView === "cum") {
    trend.innerHTML = d.rows.map(r => {
      const w = r.gwa === null ? 0 : Math.max(6, (5 - parseFloat(r.gwa)) / 4 * 100);
      return '<div class="trend-row"><span>' + esc(r.label) + '</span><div class="trend-bar"><i style="width:' + w + '%"></i></div><b>' + (r.gwa === null ? "&ndash;" : r.gwa) + "</b></div>";
    }).join("");
    trend.hidden = false;
  } else {
    trend.hidden = true;
  }

  fg.style.strokeDasharray = RING_C;
  if (d.gwa === null) {
    fg.style.strokeDashoffset = RING_C;
    hero.dataset.tone = "none";
    tag.textContent = "Awaiting grades";
    note.textContent = "Enter a grade below and your standing appears here.";
    return;
  }
  const g = parseFloat(d.gwa), a = parseFloat(d.avg);
  const frac = Math.min(1, Math.max(0.05, (a - 60) / 40));
  fg.style.strokeDashoffset = RING_C * (1 - frac);
  hero.dataset.tone = g <= PASSING_GRADE ? "pass" : "fail";
  tag.textContent = g <= 1.12 ? "Excellent" : g <= 1.62 ? "Superior" : g <= 2.12 ? "Very Good"
    : g <= 2.62 ? "Good" : g <= 3 ? "Fair" : "Needs attention";
  note.textContent = d.passed + " passed \u00b7 " + d.failed + " failed \u00b7 " + formatUnits(d.earned) + " units earned" +
    (heroView === "cum" ? " \u00b7 " + current.terms.length + " terms" : "");
}

/* GWA of each term shown on its chip */
function updateTermChips() {
  document.querySelectorAll("#termsBar .term-chip[data-term]").forEach(chip => {
    const t = current.terms.find(x => x.id === chip.dataset.term);
    const el = chip.querySelector(".chip-gwa");
    if (t && el) el.textContent = summarize(t.subjects, t.entries).gwa || "";
  });
}

document.getElementById("heroToggle").addEventListener("click", e => {
  const b = e.target.closest("button[data-view]");
  if (!b || b.dataset.view === heroView) return;
  heroView = b.dataset.view;
  refresh();
});

/* Touch / click ripple */
document.addEventListener("pointerdown", e => {
  const b = e.target.closest && e.target.closest("button");
  if (!b || b.disabled || b.classList.contains("avatar-btn")) return;
  const r = b.getBoundingClientRect();
  const d = Math.max(r.width, r.height) * 2;
  const dot = document.createElement("span");
  dot.className = "ripple";
  dot.style.cssText = "width:" + d + "px;height:" + d + "px;left:" + (e.clientX - r.left - d / 2) + "px;top:" + (e.clientY - r.top - d / 2) + "px";
  b.appendChild(dot);
  setTimeout(() => dot.remove(), 650);
});

/* Light that follows the finger / cursor on cards */
document.addEventListener("pointermove", e => {
  const t = e.target.closest && e.target.closest(".row,.stat,.hero,.record-item,.ed-row,.cor-box");
  if (!t) return;
  const r = t.getBoundingClientRect();
  t.style.setProperty("--mx", (e.clientX - r.left) + "px");
  t.style.setProperty("--my", (e.clientY - r.top) + "px");
}, { passive: true });

/* Select the whole grade when a field is focused, so typing replaces it */
list.addEventListener("focusin", e => {
  if (e.target.matches("input[type=number]")) e.target.select();
});
