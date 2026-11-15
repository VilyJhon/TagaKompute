/* Grade mascot: reacts to GWA, passed and failed subjects. Hooked from refresh() in script.js. */
(function () {
  const card = document.getElementById("mascot"), fig = document.getElementById("mascotFig");
  const msgEl = document.getElementById("mascotMsg"), moodEl = document.getElementById("mascotMood");
  const MOODS = {
    ready: ["Ready", ["Hi {n}! Type a grade below and I'll react.", "Add your first grade and we'll start tracking."]],
    proud: ["Proud", ["{n}, this is excellent work. Keep it up!", "Top results, {n}. You earned this."]],
    encouraged: ["Encouraged", ["{n}, you're doing well. Keep your rhythm steady and protect this progress.", "Solid grades, {n}. A little more push goes a long way."]],
    thoughtful: ["Thoughtful", ["{n}, there's real progress here. We can turn the difficult spots into a clear plan.", "Some wins, one to fix. Let's look at it together, {n}."]],
    concerned: ["Concerned, not discouraged", ["{n}, a difficult grade does not define you. Let's improve one subject at a time.", "Rough patch, {n}. Start with one subject and build up."]]
  };
  const CHEER = ["You've got this, {n}.", "Every grade can still move up. One step at a time.", "Rest, review, retry. That's how scores climb."];
  /* Frames are plain JPEGs flipped by a timer (no animated-image decoder, so no glitchy tiles) */
  const N = { ready: 9, proud: 9, encouraged: 9, thoughtful: 9, concerned: 9 };
  const SET = { ready: "ready", proud: "excellent", encouraged: "excellent", thoughtful: "thoughtful", concerned: "concerned" };
  const pic = fig.querySelector("img");
  let frame = 0, cur = "ready";
  const src = () => "mascot/" + SET[cur] + "-" + frame + ".jpg";
  Object.keys(SET).forEach(k => { for (let i = 0; i < 9; i++) new Image().src = "mascot/" + SET[k] + "-" + i + ".jpg"; });
  setInterval(() => { if (!pic || document.hidden) return; frame = (frame + 1) % 9; pic.src = src(); }, 640);
  let mood = "ready", i = 0, stats = { gwa: null, passed: 0, failed: 0 };
  const first = () => { const n = (window.current && current.name || "").trim(); if (!n) return "there"; return (n.includes(",") ? n.split(",")[1] : n.split(" ")[0]).trim() || "there"; };
  const say = t => { msgEl.textContent = t.replace(/\{n\}/g, first()); };
  function focus() {
    let t = "";
    (current.subjects || []).forEach((s, k) => { const r = document.getElementById("r" + k); if (!t && s.counted && r && r.classList.contains("fail")) t = s.title || s.code; });
    if (t) return "Focus on " + t + " first: review it for 25 minutes, then re-check your grade.";
    const open = (current.subjects || []).find(s => s.counted && !(current.entries || {})[s.id]);
    return open ? "Next up: enter your grade for " + (open.title || open.code) + "." : "No weak spots right now. Review your lowest subject to stay ahead.";
  }
  window.updateMascot = function (s) {
    stats = { gwa: s.gwa === null ? null : parseFloat(s.gwa), passed: s.passed, failed: s.failed };
    const m = stats.gwa === null ? "ready" : !stats.failed ? (stats.gwa <= 1.5 ? "proud" : "encouraged") : !stats.passed ? "concerned" : "thoughtful";
    card.dataset.mood = m; cur = m; frame = 0; if (pic) pic.src = src(); moodEl.textContent = MOODS[m][0];
    if (m !== mood || !msgEl.textContent) { mood = m; i = 0; say(MOODS[m][1][0]); react(); }
  };
  function react() { fig.classList.remove("hop"); void fig.offsetWidth; fig.classList.add("hop"); }
  fig.addEventListener("click", () => { i = (i + 1) % MOODS[mood][1].length; say(MOODS[mood][1][i]); react(); });
  card.querySelectorAll("[data-say]").forEach(b => b.addEventListener("click", () => {
    const k = b.dataset.say;
    if (k === "talk") { i = (i + 1) % MOODS[mood][1].length; say(MOODS[mood][1][i]); }
    else if (k === "cheer") say(CHEER[Math.floor(Math.random() * CHEER.length)]);
    else msgEl.textContent = focus();
    react();
  }));
  card.addEventListener("pointermove", e => {
    const b = fig.getBoundingClientRect(), x = (e.clientX - b.left - b.width / 2) / b.width, y = (e.clientY - b.top - b.height / 2) / b.height;
    fig.style.setProperty("--ry", Math.max(-1, Math.min(1, x)) * 12 + "deg");
    fig.style.setProperty("--rx", Math.max(-1, Math.min(1, y)) * -10 + "deg");
  });
  card.addEventListener("pointerleave", () => { fig.style.setProperty("--rx", "0deg"); fig.style.setProperty("--ry", "0deg"); });
})();
