/* Side drawer (Grades + Class schedule). Loads after script.js and reuses its helpers. */
(function () {
  const KEY = "gradingSheet.schedule", DN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const $ = s => document.querySelector(s);
  let view = "grades", editing = false, draft = [], sel = 0;

  /* ---- storage (per student, per term) ---- */
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
  const group = arr => {
    const out = [];
    arr.forEach(x => {
      if (x.meets) { out.push(x); return; }
      let s = out.find(o => o.code === x.code && o.title === x.title);
      if (!s) { s = { id: x.id || newSubjectId(), code: x.code || "", title: x.title || "", meets: [] }; out.push(s); }
      if ((x.days && x.days.length) || x.start) s.meets.push({ id: newSubjectId(), days: x.days || [], start: x.start, end: x.end, room: x.room || "", warn: x.warn || "" });
    });
    return out;
  };
  const items = () => group(((load()[current.id] || {})[current.activeId]) || []);
  const flat = l => l.flatMap(s => s.meets.map(m => ({ id: m.id, sid: s.id, code: s.code, title: s.title, days: m.days, start: m.start, end: m.end, room: m.room })));
  function store(list) {
    const d = load();
    (d[current.id] = d[current.id] || {})[current.activeId] = list;
    try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) { showToast("Storage is full"); }
  }

  /* ---- helpers ---- */
  const mins = t => { const m = /^(\d{1,2}):(\d{2})$/.exec(t || ""); return m ? +m[1] * 60 + +m[2] : null; };
  const p2 = n => String(n).padStart(2, "0");
  const fmt = t => { const n = mins(t); if (n === null) return "--"; const h = Math.floor(n / 60); return ((h + 11) % 12 + 1) + ":" + p2(n % 60) + (h < 12 ? " AM" : " PM"); };
  const hue = s => { let h = 0; for (const c of String(s || "x")) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
  const dur = n => n >= 60 ? Math.floor(n / 60) + "h" + (n % 60 ? " " + n % 60 + "m" : "") : n + " min";
  const blankMeet = () => ({ id: newSubjectId(), days: [], start: "07:30", end: "09:00", room: "" });
  /* Always Philippine time (Asia/Manila, UTC+8), whatever the phone's own time zone is */
  function ph() {
    const now = new Date(), p = {};
    new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", weekday: "short", hour: "numeric", minute: "numeric", hourCycle: "h23" })
      .formatToParts(now).forEach(x => { p[x.type] = x.value; });
    return {
      d: Math.max(0, DN.indexOf(p.weekday)),
      m: (+p.hour % 24) * 60 + +p.minute,
      date: now.toLocaleDateString("en-US", { timeZone: "Asia/Manila", weekday: "long", year: "numeric", month: "long", day: "numeric" }),
      time: now.toLocaleTimeString("en-US", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" })
    };
  }
  const today = () => ph().d;

  const P = {
    calc: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01"/>',
    flask: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3"/>',
    code: '<path d="M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14"/>',
    palette: '<path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 1.5-2-.6-1.2.2-2.5 1.5-2.5H17a4 4 0 0 0 4-4C21 6.5 17 3 12 3z"/><path d="M7.5 11h.01M10 7.5h.01M14.5 7.5h.01"/>',
    run: '<path d="M6 8v8M18 8v8M3 10v4M21 10v4M6 12h12"/>',
    heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
    book: '<path d="M4 5a2 2 0 0 1 2-2h14v16H6a2 2 0 0 0-2 2V5z"/><path d="M20 19v2H6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    pin: '<path d="M12 21s7-6.2 7-11a7 7 0 0 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    hour: '<path d="M6 3h12M6 21h12M7 3v3l5 6-5 6v3M17 3v3l-5 6 5 6v3"/>',
    screen: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>'
  };
  const svg = k => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + P[k] + "</svg>";
  const iconFor = x => {
    const t = ((x.code || "") + " " + (x.title || "")).toLowerCase();
    return svg(/math|calcul|statis|algebra/.test(t) ? "calc" : /science|chem|physic|biolog/.test(t) ? "flask" : /comput|program|web|itec|software|informat|\bit\b/.test(t) ? "code" : /\bart|music|design/.test(t) ? "palette" : /\bpe\b|pathfit|physical|sport|fitness/.test(t) ? "run" : /nstp|cwts|rotc|service/.test(t) ? "heart" : "book");
  };

  function status(list) {
    const p = ph(), d = p.d, m = p.m;
    const t = list.filter(x => x.days.includes(d)).sort((a, b) => mins(a.start) - mins(b.start));
    return { d, m, t, cur: t.find(x => m >= mins(x.start) && m < mins(x.end)), nxt: t.find(x => mins(x.start) > m) };
  }
  function conflicts(list) {
    const bad = new Set();
    list.forEach((a, i) => list.slice(i + 1).forEach(b => {
      if (a.days.some(d => b.days.includes(d)) && mins(a.start) < mins(b.end) && mins(b.start) < mins(a.end)) { bad.add(a.id); bad.add(b.id); }
    }));
    return bad;
  }

  /* ---- COR schedule parsing (days, time, room are kept) ---- */
  function parseDays(s) {
    s = String(s).toUpperCase().replace(/[^A-Z]/g, "");
    const f = { MON: 0, TUE: 1, WED: 2, THU: 3, FRI: 4, SAT: 5, SUN: 6 }, m = { M: 0, T: 1, W: 2, TH: 3, F: 4, S: 5, SU: 6 };
    let a = null;
    if (/^(MON|TUE|WED|THU|FRI|SAT|SUN)+$/.test(s)) a = s.match(/MON|TUE|WED|THU|FRI|SAT|SUN/g).map(x => f[x]);
    else if (/^(TH|SU|M|T|W|F|S)+$/.test(s)) a = s.match(/TH|SU|M|T|W|F|S/g).map(x => m[x]);
    return a ? [...new Set(a)].sort() : [];
  }
  function to24(h, m, ap) {
    h = +h;
    if (ap) { ap = ap.toUpperCase(); if (ap === "PM" && h < 12) h += 12; if (ap === "AM" && h === 12) h = 12; }
    else if (h < 7) h += 12;
    return p2(h) + ":" + m;
  }
  function parseLine(line) {
    const t = /(\d{1,2})[:;.](\d{2})\s*([AP]M)?\s*(?:-|–|—|to)\s*(\d{1,2})[:;.](\d{2})\s*([AP]M)?/i.exec(line);
    if (!t) return null;
    const end = to24(t[4], t[5], t[6]);
    let start = to24(t[1], t[2], t[3] || t[6]);
    if (!t[3] && mins(start) >= mins(end)) { const h = mins(start) - 720; if (h >= 0) start = p2(Math.floor(h / 60)) + ":" + p2(h % 60); }
    const before = line.slice(0, t.index), after = line.slice(t.index + t[0].length);
    const days = (before + " " + after).split(/\s+/).map(parseDays).find(d => d.length) || [];
    const room = (after.replace(/\b(?:RM|ROOM)\.?\s*/i, " ").split(/\s+/).filter(x => /\d/.test(x) && /^[A-Z]{0,4}-?\d{2,4}[A-Z]?$/i.test(x)).pop()) || "";
    return { start: start, end: end, days: days, room: room };
  }
  function findSub(line) {
    const n = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, ""), L = n(line);
    return current.subjects.find(s => n(s.code).length >= 3 && L.includes(n(s.code))) ||
           current.subjects.find(s => n(s.title).length > 4 && L.includes(n(s.title)));
  }
  function parseText(text) {
    const out = []; let prev = null;
    String(text).split(/\r?\n/).forEach(raw => {
      const line = raw.replace(/[|│¦]/g, "  ").replace(/(\d),(\d)/g, "$1.$2").trim();
      if (!line) return;
      const sub = findSub(line), p = parseLine(line);
      if (sub) prev = sub;
      if (!p) return;
      const s = sub || prev;
      const code = s ? s.code : (line.match(/\b[A-Z]{2,8}-?\d{0,4}[A-Z]?\b/) || [""])[0];
      const key = code + p.days + p.start;
      if (out.some(o => o.code + o.days + o.start === key)) return;
      out.push({ id: newSubjectId(), code: code, title: s ? s.title : "", days: p.days, start: p.start, end: p.end, room: p.room,
        warn: !p.days.length ? "Days not read - tap the days" : (!p.room ? "Room not read - please check" : "") });
    });
    return out;
  }
  function st(msg, bad) { const el = $("#dsSt"); if (!el) return; el.textContent = msg; el.hidden = !msg; el.classList.toggle("bad", !!bad); }
  async function scan(files) {
    let w = null;
    try {
      if (typeof Tesseract === "undefined") throw new Error("The scanner could not load. Check your connection.");
      st("Preparing image...");
      w = await Tesseract.createWorker("eng", 1, { logger: m => { if (m.status === "recognizing text") st("Reading schedule... " + Math.round(m.progress * 100) + "%"); } });
      const all = [];
      for (const f of files) {
        const im = await prepareImage(f); let best = [];
        for (const a of [[im.clean, "6"], [im.plain, "4"]]) {
          await w.setParameters({ tessedit_pageseg_mode: a[1], preserve_interword_spaces: "1" });
          const r = await w.recognize(a[0]); const found = parseText(r.data.text);
          if (found.length > best.length) best = found;
          if (best.length >= 3) break;
        }
        all.push(...best);
      }
      if (!all.length) return st("No classes with a time were found. Try a clearer photo or add them manually.", true);
      draft = group(draft.filter(d => d.code || d.title).concat(all));
      render();
      st("Found " + all.length + " class" + (all.length === 1 ? "" : "es") + ". Check the highlighted ones, then save.");
    } catch (e) { st(e && e.message ? e.message : "Scanning failed.", true); }
    finally { if (w) { try { await w.terminate(); } catch (e) {} } }
  }

  /* ---- views ---- */
  function gradesHTML() {
    const s = summarize(current.subjects, current.entries), g = s.gwa, cg = current.terms.length > 1 ? cumulativeGwa() : null;
    const tone = g === null ? "" : (+g <= PASSING_GRADE ? "pass" : "fail");
    const tag = g === null ? "Awaiting grades" : +g <= 1.12 ? "Excellent" : +g <= 1.62 ? "Superior" : +g <= 2.12 ? "Very Good" : +g <= 2.62 ? "Good" : +g <= 3 ? "Fair" : "Needs attention";
    const frac = g === null ? 0 : Math.min(1, Math.max(0.05, (parseFloat(s.avg) - 60) / 40));
    const rows = current.subjects.filter(x => x.counted).map(sub => {
      const r = evaluate(current.entries[sub.id], sub);
      const ini = esc((sub.code || sub.title).replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase());
      return `<div class="dg-row ${r ? r.status : ""}" style="--h:${hue(sub.code || sub.title)};--w:${r && !r.special ? r.percent : 0}%"><div class="dg-av">${ini}</div><div class="dg-mid"><b>${esc(sub.title)}</b><small>${esc(sub.code)}${sub.code ? " · " : ""}${formatUnits(sub.units)} units</small><div class="dg-bar"><u></u></div></div><span>${r ? (r.special ? r.badge : r.grade.toFixed(2)) : "–"}</span></div>`;
    }).join("");
    return `<p class="dg-term">${esc(current.term || "This term")}</p>
      <div class="dg-hero ${tone}"><div class="dg-ring"><svg viewBox="0 0 120 120"><circle class="rb" cx="60" cy="60" r="52"/><circle class="rf" cx="60" cy="60" r="52" transform="rotate(-90 60 60)" data-f="${frac}"/></svg><div><small>GWA</small><b class="dg-num" data-v="${g || ""}">–</b></div></div>
      <div class="dg-side"><em>${tag}</em><span>${s.avg ? s.avg + "% average" : "No grades yet"}</span><span>${s.passed} passed · ${s.failed} failed</span>${cg !== null ? `<span>CGWA ${cg.toFixed(2)}</span>` : ""}</div></div>
      <div class="dg-list">${rows}</div>`;
  }

  function schedHTML() {
    const subs = items(), list = flat(subs);
    if (!subs.length) return `<div class="ds-empty"><div class="ds-ico">🗓️<i></i><i></i><i></i></div><b>No schedule yet</b><p>Scan your COR or build it from your subjects. Days, time and room are filled in for you.</p>
      <button class="solid" data-a="edit">Set up schedule</button></div>`;
    const S = status(list), cf = conflicts(list);
    if (sel === null) sel = S.d;
    let banner;
    if (S.cur) banner = `<div class="dn now"><small>Now</small><b>${esc(S.cur.title || S.cur.code)}</b><span>${fmt(S.cur.start)} – ${fmt(S.cur.end)}${S.cur.room ? " · Room " + esc(S.cur.room) : ""} · ends in ${dur(mins(S.cur.end) - S.m)}</span><div class="dn-bar"><i style="width:${(S.m - mins(S.cur.start)) / (mins(S.cur.end) - mins(S.cur.start)) * 100}%"></i></div></div>`;
    else if (S.nxt) banner = `<div class="dn next"><small>Up next</small><b>${esc(S.nxt.title || S.nxt.code)}</b><span>${fmt(S.nxt.start)} – ${fmt(S.nxt.end)}${S.nxt.room ? " · Room " + esc(S.nxt.room) : ""} · in ${dur(mins(S.nxt.start) - S.m)}</span></div>`;
    else banner = `<div class="dn"><small>Today</small><b>${S.t.length ? "All done for today" : "No classes today"}</b><span>${S.t.length ? "Nice work." : "Enjoy the free day."}</span></div>`;

    const chips = DN.map((d, k) => `<button type="button" data-day="${k}" class="${k === sel ? "on" : ""}${k === S.d ? " tdy" : ""}">${d}<i>${list.filter(x => x.days.includes(k)).length || ""}</i></button>`).join("");
    const day = list.filter(x => x.days.includes(sel)).sort((a, b) => mins(a.start) - mins(b.start));
    let prevEnd = null;
    const cards = day.length ? day.map(x => {
      const live = sel === S.d, st = live ? (x === S.cur ? "now" : mins(x.end) <= S.m ? "done" : "next") : "";
      const gap = prevEnd !== null && mins(x.start) - prevEnd >= 15 ? `<div class="sx-gap"><span>${svg("clock")}Break · ${dur(mins(x.start) - prevEnd)}</span></div>` : "";
      prevEnd = mins(x.end);
      const stTxt = st === "now" ? "Now · " + dur(mins(x.end) - S.m) + " left" : st === "done" ? "Done" : st === "next" ? "In " + dur(mins(x.start) - S.m) : "";
      const prog = st === "now" ? `<div class="sx-bar"><i style="width:${(S.m - mins(x.start)) / (mins(x.end) - mins(x.start)) * 100}%"></i></div>` : "";
      const on = /online/i.test(x.room);
      const room = x.room ? `<span class="sx-chip">${svg(on ? "screen" : "pin")}${on ? "Online" : "Room " + esc(x.room)}</span>` : `<span class="sx-chip dim">${svg("pin")}No room set</span>`;
      return gap + `<div class="sx ${st}" style="--h:${hue(x.code || x.title)}"><div class="sx-rail"><i></i></div><div class="sx-card">
        <div class="sx-top"><div class="sx-ico">${iconFor(x)}</div><div class="sx-name"><b>${esc(x.title || x.code)}</b><small>${esc(x.code)}</small></div>${stTxt ? `<span class="sx-st">${stTxt}</span>` : ""}</div>
        <div class="sx-time"><div><small>Start</small><b>${fmt(x.start)}</b></div><span class="sx-arr">&rarr;</span><div><small>End</small><b>${fmt(x.end)}</b></div><span class="sx-dur">${svg("hour")}${dur(mins(x.end) - mins(x.start))}</span></div>
        <div class="sx-meta">${room}${cf.has(x.id) ? "<em>Time conflict</em>" : ""}</div>${prog}</div></div>`;
    }).join("") : `<p class="ds-none">No classes on ${DN[sel]}.</p>`;

    const tba = subs.filter(x => !x.meets.length);
    let wkHTML = "";
    if (list.length) {
      const lo = Math.floor(Math.min(...list.map(x => mins(x.start))) / 60) * 60, hi = Math.ceil(Math.max(...list.map(x => mins(x.end))) / 60) * 60, span = (hi - lo) || 60;
      const wk = DN.map((d, k) => `<div class="wk-r${k === S.d ? " today" : ""}"><span>${d}</span><div class="wk-track">${list.filter(x => x.days.includes(k)).map(x =>
        `<i style="--h:${hue(x.code || x.title)};left:${(mins(x.start) - lo) / span * 100}%;width:${(mins(x.end) - mins(x.start)) / span * 100}%" title="${esc(x.title)}"></i>`).join("")}</div></div>`).join("");
      const hrs = span / 60;
      const labels = Array.from({ length: hrs + 1 }, (_, i) => { const h = lo / 60 + i; return `<span style="left:${i / hrs * 100}%">${(h + 11) % 12 + 1}${h < 12 ? "a" : "p"}</span>`; }).join("");
      const legend = subs.filter(x => x.meets.length).map(x => `<span><i style="--h:${hue(x.code || x.title)}"></i>${esc(x.code || x.title)}</span>`).join("");
      wkHTML = `<h4 class="ds-h">Week at a glance</h4><div class="wk" style="--hrs:${hrs}">${wk}<div class="wk-ax">${labels}</div></div><div class="wk-lg">${legend}</div>`;
    }
    const tbaHTML = tba.length ? `<h4 class="ds-h">No fixed meeting</h4><div class="tba">${tba.map(x => `<span style="--h:${hue(x.code || x.title)}">${svg("screen")}<b>${esc(x.code || x.title)}</b>${x.code ? " " + esc(x.title) : ""}<em>Online / TBA</em></span>`).join("")}</div>` : "";
    const nowPH = ph();
    return `<p class="ds-date"><b>${nowPH.date}</b><span>${nowPH.time} PHT</span></p>${banner}<div class="dd">${chips}</div><div class="sc-list">${cards}</div>${tbaHTML}${wkHTML}
      ${cf.size ? `<p class="ds-warn">&#9888; ${cf.size} meetings overlap. Edit the schedule to fix them.</p>` : ""}
      <button class="ghost ds-edit" data-a="edit">Edit schedule</button>`;
  }

  const meetRow = (m, j) => `<div class="me${m.warn ? " warn" : ""}" data-j="${j}">
    <div class="me-head"><span>Meeting ${j + 1}</span><button type="button" data-a="delm" aria-label="Remove meeting">&times;</button></div>
    <div class="se-days">${DN.map((d, k) => `<button type="button" data-d="${k}" class="${m.days.includes(k) ? "on" : ""}">${d}</button>`).join("")}</div>
    <div class="me-time"><label>Start<input class="me-start" type="time" value="${esc(m.start)}"></label><label>End<input class="me-end" type="time" value="${esc(m.end)}"></label>
    <label class="wide">Room<input class="me-room" placeholder="e.g. 301" maxlength="20" value="${esc(m.room)}"></label></div>
    ${m.warn ? `<p class="ds-warn">${esc(m.warn)}</p>` : ""}</div>`;

  const editRow = (s, i) => `<div class="se" data-i="${i}" style="--h:${hue(s.code || s.title)}">
    <div class="se-top"><input class="se-code" placeholder="Code" maxlength="20" value="${esc(s.code)}"><input class="se-title" list="dsubs" placeholder="Subject title" maxlength="120" value="${esc(s.title)}"><button type="button" data-a="del" aria-label="Remove subject">&times;</button></div>
    ${s.meets.map(meetRow).join("") || '<p class="me-none">No meeting set. Shown as online / TBA.</p>'}
    <button type="button" class="me-add" data-a="addm">+ Add meeting</button></div>`;

  const editHTML = () => `<datalist id="dsubs">${current.subjects.map(s => `<option value="${esc(s.title)}">`).join("")}</datalist>
    <p class="ds-hint">A subject can have several meetings (different days, time or room), or none at all.</p>
    <div class="ds-actions"><button class="ghost" data-a="scan">Scan COR photo</button><button class="ghost" data-a="fill">Use my subjects</button><button class="ghost" data-a="add">+ Add subject</button></div>
    <p id="dsSt" class="ds-st" hidden></p>
    ${draft.map(editRow).join("") || '<p class="ds-none">No subjects yet.</p>'}
    <div class="ds-bar"><button class="ghost" data-a="cancel">Cancel</button><button class="solid" data-a="save">Save schedule</button></div>`;

  /* ---- validation: no two meetings may share a day AND overlap in time ---- */
  function clashOf(m) {
    for (const o of draft) {
      if (!(o.code.trim() || o.title.trim())) continue;
      for (const n of o.meets) {
        if (n === m) continue;
        const d = n.days.find(k => m.days.includes(k));
        const a = [mins(m.start), mins(m.end), mins(n.start), mins(n.end)];
        if (d !== undefined && a.every(x => x !== null) && a[0] < a[3] && a[2] < a[1]) return { o: o, n: n, d: d };
      }
    }
    return null;
  }
  const clashText = c => "Time already used by " + (c.o.code || c.o.title) + " on " + DN[c.d] + " (" + fmt(c.n.start) + " – " + fmt(c.n.end) + "). Choose another time or day.";
  function problem(m) {
    if (!m.days.length) return "Pick at least one day.";
    if (mins(m.start) === null || mins(m.end) === null) return "Enter a start and end time.";
    if (mins(m.start) >= mins(m.end)) return "End time must be after the start time.";
    const c = clashOf(m);
    return c ? clashText(c) : "";
  }
  function flag(me, msg) {
    me.classList.toggle("bad", !!msg);
    let p = me.querySelector(".me-err");
    if (msg) { if (!p) { p = document.createElement("p"); p.className = "me-err"; me.appendChild(p); } p.textContent = msg; }
    else if (p) p.remove();
  }

  /* Smooth in-place add / remove (no full redraw, so nothing blinks) */
  const fx = {
    show(el) {
      const h = el.offsetHeight, mb = getComputedStyle(el).marginBottom;
      Object.assign(el.style, { overflow: "hidden", transition: "none", height: "0px", opacity: "0", marginBottom: "0px", transform: "translateY(-8px)" });
      void el.offsetHeight;
      Object.assign(el.style, { transition: "height .45s var(--ease), opacity .4s, margin .45s var(--ease), transform .45s var(--ease)", height: h + "px", opacity: "1", marginBottom: mb, transform: "none" });
      setTimeout(() => { ["overflow", "transition", "height", "opacity", "marginBottom", "transform"].forEach(k => { el.style[k] = ""; }); }, 500);
    },
    hide(el, done) {
      const h = el.offsetHeight;
      Object.assign(el.style, { overflow: "hidden", pointerEvents: "none", transition: "none", height: h + "px" });
      void el.offsetHeight;
      Object.assign(el.style, { transition: "height .4s var(--ease), opacity .3s, margin .4s var(--ease), padding .4s var(--ease), border-width .4s, transform .4s var(--ease)", height: "0px", opacity: "0", marginBottom: "0px", paddingTop: "0px", paddingBottom: "0px", borderWidth: "0px", transform: "scale(.96)" });
      setTimeout(done, 430);
    }
  };
  const reindex = () => {
    $("#drBody").querySelectorAll(".se:not(.gone)").forEach((r, i) => {
      r.dataset.i = i;
      r.querySelectorAll(".me:not(.gone)").forEach((m, j) => { m.dataset.j = j; m.querySelector(".me-head span").textContent = "Meeting " + (j + 1); });
    });
  };

  function render(anim) {
    const dr = $("#dr"); if (!dr || !current) return;
    dr.dataset.v = view;
    const body = $("#drBody"), sc = body.scrollTop;
    body.innerHTML = view === "grades" ? gradesHTML() : (editing ? editHTML() : schedHTML());
    body.scrollTop = anim ? 0 : sc;
    body.classList.remove("swap");
    if (anim) { void body.offsetWidth; body.classList.add("swap"); }
    body.querySelectorAll(".dg-row,.sc,.sx,.se,.tba span,.dd button,.wk-r,.ds-actions button").forEach((el, i) => el.style.setProperty("--i", i));
    const num = body.querySelector(".dg-num");
    if (num && num.dataset.v) animateValue(num, parseFloat(num.dataset.v), 2, "");
    const rf = body.querySelector(".rf");
    if (rf) { rf.style.strokeDasharray = 327; rf.style.strokeDashoffset = 327; requestAnimationFrame(() => requestAnimationFrame(() => { rf.style.strokeDashoffset = 327 * (1 - rf.dataset.f); })); }
  }

  /* ---- drawer shell ---- */
  const back = document.createElement("div");
  back.id = "drBack"; back.className = "dr-back";
  back.innerHTML = `<aside id="dr" class="dr" data-v="grades" role="dialog" aria-modal="true" aria-label="Grades and schedule">
    <div class="dr-grip"></div>
    <header class="dr-head"><div class="dr-tabs"><button type="button" data-view="grades">Grades</button><button type="button" data-view="sched">Schedule</button></div>
    <button type="button" class="dr-x" id="drClose" aria-label="Close">&times;</button></header>
    <div class="dr-body" id="drBody"></div><input id="drFile" type="file" accept="image/*" multiple hidden></aside>`;
  document.body.appendChild(back);

  const btn = document.createElement("button");
  btn.id = "drBtn"; btn.type = "button"; btn.className = "ghost dr-btn"; btn.setAttribute("aria-label", "Open grades and schedule");
  btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M15 4v16"/></svg>';
  $("#switchBtn").after(btn);
  const live = () => { let on = false; try { on = !!(current && current.id && status(flat(items())).cur); } catch (e) {} btn.classList.toggle("live", on); };

  const open = v => { if (!current) return; view = v || view; editing = false; sel = today(); $("#drBody").dataset.dir = view === "sched" ? "l" : "r"; render(true); back.classList.add("open"); };
  const close = () => { back.classList.remove("open"); live(); };
  btn.onclick = () => open();
  $("#drClose").onclick = close;
  back.addEventListener("click", e => { if (e.target === back) close(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") close(); });
  let tx = null;
  $("#dr").addEventListener("touchstart", e => { tx = e.touches[0].clientX; }, { passive: true });
  $("#dr").addEventListener("touchend", e => { if (tx !== null && e.changedTouches[0].clientX - tx > 90) close(); tx = null; }, { passive: true });
  setInterval(() => { live(); if (back.classList.contains("open") && view === "sched" && !editing) render(); }, 30000);

  back.addEventListener("click", e => {
    const t = e.target.closest("button"); if (!t) return;
    if (t.dataset.view) { if (t.dataset.view === view && !editing) return; view = t.dataset.view; editing = false; $("#drBody").dataset.dir = view === "sched" ? "l" : "r"; render(true); return; }
    if (t.dataset.day !== undefined) { sel = +t.dataset.day; $("#drBody").dataset.dir = "l"; render(true); return; }
    const row = t.closest(".se"), s = row ? draft[+row.dataset.i] : null, me = t.closest(".me"), m = me && s ? s.meets[+me.dataset.j] : null;
    if (t.dataset.d !== undefined && m) {
      const k = +t.dataset.d;
      if (!m.days.includes(k)) {
        const c = clashOf({ days: [k], start: m.start, end: m.end });
        if (c) { flag(me, clashText(c)); showToast(DN[k] + " is already taken at that time"); return; }
        m.days = m.days.concat(k).sort();
      } else m.days = m.days.filter(x => x !== k);
      t.classList.toggle("on");
      if (me.classList.contains("bad")) flag(me, problem(m));
      return;
    }
    const a = t.dataset.a; if (!a) return;
    if (a === "edit") { editing = true; draft = JSON.parse(JSON.stringify(items())); $("#drBody").dataset.dir = "l"; render(true); }
    else if (a === "cancel") { editing = false; $("#drBody").dataset.dir = "r"; render(true); }
    else if (a === "add") {
      draft.push({ id: newSubjectId(), code: "", title: "", meets: [blankMeet()] });
      const bar = $("#drBody .ds-bar"), none = $("#drBody .ds-none"); if (none) none.remove();
      bar.insertAdjacentHTML("beforebegin", editRow(draft[draft.length - 1], draft.length - 1));
      const el = bar.previousElementSibling; fx.show(el);
      setTimeout(() => el.scrollIntoView({ block: "center", behavior: "smooth" }), 80);
    }
    else if (a === "del" && s) {
      draft.splice(+row.dataset.i, 1); row.classList.add("gone"); reindex();
      fx.hide(row, () => { row.remove(); if (!draft.length) { const bar = $("#drBody .ds-bar"); bar.insertAdjacentHTML("beforebegin", '<p class="ds-none">No subjects yet.</p>'); } });
    }
    else if (a === "addm" && s) {
      const mt = blankMeet(); s.meets.push(mt);
      const none = row.querySelector(".me-none"); if (none) none.remove();
      t.insertAdjacentHTML("beforebegin", meetRow(mt, s.meets.length - 1));
      const el = t.previousElementSibling; fx.show(el);
      setTimeout(() => el.scrollIntoView({ block: "nearest", behavior: "smooth" }), 80);
    }
    else if (a === "delm" && m) {
      s.meets.splice(+me.dataset.j, 1); me.classList.add("gone"); reindex();
      fx.hide(me, () => {
        me.remove();
        if (!s.meets.length && !row.querySelector(".me-none")) {
          row.querySelector(".me-add").insertAdjacentHTML("beforebegin", '<p class="me-none">No meeting set. Shown as online / TBA.</p>');
          fx.show(row.querySelector(".me-none"));
        }
      });
    }
    else if (a === "scan") $("#drFile").click();
    else if (a === "fill") {
      current.subjects.forEach(x => { if (!draft.some(d => d.code === x.code && d.title === x.title)) draft.push({ id: newSubjectId(), code: x.code, title: x.title, meets: [] }); });
      draft = draft.filter(d => d.code || d.title); render();
    } else if (a === "save") {
      const list = draft.filter(d => d.code.trim() || d.title.trim());
      let first = null;
      $("#drBody").querySelectorAll(".se:not(.gone)").forEach(r => {
        const d = draft[+r.dataset.i], named = d.code.trim() || d.title.trim();
        r.querySelectorAll(".me:not(.gone)").forEach(el => {
          const msg = named ? problem(d.meets[+el.dataset.j]) : "";
          flag(el, msg); if (msg && !first) first = el;
        });
      });
      if (first) { first.scrollIntoView({ block: "center", behavior: "smooth" }); showToast("Fix the highlighted meetings first"); return; }
      list.forEach(d => d.meets.forEach(x => { delete x.warn; }));
      store(list); editing = false; $("#drBody").dataset.dir = "r"; render(true); live(); showToast("Schedule saved");
    }
  });
  back.addEventListener("input", e => {
    const row = e.target.closest(".se"); if (!row) return;
    const s = draft[+row.dataset.i], me = e.target.closest(".me");
    if (me) { const m = s.meets[+me.dataset.j], c = e.target.className.replace("me-", ""); if (m && c in m) m[c] = e.target.value; if (m && (c === "start" || c === "end") && m.days.length) flag(me, problem(m)); return; }
    const c = e.target.className.replace("se-", "");
    if (c in s) s[c] = e.target.value;
    if (c === "title") { const x = current.subjects.find(y => y.title === e.target.value); if (x) { s.code = x.code; row.querySelector(".se-code").value = x.code; } }
    row.style.setProperty("--h", hue(s.code || s.title));
  });
  $("#drFile").addEventListener("change", e => {
    const f = Array.from(e.target.files || []).slice(0, 4); e.target.value = "";
    if (f.length) scan(f);
  });
})();
