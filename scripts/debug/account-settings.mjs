import { resolve } from "node:path";
import { api, idle, saveJSON } from "./runtime.mjs";
import { runAccountMatrix } from "./account-matrix.mjs";

// Review checkpoint for existing account109 UI. Actual React handlers with an
// explicit JS IPC fixture; this does not authenticate or contact any service.
export async function runAccountSettings(runtime, { command, check, output }) {
  if (!runtime.accountUI) throw Error("Explicit --account-ui is required; native backend is not integrated");
  const { page, backend } = runtime;
  const calls = type => backend.calls.filter(row => row.command === "account_command" && row.type === type).length;
  const root = page.locator(".account-settings");
  const before = JSON.stringify(backend.workspace);
  await command("settings.open");
  if (runtime.mobile) {
    check("Account is the first test-only category", await page.locator(".preferences-navigation > button").first().getAttribute("data-preferences-page") === "account");
  }
  await command("settings.tab", { tab: "account" });
  await page.waitForSelector('[data-account-state="signedOut"]');
  check("Read-only status leaves the local library and identity untouched", before === JSON.stringify(backend.workspace) && calls("signIn") === 0);
  for (const type of ["signIn", "signUp"]) {
    await command(`account.${type}`);
    check(`${type} uses the actual handler and displays browser waiting`, calls(type) === 1 && await root.getByRole("heading", { name: "正在等待登录", exact: true }).isVisible());
    await root.getByRole("button", { name: "取消登录", exact: true }).click();
    await page.waitForSelector('[data-account-state="signedOut"]');
  }
  check("Both authorization attempts dispatch native cancel", calls("cancel") === 2);
  // P2: failed cancellation cannot unlock a still-pending authorization IPC.
  const originalCall = backend.call.bind(backend);
  let started, release;
  const began = new Promise(resolve => { started = resolve; });
  backend.call = async (id, args) => {
    const result = await originalCall(id, args);
    if (id === "account_command" && args.command.type === "signIn") {
      started(); await new Promise(resolve => { release = resolve; });
    }
    return result;
  };
  const pendingLogin = api(page, "account.signIn");
  try {
    await began;
    backend.configure({ fail: { "account-cancel": 1 } });
    let cancelFailed = false;
    try { await api(page, "account.cancel"); } catch { cancelFailed = true; }
    const signIns = calls("signIn");
    await api(page, "account.signIn");
    check("P2 failed cancel retains pending login mutex", cancelFailed && calls("signIn") === signIns && await root.getByRole("button", { name: "取消登录", exact: true }).isVisible());
  } finally {
    release?.(); await pendingLogin; backend.call = originalCall;
  }
  await command("account.cancel");
  // P2: even valid DTOs must prove signed-out before showing success notices.
  backend.call = async (id, args) => {
    if (id === "account_command" && ["cancel", "signOut"].includes(args.command.type)) {
      const value = args.command.type === "cancel"
        ? { state: "authorizing", enabled: false, devices: [], pendingCount: 0, conflictCount: 0 }
        : { state: "error", enabled: true, profile: { subject: "fixture-only-subject", displayName: "仍在登录" }, devices: [], pendingCount: 0, conflictCount: 0, error: { code: "sync_failed", message: "Fixture failed sign out" } };
      return { ok: true, value, events: [] };
    }
    return originalCall(id, args);
  };
  try {
    await command("account.signUp");
    try { await command("account.cancel"); } catch {}
    check("P2 authorizing cancel DTO does not claim cancellation", !(await root.locator(".account-notice").innerText()).includes("已取消") && (await root.locator(".account-error").innerText()).includes("尚未确认"));
    await command("account.status");
    // Switch fixture to an existing profile so sign-out enters its real confirmation.
    backend.account = { state: "ready", enabled: true, profile: { subject: "fixture-only-subject", displayName: "账户检查" }, devices: [], pendingCount: 0, conflictCount: 0 };
    await command("account.status");
    await command("account.signOut");
    await root.getByRole("button", { name: "确认退出", exact: true }).click();
    await page.waitForFunction(() => document.querySelector(".account-settings")?.textContent.includes("退出账户尚未完成"));
    check("P2 retained-profile error DTO does not claim sign out", !(await root.locator(".account-notice").innerText()).includes("已退出"));
    await root.getByRole("button", { name: "取消", exact: true }).click();
  } finally { backend.call = originalCall; }
  // P2: a background authoritative recovery clears a failed sign-in retry.
  await command("account.signOut");
  await root.getByRole("button", { name: "确认退出", exact: true }).click();
  await page.waitForSelector('[data-account-state="signedOut"]');
  backend.configure({ fail: { "account-signIn": 1 } });
  try { await command("account.signIn"); } catch {}
  check("P2 failed sign-in displays a retry", await root.getByRole("button", { name: "重试", exact: true }).isVisible());
  backend.account = { state: "ready", enabled: true, profile: { subject: "fixture-only-subject", displayName: "后台恢复" }, devices: [], pendingCount: 0, conflictCount: 0 };
  const beforeRecovery = calls("signIn");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForFunction(() => document.querySelector(".account-settings")?.getAttribute("data-account-state") === "ready" && !document.querySelector(".account-settings .account-error"));
  check("P2 background recovery removes stale login retry without another sign-in", calls("signIn") === beforeRecovery && await root.getByRole("button", { name: "重试", exact: true }).count() === 0);
  backend.account = {
    state: "ready", enabled: true, profile: { subject: "fixture-only-subject", displayName: "账户界面检查", username: "long-account-identifier-".repeat(5) },
    pendingCount: 3, conflictCount: 1,
    devices: [
      { id: "local", name: "此 Mac", current: true, online: true, connected: false },
      { id: "online", name: "手机", current: false, online: true, connected: true },
      { id: "offline", name: "离线设备", current: false, online: false, connected: false },
    ],
  };
  await command("account.status");
  check("Profile and real status facts render independently", (await root.innerText()).includes("3 项") && (await root.innerText()).includes("尚无成功同步记录") && (await root.innerText()).includes("离线") && (await root.innerText()).includes("同步连接已建立"));
  await command("account.syncNow");
  check("Sync ACK never invents a success timestamp", calls("syncNow") === 1 && (await root.innerText()).includes("尚无成功同步记录"));
  await command("account.setEnabled", { enabled: false });
  check("Pausing retains the profile", backend.account.state === "paused" && !!backend.account.profile);
  await command("account.setEnabled", { enabled: true });
  check("Enable requires explicit merge confirmation", backend.account.enabled === false && await root.getByRole("group", { name: "确认账户操作" }).isVisible());
  await root.getByRole("button", { name: "开启并合并", exact: true }).click();
  await page.waitForSelector('[data-account-state="connecting"]');
  // Native 92c6ffb9 contract: retained/quarantined grants require explicit
  // sign-out, including failures before any profile has been accepted.
  const connectedAccount = structuredClone(backend.account);
  for (const withProfile of [true, false]) {
    backend.account = { ...connectedAccount, state: "error", error: { code: "account_cleanup_required", message: "Safe native cleanup error" } };
    if (!withProfile) delete backend.account.profile;
    await command("account.status");
    check(`Native cleanup ${withProfile ? "with" : "without"} profile offers exit instead of login/reconnect`,
      await root.getByRole("button", { name: "退出账户", exact: true }).isVisible() &&
      await root.getByRole("button", { name: /^(登录|创建账户|重新登录|重试连接)$/ }).count() === 0 &&
      (await root.innerText()).includes("授权清理"));
    if (withProfile) check("Native cleanup seals UI transfer controls", await root.getByRole("switch").isDisabled() && await root.getByRole("button", { name: "立即同步", exact: true }).isDisabled());
    const exits = calls("signOut");
    await root.getByRole("button", { name: "退出账户", exact: true }).click();
    check("Native cleanup still requires explicit exit confirmation", calls("signOut") === exits && await root.getByRole("button", { name: "确认退出", exact: true }).isVisible());
    await page.keyboard.press("Escape");
  }
  backend.account = { ...connectedAccount, state: "paused", enabled: false };
  await command("account.status");
  check("Native first login paused status does not auto-enable transfer", !(await root.getByRole("switch").isChecked()) && await root.getByRole("button", { name: "立即同步", exact: true }).isDisabled());
  const enables = calls("setEnabled");
  await root.getByRole("switch").click();
  check("Native paused toggle waits for merge confirmation and authoritative DTO", calls("setEnabled") === enables && !(await root.getByRole("switch").isChecked()) && await root.getByRole("button", { name: "开启并合并", exact: true }).isVisible());
  await page.keyboard.press("Escape");
  backend.account = connectedAccount;
  await command("account.status");
  const exitsBefore = calls("signOut");
  await command("account.signOut");
  check("Sign out has no IPC before confirmation", calls("signOut") === exitsBefore);
  await page.keyboard.press("Escape");
  check("Escape dismisses confirmation before settings", await page.locator(".preferences").isVisible() && await root.getByRole("group", { name: "确认账户操作" }).count() === 0);
  backend.account = { ...backend.account, state: "error", error: { code: "ownership_mismatch", message: "Fixture ownership mismatch" } };
  await command("account.status");
  check("Ownership mismatch blocks transfer and explains preservation", (await root.innerText()).includes("资料库归属不匹配") && await root.getByRole("button", { name: "立即同步", exact: true }).isDisabled());
  delete backend.account.error;
  backend.account.state = "ready";
  await command("account.status");
  backend.configure({ fail: { "account-syncNow": 1 } });
  let rejected = false;
  try { await command("account.syncNow"); } catch { rejected = true; }
  check("IPC failure is safe and retryable", rejected && (await root.locator(".account-error").innerText()).includes("未完成"));
  await root.getByRole("button", { name: "重试", exact: true }).click();
  await page.waitForFunction(() => !document.querySelector(".account-settings .account-error"));
  // Preserve a screenshot and concrete geometry for each existing layout/theme.
  const metrics = [];
  for (const width of [320, 390, 1280]) for (const theme of ["light", "dark"]) {
    await page.getByRole("button", { name: "关闭设置", exact: true }).click();
    await page.setViewportSize({ width, height: width === 320 ? 480 : 844 });
    await command("settings.update", { settings: { theme, interfaceFontSize: "huge" } });
    await command("settings.open");
    await command("settings.tab", { tab: "account" });
    await page.waitForSelector('[data-account-state="ready"]');
    const geometry = await root.evaluate(node => {
      const scroll = node.closest(".preferences-panel");
      return { scrollWidth: scroll.scrollWidth, clientWidth: scroll.clientWidth, overflowY: getComputedStyle(scroll).overflowY,
        overflow: [...node.querySelectorAll("*")].filter(n => n.getClientRects().length && n.getBoundingClientRect().right > innerWidth + 1).map(n => n.className),
        smallControls: [...node.querySelectorAll("button,input")].filter(n => n.getClientRects().length && n.getBoundingClientRect().height < (node.closest(".preferences-mobile") ? 44 : 28)).length };
    });
    metrics.push({ width, theme, font: "huge", geometry });
    await saveJSON(resolve(output, "account-layout.json"), metrics);
    check(`${width}px ${theme} existing account UI fits and scrolls`, geometry.scrollWidth <= geometry.clientWidth && geometry.overflowY === "auto" && !geometry.overflow.length && !geometry.smallControls);
    await page.screenshot({ path: resolve(output, `account-${width}-${theme}.png`) });
  }
  await root.getByRole("button", { name: /查看冲突/ }).click();
  await idle(page);
  check("Conflict entry opens existing sync page", await page.locator(".sync-settings").isVisible() && backend.calls.some(row => row.command === "sync_command" && row.type === "conflicts"));
  await command("settings.tab", { tab: "account" });
  await command("account.signOut");
  await root.getByRole("button", { name: "确认退出", exact: true }).click();
  await page.waitForSelector('[data-account-state="signedOut"]');
  check("Confirmed sign out retains local notes", calls("signOut") === exitsBefore + 1 && JSON.stringify(JSON.parse(before).notes) === JSON.stringify(backend.workspace.notes));
  const browser = await page.evaluate(async () => {
    const saved = window.isTauri; window.isTauri = false;
    try { const { accountCommand } = await import("/src/account-client.ts"); await accountCommand({ type: "status" }); return ""; }
    catch (error) { return error.message; }
    finally { window.isTauri = saved; }
  });
  check("Ordinary browser has no fake account fallback", browser.includes("已安装"));
  await runAccountMatrix(runtime, { command, check, output });
  await saveJSON(resolve(output, "account-boundary.json"), { real: "React App, account-command wrapper, actual UI handlers and DOM", fixture: "JS account_command status and ACK only; no Logto/CyberBus/native-runtime/device proof", scope: runtime.metadata, incomplete: "Native callback validation, native lifetime/authentication and actual two-desktop automatic sync remain unverified; UI delayed-IPC and all-font matrices use explicit fixtures." });
}
