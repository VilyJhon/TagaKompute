/* Light / dark toggle: login (top right) and drawer header. Saved in localStorage. */
(function () {
  const KEY = "gradingSheet.theme", root = document.documentElement;
  const read = () => { try { return localStorage.getItem(KEY); } catch (e) { return null; } };
  const write = t => { try { localStorage.setItem(KEY, t); } catch (e) {} };
  const ICON = (c, d) => '<svg class="' + c + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + "</svg>";
  const SUN = '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>';
  const MOON = '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>';

  function apply(t) {
    root.dataset.theme = t;
    const m = document.querySelector('meta[name="theme-color"]');
    if (m) m.content = t === "light" ? "#101a4f" : "#070b24";
    document.querySelectorAll(".theme-btn").forEach(b => {
      const light = t === "light";
      b.setAttribute("aria-pressed", String(light));
      b.setAttribute("aria-label", light ? "Switch to dark mode" : "Switch to light mode");
      b.title = light ? "Switch to dark mode" : "Switch to light mode";
    });
  }
  function make() {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "theme-btn";
    b.innerHTML = "<i></i>" + ICON("t-sun", SUN) + ICON("t-moon", MOON);
    return b;
  }

  const gate = document.getElementById("gate");
  if (gate) gate.appendChild(make());
  const close = document.getElementById("drClose");
  if (close) close.before(make());

  document.addEventListener("click", e => {
    if (!e.target.closest(".theme-btn")) return;
    const next = root.dataset.theme === "light" ? "dark" : "light";
    apply(next);
    write(next);
  });

  apply(read() === "light" ? "light" : "dark");
})();
