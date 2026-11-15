// Independent of the application bundle so a failed import still has recovery UI.
(() => {
  const surface = document.getElementById("startup");
  const root = document.getElementById("root");
  const message = document.getElementById("startup-message");
  const retry = document.getElementById("startup-retry");
  if (!surface || !root || !message || !retry) return;
  let leaving = false;
  let finished = false;
  const theme = (value) => {
    if (!["light", "dark", "system"].includes(value)) return;
    document.documentElement.dataset.startupTheme = value;
    // Only cache appearance, never workspace content. Storage can be unavailable.
    try { localStorage.setItem("cybernote.startup-theme", value); } catch { /* Optional. */ }
  };
  try { theme(localStorage.getItem("cybernote.startup-theme")); } catch { /* System theme. */ }
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
