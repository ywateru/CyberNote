// Independent of the application bundle so a failed import still has recovery UI.
(() => {
  const surface = document.getElementById("startup");
  const root = document.getElementById("root");
  const message = document.getElementById("startup-message");
  const retry = document.getElementById("startup-retry");
  if (!surface || !root || !message || !retry) return;
  let leaving = false;
  let finished = false;
  const media = matchMedia("(prefers-color-scheme: dark)");
  const valid = (v) => v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 3 && v.version === 2 && ["classic", "paper", "high-contrast"].includes(v.themeId) && ["system", "light", "dark"].includes(v.schemePreference);
  let current = { version: 2, themeId: "classic", schemePreference: "system" };
  const apply = () => {
    const dark = current.schemePreference === "dark" || (current.schemePreference === "system" && media.matches);
    const html = document.documentElement;
    html.dataset.themeId = current.themeId;
    html.dataset.theme = current.schemePreference;
    html.dataset.scheme = dark ? "dark" : "light";
    html.dataset.startupTheme = current.schemePreference;
    html.classList.toggle("dark", dark);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", getComputedStyle(html).getPropertyValue("--paper").trim());
  };
  const appearance = (value) => {
    if (!valid(value)) return;
    current = { ...value }; apply();
    try { localStorage.setItem("cybernote.startup-appearance-v2", JSON.stringify(current)); } catch { /* Appearance cache is optional. */ }
  };
  const theme = (value) => { if (["light", "dark", "system"].includes(value)) appearance({ ...current, schemePreference: value }); };
  try {
    const cached = localStorage.getItem("cybernote.startup-appearance-v2");
    if (cached !== null) { const value = JSON.parse(cached); if (valid(value)) current = value; }
    else { const legacy = localStorage.getItem("cybernote.startup-theme"); if (["light", "dark", "system"].includes(legacy)) current.schemePreference = legacy; }
  } catch { /* Invalid or inaccessible cache uses Classic/system. */ }
  apply(); media.addEventListener("change", apply);
  const reload = () => location.reload();
  retry.addEventListener("click", reload);
  const slow = setTimeout(() => {
    if (leaving || finished || surface.dataset.state === "error") return;
    message.textContent = "打开时间较长，请稍候…";
    retry.hidden = false;
  }, 15000);
  const fail = () => {
    if (leaving || finished) return;
    clearTimeout(slow);
    surface.dataset.state = "error";
    surface.setAttribute("aria-busy", "false");
    message.textContent = "暂时无法打开备忘录，请重新加载。";
    retry.hidden = false;
  };
  const onError = (event) => {
    if (event.target?.id === "app-entry" || event instanceof ErrorEvent) fail();
  };
  window.addEventListener("error", onError, true);
  window.__CYBERNOTE_STARTUP__ = {
    theme,
    appearance,
    fail,
    ready() {
      if (leaving || finished) return;
      leaving = true;
      clearTimeout(slow);
      window.removeEventListener("error", onError, true);
      surface.dataset.state = "leaving";
      surface.setAttribute("aria-busy", "false");
      const finish = () => {
        if (finished) return;
        finished = true;
        surface.remove();
        root.removeAttribute("inert");
        root.removeAttribute("aria-hidden");
        root.removeAttribute("aria-busy");
        retry.removeEventListener("click", reload);
      };
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) finish();
      else setTimeout(finish, 240);
    },
  };
})();
