import { resolve } from "node:path";
import { api, idle, saveJSON } from "./runtime.mjs";
import { signedOutAccount } from "./account-fixture.mjs";

const ready = (displayName = "当前合成账户") => ({
  state: "ready", enabled: true, profile: { subject: "matrix-account", displayName, username: "合成账号标识".repeat(18) },
  devices: [{ id: "local", name: "此设备", online: true, current: true, connected: false },
    { id: "remote", name: "合成远端设备", online: false, current: false, connected: false }],
  pendingCount: 2, conflictCount: 1,
});
const result = value => ({ ok: true, value, events: [] });
const stale = outcome => outcome === "success" ? result(ready("不应显示的旧账户")) :
  { ok: false, error: { code: "fixture_late_failure", message: "不应显示的旧失败" }, events: [] };

// Hold an actual IPC response, not a React mock. Exactly one matching request
// is intercepted; every wait is bounded and the caller always releases it.
function holdResponse(backend, type) {
  const original = backend.call.bind(backend);
  let began, release, captured = false, timer;
  const started = new Promise((resolve, reject) => {
    began = resolve; timer = setTimeout(() => reject(Error(`No ${type} IPC within deadline`)), 10000);
  });
  backend.call = async (id, args) => {
    const response = await original(id, args);
    if (id !== "account_command" || args.command.type !== type || captured) return response;
    captured = true;
    const held = new Promise(resolve => { release = value => resolve(value || response); });
    clearTimeout(timer); began();
    return held;
  };
  return { started, release: value => release?.(value), restore: () => { clearTimeout(timer); release?.(); backend.call = original; } };
}

export async function runAccountMatrix(runtime, { command, check, output }) {
  const { page, backend } = runtime;
  const root = () => page.locator(".account-settings");
  const close = () => page.getByRole("button", { name: "关闭设置", exact: true }).click();
  const calls = type => backend.calls.filter(row => row.command === "account_command" && row.type === type).length;
  const open = async () => {
    await api(page, "settings.open");
    await page.waitForSelector(".preferences");
    await api(page, "settings.tab", { tab: "account" });
    await page.waitForFunction(() => {
      const state = document.querySelector(".account-settings")?.getAttribute("data-account-state");
      return !!state && state !== "loading";
    });
  };
  const reset = async value => {
    await page.setViewportSize(runtime.viewport); await runtime.reset();
    backend.account = structuredClone(value || signedOutAccount()); await open();
  };
  const rows = [];
  // Two authorization entries × four lifetime boundaries × success/error.
  // Native state changes only in this explicit fixture. Old frontend responses
  // must never overwrite the newer independently-read status.
  for (const type of ["signIn", "signUp"]) for (const boundary of ["cancel", "category", "close", "reload"]) for (const outcome of ["success", "error"]) {
    await reset();
    const held = holdResponse(backend, type);
    const pending = api(page, `account.${type}`).then(() => true, () => false);
    try {
      await held.started;
      if (boundary === "cancel") {
        await api(page, "account.cancel");
      } else {
        if (boundary === "category") await api(page, "settings.tab", { tab: "notes" });
        if (boundary === "close") await close();
        backend.account = ready();
        if (boundary === "reload") {
          await page.reload();
          await page.waitForFunction(() => window.__NOTES_DEBUG__?.version === 1);
          await page.waitForSelector("#startup", { state: "detached" });
        }
        if (boundary === "category") await api(page, "settings.tab", { tab: "account" });
        else await open();
        await page.waitForSelector('[data-account-state="ready"]');
      }
      held.release(stale(outcome)); await pending; await idle(page);
      check(`${type}/${boundary}/${outcome}: late IPC cannot restore stale profile or error`,
        await root().getAttribute("data-account-state") === (boundary === "cancel" ? "signedOut" : "ready") &&
        !((await root().innerText()).includes("不应显示")) && await root().locator(".account-error").count() === 0 &&
        calls("cancel") === (boundary === "cancel" ? 1 : 0));
      if (boundary === "cancel") check(`${type}/${outcome}: cancelled authorization restores a usable login control`, await root().getByRole("button", { name: "登录", exact: true }).isEnabled());
      rows.push({ type, boundary, outcome, passed: true });
    } finally { held.restore(); }
  }
  // A stale read cannot overwrite a newer successful sign-out; a late sync ACK
  // cannot publish a success notice into a reopened signed-out page.
  for (const type of ["status", "syncNow"]) for (const outcome of ["success", "error"]) {
    await reset(ready());
    const held = holdResponse(backend, type);
    const pending = api(page, `account.${type}`).then(() => true, () => false);
    try {
      await held.started;
      if (type === "status") {
        await api(page, "account.signOut");
        await root().getByRole("button", { name: "确认退出", exact: true }).click();
        await page.waitForSelector('[data-account-state="signedOut"]');
      } else {
        await close(); backend.account = signedOutAccount(); await open();
      }
      held.release(stale(outcome)); await pending; await idle(page);
      check(`${type}/${outcome}: old result cannot overwrite sign-out or publish success`, await root().getAttribute("data-account-state") === "signedOut" && await root().locator(".account-error").count() === 0 && !(await root().innerText()).includes("同步请求已发送"));
      rows.push({ type, boundary: type === "status" ? "signOut" : "close", outcome, passed: true });
    } finally { held.restore(); }
  }
  // Recovery must update stale retry intent even before it reaches ready.
  await reset(); backend.configure({ fail: { "account-signIn": 1 } });
  try { await command("account.signIn"); } catch {}
  backend.account = { ...signedOutAccount(), state: "authorizing" };
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForSelector('[data-account-state="authorizing"]');
  const beforeRetry = calls("signIn");
  await root().getByRole("button", { name: "重试", exact: true }).click(); await idle(page);
  check("Recovered authorizing status makes an old login retry read status only", calls("signIn") === beforeRetry);

  await reset(ready());
  backend.account = { ...ready(), state: "error", error: { code: "state_mismatch", message: "Synthetic callback mismatch" } };
  await command("account.status");
  check("Callback state mismatch is authentication, not library ownership", (await root().innerText()).includes("重新登录") && !(await root().innerText()).includes("资料库归属不匹配") && await root().getByRole("switch", { name: "同步此设备" }).isDisabled());

  // Keyboard/focus uses real DOM controls and the existing Preferences trap.
  await reset();
  await root().getByRole("button", { name: "登录", exact: true }).click();
  await page.waitForSelector('[data-account-state="authorizing"]');
  await root().getByRole("button", { name: "取消登录", exact: true }).focus();
  backend.account = ready();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForSelector('[data-account-state="ready"]');
  check("Completed authorization restores focus when Cancel disappears", await root().getByRole("button", { name: "退出账户", exact: true }).evaluate(node => node === document.activeElement));
  await root().getByRole("button", { name: "退出账户", exact: true }).click();
  check("Exit confirmation initially focuses safe Cancel", await root().getByRole("button", { name: "取消", exact: true }).evaluate(node => node === document.activeElement));
  await page.keyboard.press("Escape");
  check("Escape returns confirmation focus to its trigger", await root().getByRole("button", { name: "退出账户", exact: true }).evaluate(node => node === document.activeElement));
  await root().getByRole("button", { name: "退出账户", exact: true }).click();
  await root().getByRole("button", { name: "确认退出", exact: true }).click();
  await page.waitForSelector('[data-account-state="signedOut"]');
  check("Confirmed exit restores keyboard focus to Login", await root().getByRole("button", { name: "登录", exact: true }).evaluate(node => node === document.activeElement));
  check("Safe account state has a polite atomic live region", await root().locator('.account-accessible-state[role="status"][aria-live="polite"][aria-atomic="true"]').count() === 1);
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Tab"); await page.keyboard.press("Shift+Tab");
  check("Account Tab trap wraps to the final visible control", await root().getByRole("button", { name: "创建账户", exact: true }).evaluate(node => node === document.activeElement));
  await saveJSON(resolve(output, "account-lifecycle-matrix.json"), { rows, scope: "Delayed JS IPC responses and actual DOM only; native callbacks/runtime not proven" });

  // All five interface sizes × three widths × both themes. Exercise both the
  // signed-out actions and a profile with long identifiers and device rows.
  const layout = [];
  for (const width of [320, 390, 1280]) for (const theme of ["light", "dark"]) for (const font of ["tiny", "small", "medium", "large", "huge"]) {
    await close(); await page.setViewportSize({ width, height: width === 320 ? 480 : 844 });
    await command("settings.update", { settings: { theme, interfaceFontSize: font } });
    for (const state of ["signedOut", "ready"]) {
      backend.account = state === "ready" ? ready() : signedOutAccount();
      await open(); await command("account.status");
      const geometry = await root().evaluate(node => {
        const scroll = node.closest(".preferences-panel"), header = node.closest(".preferences").querySelector(".preferences-header");
        const minimum = node.closest(".preferences-mobile") ? 44 : 28;
        return { width: scroll.clientWidth, scrollWidth: scroll.scrollWidth, overflowY: getComputedStyle(scroll).overflowY,
          headerBottom: header.getBoundingClientRect().bottom,
          overflow: [...node.querySelectorAll("*")].filter(n => n.getClientRects().length && !n.matches(".account-accessible-state") && (n.getBoundingClientRect().right > innerWidth + 1 || n.getBoundingClientRect().left < -1)).map(n => n.className),
          smallControls: [...node.querySelectorAll("button,input")].filter(n => n.getClientRects().length && (n.getBoundingClientRect().height < minimum || n.getBoundingClientRect().width < minimum)).length };
      });
      const last = state === "ready" ? root().getByRole("button", { name: /查看冲突/ }) : root().getByRole("button", { name: "创建账户", exact: true });
      await last.scrollIntoViewIfNeeded();
      const reachable = await last.evaluate(node => { const r = node.getBoundingClientRect(), s = node.closest(".preferences-panel").getBoundingClientRect(); return r.top >= s.top - 1 && r.bottom <= s.bottom + 1; });
      check(`${width}/${theme}/${font}/${state}: controls fit, scroll and remain reachable`, geometry.width >= geometry.scrollWidth && !geometry.overflow.length && !geometry.smallControls && geometry.overflowY === "auto" && geometry.headerBottom <= (width === 320 ? 480 : 844) && reachable);
      layout.push({ width, theme, font, state, geometry, reachable });
      if (font === "tiny" || font === "huge") {
        await root().evaluate(node => { node.closest(".preferences-panel").scrollTop = 0; });
        await page.screenshot({ path: resolve(output, `matrix-${width}-${theme}-${font}-${state}.png`) });
      }
      await close();
    }
    // Keep one page open for the next iteration's explicit close.
    await open();
  }
  await saveJSON(resolve(output, "account-font-matrix.json"), layout);
}
