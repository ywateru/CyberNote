import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";

if (!process.env.PLAYWRIGHT_CORE_PATH || !process.env.CHROME_PATH) throw Error("Set PLAYWRIGHT_CORE_PATH and CHROME_PATH to existing local installations.");
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_CORE_PATH));
const server = await createServer({
  configFile: false,
  plugins: [react(), {
    name: "agent-settings-development-fixture",
    configureServer(vite) {
      vite.middlewares.use(async (req, res, next) => {
        if (req.url?.split("?")[0] !== "/__agent-settings.html") return next();
        try {
          const html = await vite.transformIndexHtml(req.url, '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>Agent settings component fixture</title><button id="fixture-trigger" style="position:fixed;left:-10000px">设置入口</button><div id="root"></div><script type="module" src="/scripts/check-agent-settings-fixture.mjs"></script></html>');
          res.setHeader("Content-Type", "text/html"); res.end(html);
        } catch (error) { next(error); }
      });
    },
  }],
  server: { host: "127.0.0.1", port: 0, strictPort: false, watch: { ignored: ["**/src-tauri/**", "**/artifacts/**"] } },
});
await server.listen();
let browser;
const checks = [];
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true });
  const context = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"], viewport: { width: 980, height: 760 } });
  const page = await context.newPage(), errors = [];
  page.on("pageerror", error => errors.push(String(error)));
  const url = `http://127.0.0.1:${server.httpServer.address().port}/__agent-settings.html`;
  await page.goto(url);
  const mount = async options => {
    await page.evaluate(options => window.agentFixture.mount(options), options ?? {});
    if (options?.hold === "settings") await page.getByText("正在加载 Agent 接入设置…", { exact: true }).waitFor();
    else await page.getByRole("switch").waitFor();
  };
  const waitFor = async fn => page.waitForFunction(fn);
  const calls = operation => page.evaluate(operation => window.agentFixture.calls.filter(call => call.operation === operation), operation);
  const chooseCreateOnly = async () => {
    await page.getByLabel("客户端名称", { exact: true }).fill("Codex 开发客户端");
    await page.getByRole("checkbox", { name: "新建 notes:create" }).check();
    await page.getByRole("checkbox", { name: "默认目录" }).check();
  };
  await mount({ hold: "settings" });
  assert.match(await page.getByRole("status").first().innerText(), /正在加载/);
  assert.equal(await page.getByRole("switch").count(), 0);
  await page.evaluate(() => window.agentFixture.release());
  await page.getByRole("switch").waitFor();
  assert.equal(await page.getByRole("switch").getAttribute("aria-checked"), "false");
  assert(await page.getByRole("button", { name: "创建授权", exact: true }).isDisabled());
  assert.match(await page.locator(".agent-settings").innerText(), /尚无 Agent 调用记录/);
  checks.push("loading is distinct from empty; default off; no implicit enable/create");

  await page.evaluate(() => { window.agentFixture.failNext = "enabled"; });
  await page.getByRole("switch").click();
  await page.getByRole("alert").waitFor();
  assert.equal(await page.getByRole("switch").getAttribute("aria-checked"), "false");
  assert(!(await page.locator("body").innerText()).includes("fixture-secret"));
  await page.getByRole("switch").click();
  await waitFor(() => document.querySelector('[role="switch"]')?.getAttribute("aria-checked") === "true");
  await page.getByRole("button", { name: "创建授权", exact: true }).click();
  assert.equal(await page.getByRole("dialog").count(), 1);
  assert(await page.getByLabel("客户端名称", { exact: true }).evaluate(e => e === document.activeElement));
  assert.equal(await page.getByRole("dialog").locator('input:checked').count(), 0);
  assert.equal(await page.getByRole("checkbox").count(), 6); // 3 scopes + default/normal/quick, never smart/trash
  await page.getByRole("button", { name: "确认创建", exact: true }).click();
  assert.match(await page.getByRole("dialog").getByRole("alert").innerText(), /主动选择/);
  assert.equal((await calls("create")).length, 0);
  await page.getByRole("button", { name: "关闭创建授权" }).focus();
  await page.keyboard.press("Shift+Tab");
  assert(await page.getByRole("button", { name: "确认创建", exact: true }).evaluate(e => e === document.activeElement));
  await page.keyboard.press("Tab");
  assert(await page.getByRole("button", { name: "关闭创建授权" }).evaluate(e => e === document.activeElement));
  await page.keyboard.press("Escape");
  await waitFor(() => !document.querySelector('[role="dialog"]'));
  assert(await page.getByRole("button", { name: "创建授权", exact: true }).evaluate(e => e === document.activeElement));
  assert.equal((await calls("create")).length, 0);
  await page.getByRole("button", { name: "创建授权", exact: true }).click();
  await chooseCreateOnly();
  await page.getByRole("button", { name: "取消", exact: true }).click();
  assert.equal((await calls("create")).length, 0);
  checks.push("enable failure keeps confirmed off; explicit folders/scopes; dialog focus/Tab/Escape/cancel create no grant");

  await page.getByRole("button", { name: "创建授权", exact: true }).click();
  await chooseCreateOnly();
  await page.evaluate(() => { window.agentFixture.failNext = "create"; });
  await page.getByRole("button", { name: "确认创建", exact: true }).click();
  await page.getByRole("dialog").getByRole("alert").waitFor();
  assert.equal(await page.getByLabel("客户端名称", { exact: true }).inputValue(), "Codex 开发客户端");
  await page.evaluate(() => { window.agentFixture.hold = "create"; });
  await page.getByRole("button", { name: "确认创建", exact: true }).click();
  await waitFor(() => !!window.agentFixture.pending);
  assert(await page.getByRole("button", { name: "确认创建", exact: true }).isDisabled());
  assert(await page.getByRole("button", { name: "取消", exact: true }).isDisabled());
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("dialog").count(), 1);
  assert.equal((await calls("create")).length, 2);
  await page.evaluate(() => window.agentFixture.release());
  await waitFor(() => !document.querySelector('[role="dialog"]'));
  assert(await page.getByRole("button", { name: "创建授权", exact: true }).evaluate(e => e === document.activeElement));
  const input = (await calls("create"))[1].args;
  assert.deepEqual(input.scopes, ["notes:create"]);
  assert.deepEqual(input.folderIds, ["default"]);
  assert.equal(await page.locator("pre").count(), 0);
  const binary = page.getByLabel("适配器可执行文件绝对路径", { exact: true });
  await binary.fill("cybernote-mcp");
  assert(await page.getByRole("button", { name: "复制 stdio JSON" }).isDisabled());
  await binary.fill('/private/Test Folder/适配器"\\.bin');
  const config = JSON.parse(await page.getByLabel("stdio JSON 配置").innerText());
  assert.equal(config.command, '/private/Test Folder/适配器"\\.bin');
  assert.deepEqual(config.args, ["--workspace-id", "fixture-workspace", "--credential-ref", "fixture-reference", "--runtime-dir", "/private/fixture-runtime"]);
  await page.getByRole("button", { name: "复制 stdio JSON" }).click();
  assert.deepEqual(JSON.parse(await page.evaluate(() => navigator.clipboard.readText())), config);
  await page.getByRole("button", { name: "复制 TOML" }).click();
  assert.match(await page.evaluate(() => navigator.clipboard.readText()), /^\[mcp_servers.cybernote\]/);
  assert(!(await page.locator("body").innerText()).includes("rawcredential"));
  checks.push("create-only grant; creation failure retained input; busy prevents duplicate/cancel; explicit path and secret-free escaped config copies");

  await page.evaluate(() => { window.agentFixture.hold = "revoke"; });
  await page.getByRole("button", { name: "撤销 Codex 开发客户端", exact: true }).click();
  await waitFor(() => !!window.agentFixture.pending);
  assert(await page.getByRole("switch").isDisabled());
  await page.evaluate(() => window.agentFixture.release());
  await waitFor(() => document.querySelector(".agent-badge")?.textContent === "已撤销");
  assert.equal(await page.locator(".agent-config").count(), 0);
  checks.push("revoke acknowledged by host DTO removes config and disables revoked grant actions");

  for (const [label, scope] of [["读取 notes:read", "notes:read"], ["修改 notes:update", "notes:update"]]) {
    await mount({ settings: { enabled: true } });
    await page.getByRole("button", { name: "创建授权", exact: true }).click();
    await page.getByLabel("客户端名称", { exact: true }).fill(scope);
    await page.getByRole("checkbox", { name: label }).check();
    await page.getByRole("checkbox", { name: "快速备忘录" }).check();
    await page.getByRole("button", { name: "确认创建", exact: true }).click();
    await waitFor(() => !document.querySelector('[role="dialog"]'));
    assert.deepEqual((await calls("create"))[0].args.scopes, [scope]);
    assert.deepEqual((await calls("create"))[0].args.folderIds, ["quick"]);
  }
  checks.push("read-only and update-only creation also remain independent; quick physical folder selection is explicit");

  const long = "授权客户端非常长的名称".repeat(40);
  const sample = { grantId: "existing", clientId: long, workspaceId: "fixture-workspace", incarnation: "fixture-incarnation", scopes: ["notes:read", "notes:update"], folderIds: ["physical", "missing"], expiresAt: Date.now() + 86_400_000, revocation: 0, revoked: false, credentialRef: "existing-reference" };
  for (const dark of [false, true]) {
    await page.setViewportSize({ width: 360, height: 440 });
    await page.evaluate(dark => document.documentElement.classList.toggle("dark", dark), dark);
    await mount({ settings: { enabled: true, grants: [sample, { ...sample, grantId: "expired", clientId: "已过期客户端", expiresAt: 1 }], recentOperations: [{ clientId: "Codex", tool: "notes_create", noteId: "note-fixture", at: Date.now(), outcome: "committed" }] } });
    assert.match(await page.locator(".agent-settings").innerText(), /已过期/);
    assert.match(await page.locator(".agent-operations").innerText(), /notes_create · committed/);
    assert(await page.locator(".agent-settings").evaluate(e => e.scrollHeight > e.clientHeight && e.scrollWidth <= e.clientWidth + 1));
    await page.getByRole("button", { name: "创建授权", exact: true }).click();
    assert(await page.getByRole("dialog").evaluate(e => e.scrollWidth <= e.clientWidth + 1 && e.getBoundingClientRect().bottom <= innerHeight));
    await page.getByRole("button", { name: "取消", exact: true }).scrollIntoViewIfNeeded();
    await page.getByRole("button", { name: "取消", exact: true }).click();
  }
  checks.push("long names/folder IDs, expired grants and operation metadata; light/dark narrow-short actual DOM scrolling");

  await page.evaluate(() => window.agentFixture.mount({ failNext: "settings" }));
  await page.getByRole("alert").waitFor();
  assert.equal(await page.getByRole("switch").count(), 0);
  await page.evaluate(() => { window.agentFixture.failNext = null; });
  await page.getByRole("button", { name: "重新加载", exact: true }).click();
  await page.getByRole("switch").waitFor();
  await page.getByRole("button", { name: "返回设置", exact: true }).click();
  await waitFor(() => document.activeElement?.id === "fixture-trigger");
  await page.evaluate(() => window.agentFixture.mount({ realClient: true }));
  await page.getByRole("alert").waitFor();
  assert.match(await page.getByRole("alert").innerText(), /桌面原生宿主/);
  await page.evaluate(() => window.agentFixture.mount({ mobile: true }));
  await page.getByRole("heading", { name: "Agent 接入" }).waitFor();
  assert.equal(await page.getByRole("switch").count(), 0);
  assert.equal((await calls("settings")).length, 0);
  checks.push("load retry, parent close focus restoration, real client unavailable error, mobile no host call/switch");

  const nativePage = await context.newPage();
  await nativePage.addInitScript(() => {
    window.isTauri = true;
    window.transportCalls = [];
    window.__TAURI_INTERNALS__ = { invoke: async (command, args) => {
      window.transportCalls.push({ command, args });
      if (window.transportWait) await new Promise(resolve => { window.transportRelease = resolve; });
      return window.transportResult;
    } };
  });
  await nativePage.goto(url);
  await nativePage.getByRole("switch").waitFor();
  const transport = await nativePage.evaluate(async () => {
    const c = await import("/src/agent-client.ts"), { accessGate } = await import("/src/bridge.ts");
    const settings = structuredClone(window.agentFixture.state);
    accessGate.invalidate({ sessionId: "access-fixture", epoch: 3, notes: {}, suspended: [], operationId: null });
    window.transportResult = settings;
    await c.agentClient.settings(); await c.agentClient.setEnabled(true); await c.agentClient.revokeGrant("grant-fixture");
    const input = { clientId: "create-only", scopes: ["notes:create"], folderIds: ["default"], expiresAt: Date.now() + 100_000 };
    const grant = { ...input, grantId: "grant-fixture", workspaceId: settings.workspaceId, incarnation: settings.incarnation, revocation: 0, revoked: false, credentialRef: "reference-fixture" };
    window.transportResult = { grant, connection: { workspaceId: grant.workspaceId, credentialRef: grant.credentialRef, runtimeDir: "/private/fixture" } };
    await c.agentClient.createGrant(input);
    let rejected = 0;
    const reject = fn => { try { fn(); } catch { rejected++; } };
    reject(() => c.parseAgentSettings({ ...settings, rawcredential: "never-render" }));
    reject(() => c.parseAgentSettings({ ...settings, enabled: "true" }));
    reject(() => c.parseAgentSettings({ ...settings, grants: [{ ...grant, scopes: ["notes:delete"] }] }));
    reject(() => c.parseAgentSettings({ ...settings, grants: [{ ...grant, workspaceId: "wrong" }] }));
    reject(() => c.parseAgentSettings({ ...settings, recentOperations: [{ clientId: "a", tool: "x", noteId: null, at: NaN, outcome: "x" }] }));
    reject(() => c.parseCreateAgentGrant({ ...input, folderIds: [] }));
    reject(() => c.parseCreateAgentGrant({ ...input, scopes: ["notes:read", "notes:read"] }));
    reject(() => c.parseCreateAgentGrant({ ...input, expiresAt: 1 }));
    reject(() => c.parseCreatedAgentGrant({ grant, connection: { workspaceId: grant.workspaceId, credentialRef: "wrong", runtimeDir: "/fixture" } }));
    reject(() => c.parseCreatedAgentGrant({ grant: { ...grant, scopes: ["notes:read", "notes:create"] }, connection: { workspaceId: grant.workspaceId, credentialRef: grant.credentialRef, runtimeDir: "/fixture" } }, input));
    window.transportResult = settings; window.transportWait = true;
    const stale = c.agentClient.settings();
    await Promise.resolve();
    accessGate.invalidate(); window.transportRelease();
    let staleCode;
    try { await stale; } catch (cause) { staleCode = cause.code; }
    return { calls: window.transportCalls, rejected, staleCode };
  });
  assert.equal(transport.rejected, 10);
  assert.equal(transport.staleCode, "access");
  assert.deepEqual(transport.calls.slice(0, 4).map(c => c.command), ["agent_settings", "agent_set_enabled", "agent_revoke_grant", "agent_create_grant"]);
  for (const call of transport.calls) assert.deepEqual(call.args.expected, { sessionId: "access-fixture", epoch: 3 });
  assert.deepEqual(transport.calls[1].args.enabled, true);
  assert.equal(transport.calls[2].args.grantId, "grant-fixture");
  assert.deepEqual(transport.calls[3].args.input.scopes, ["notes:create"]);
  checks.push("actual client command names/arguments and expected on all calls; strict DTO/input rejection and stale access response rejection (synthetic Tauri transport)");
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ stage: "develop component checks only; synthetic transport, no persistence or independent verify", checks }, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
