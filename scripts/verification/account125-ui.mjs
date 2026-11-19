// Actual React handlers against the explicit JS IPC fixture. This verifies UI
// presentation and confirmation only; it never claims real account transport.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { openRuntime, api } from "../debug/runtime.mjs";

const output = resolve(process.argv[2] || "/tmp/cyberbus125-ui");
await mkdir(output, { recursive: true });
const localId = "11111111-1111-4111-8111-111111111111";
const remoteId = "22222222-2222-4222-8222-222222222222";
const ready = () => ({
  state: "ready", enabled: true, credentialStorage: "encryptedFile",
  profile: { subject: "fixture-private-subject", displayName: "测试账户", username: "UI fixture" },
  devices: [
    { id: localId, name: "本机 Mac", current: true, online: true, connected: false, syncAvailable: true },
    { id: remoteId, name: "Android 测试设备", current: false, online: true, connected: false, syncAvailable: true, summary: { noteCount: 4, lastNoteUpdatedAt: 1795046400000, capturedAt: 1795046400000 } },
  ], pendingCount: 0, conflictCount: 0,
});
const results = [];
for (const mobile of [false, true]) {
  const runtime = await openRuntime({ "account-ui": true, mobile });
  const { page, backend } = runtime;
  const root = page.locator(".account-settings");
  const command = (name, args) => api(page, name, args);
  const refresh = () => command("account.status");
  try {
    backend.account = { state: "signedOut", enabled: false, credentialStorage: "encryptedFile", devices: [], pendingCount: 0, conflictCount: 0 };
    await command("settings.open");
    await command("settings.tab", { tab: "account" });
    await page.waitForSelector('[data-account-state="signedOut"]');
    if (!mobile) {
      assert.equal(await root.locator(".account-storage-group[open]").count(), 0);
      assert.equal(await root.getByRole("radio", { name: /本机加密文件/ }).isVisible(), false);
      await root.locator(".account-storage-summary").click();
      await root.getByRole("radio", { name: /系统钥匙串/ }).check();
      await root.getByRole("button", { name: "应用存储方式", exact: true }).click();
      assert.equal(await root.locator("dialog[open]").count(), 1);
      await root.getByRole("button", { name: "取消", exact: true }).click();
      assert.equal(backend.account.credentialStorage, "encryptedFile");
      await root.locator(".account-storage-summary").click();
    } else assert.equal(await root.locator(".account-storage-group").count(), 0);

    backend.account = ready();
    delete backend.account.profile.username;
    await refresh();
    assert(!(await root.innerText()).includes("fixture-private-subject"));
    const before = backend.calls.filter(call => call.type === "syncDevice").length;
    await root.getByRole("button", { name: "Android 测试设备", exact: true }).click();
    assert.equal(backend.calls.filter(call => call.type === "syncDevice").length, before);
    await root.getByRole("button", { name: "取消", exact: true }).click();

    backend.account.deviceOperation = { deviceId: remoteId, direction: "both", phase: "running", startedAt: Date.now(), progress: { stage: "connecting", completed: 0, total: 0, bytesTransferred: 0 } };
    await refresh();
    assert.equal(await root.locator(".account-sync-progress").count(), 1);
    await root.getByRole("button", { name: "Android 测试设备", exact: true }).click();
    assert.equal(await root.locator("dialog .account-sync-progress").count(), 1);
    assert.equal(await root.locator(".account-sync-progress").count(), 1);
    await root.getByRole("button", { name: "收起，后台继续", exact: true }).click();
    assert.equal(await root.locator(".account-sync-progress").count(), 1);
    assert.equal(backend.account.deviceOperation.phase, "running");

    backend.account.deviceOperation.phase = "failed";
    backend.account.deviceOperation.finishedAt = Date.now();
    backend.account.error = { code: "account_sync_failed", message: "Safe fixture timeout", syncStage: "transfer", syncReason: "timeout" };
    await refresh();
    assert.equal(await root.getByRole("alert").count(), 1);
    await root.getByRole("button", { name: "Android 测试设备", exact: true }).click();
    assert.equal(await root.getByRole("alert").count(), 1);
    assert.equal(await root.locator("dialog [role=alert]").count(), 1);
    const nativeCall = backend.call.bind(backend);
    backend.call = async (command, args) => command === "account_command" && args.command.type === "syncDevice"
      ? { ok: false, error: backend.account.error, events: [] } : nativeCall(command, args);
    await root.getByRole("button", { name: "开始同步", exact: true }).click();
    await page.waitForSelector("dialog .account-confirmation-error[role=alert]");
    assert.equal(await root.getByRole("alert").count(), 1, "command and native errors must not duplicate");
    backend.call = nativeCall;
    await root.getByRole("button", { name: "取消", exact: true }).click();
    assert.equal(await root.getByRole("alert").count(), 1);

    backend.account.error = { code: "account_sync_failed", message: "Safe legacy fixture failure" };
    await refresh();
    assert.equal(await root.getByRole("button", { name: "退出账户以重新登录", exact: true }).count(), 1);
    const exits = backend.calls.filter(call => call.type === "signOut").length;
    await root.getByRole("button", { name: "退出账户以重新登录", exact: true }).click();
    await root.getByRole("button", { name: "取消", exact: true }).click();
    assert.equal(backend.calls.filter(call => call.type === "signOut").length, exits);

    delete backend.account.deviceOperation;
    delete backend.account.error;
    await refresh();
    for (const width of mobile ? [320, 390] : [1280]) for (const theme of ["light", "dark"]) {
      await page.setViewportSize({ width, height: 844 });
      // Theme tokens only: this suite exercises account UI, not settings writes.
      await page.evaluate(theme => { document.documentElement.dataset.scheme = theme; }, theme);
      await root.locator(".account-device-heading h4").click();
      const overflow = await root.evaluate(el => el.scrollWidth > el.clientWidth);
      assert.equal(overflow, false, `${width}/${theme}: account panel overflows`);
      await page.screenshot({ path: resolve(output, `${mobile ? "mobile" : "desktop"}-${width}-${theme}.png`) });
    }
    assert.deepEqual(runtime.errors, []);
    results.push({ mobile, passed: true, scope: "React UI with JS IPC fixture" });
  } finally { await runtime.cleanup(); }
}
console.log(JSON.stringify({ results, output }));
