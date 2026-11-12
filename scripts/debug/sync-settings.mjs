import { resolve } from "node:path";
import { writeFile } from "node:fs/promises";
import { api, idle, state, snapshot, saveJSON } from "./runtime.mjs";

// Real React/App handlers and HTML, explicit IPC fixture only. This runner does
// not prove Rust networking, crypto, causal resolution or Android lifecycle.
export async function runSyncSettings(runtime, { command, check, output }) {
  const { page, backend } = runtime;
  const close = () =>
    page.getByRole("button", { name: "关闭设置", exact: true }).click();
  const calls = (type) =>
    backend.calls.filter(
      (row) => row.command === "sync_command" && row.type === type,
    ).length;
  const sync = () => page.locator(".sync-settings");
  const before = JSON.stringify(backend.workspace);
  if (runtime.mobile) {
    await page.setViewportSize(runtime.viewport);
    await runtime.reset();
  }
  await command("settings.open");
  check(
    "Settings-only visit never requests sync state or creates identity",
    calls("status") === 0 && (await sync().count()) === 0 && !backend.sync,
  );
  backend.configure({ fail: { inventory: 100 } });
  await command("settings.tab", { tab: "sync" });
  check("Synchronization is accessible without storage inventory", (await sync().count()) === 1 && !backend.calls.some(row => row.command === "get_data_management"));
  backend.configure({ fail: { inventory: 0 } });
  check(
    "Default status query does not enable sync or generate identity",
    backend.sync.state === "disabled" &&
      !backend.sync.deviceId &&
      (await sync().getAttribute("data-sync-state")) === "disabled",
  );
  check("Synchronization has its own scrolling settings category", await sync().evaluate(node => !!node.closest(".preferences-sync")) && (await page.getByRole("dialog").count()) === 1);
  const descriptors = await page.evaluate(() => window.__NOTES_DEBUG__.list());
  const ids = [
    "status",
    "host.start",
    "invite",
    "pair",
    "now",
    "stop",
    "resume",
    "revoke",
    "conflicts",
    "resolve",
  ].map((x) => "sync." + x);
  check(
    "All ten semantic sync commands are available in the DEV allowlist",
    ids.every((id) =>
      descriptors.some((row) => row.id === id && row.available),
    ),
  );
  for (const [id, args] of [
    ["sync.host.start", { deviceName: "x", port: "bad" }],
    [
      "sync.resolve",
      {
        kind: "settings",
        entityId: "x",
        digest: "0".repeat(64),
        keepAll: false,
      },
    ],
    ["sync.now", { extra: true }],
  ]) {
    let code;
    try {
      await api(page, id, args);
    } catch (error) {
      code = error.code;
    }
    check(
      `Strict DEV contract rejects ${id} invalid input`,
      code === "INVALID_ARGUMENT",
    );
  }
  await page
    .getByRole("textbox", { name: "同步设备名称", exact: true })
    .fill("UI 合成 Mac");
  await command("sync.host.start", { deviceName: "UI 合成 Mac", port: 49632 });
  check(
    "Host command invokes the true component handler with an explicit fixture IPC boundary",
    calls("startHost") === 1 &&
      (await sync().getAttribute("data-sync-state")) === "listening",
  );
  const endpoint = page.getByRole("textbox", {
    name: "同步服务地址",
    exact: true,
  });
  await endpoint.fill("ws://192.168.1.2:49632");
  await endpoint.focus();
  await command("sync.status");
  check(
    "Status refresh retains the input value and focus",
    (await endpoint.inputValue()) === "ws://192.168.1.2:49632" &&
      (await endpoint.evaluate((node) => node === document.activeElement)),
  );
  const secret = "EXPLICIT-UI-FIXTURE-NOT-A-REAL-INVITATION";
  const inviteResult = await command("sync.invite", {
    endpoint: "ws://192.168.1.2:49632",
  });
  check(
    "Invitation appears only after explicit generation and never enters command output/live region/localStorage",
    (await page
      .getByRole("textbox", { name: "生成的配对串", exact: true })
      .inputValue()) === secret &&
      !JSON.stringify(inviteResult).includes(secret) &&
      !(await page
        .locator("[aria-live]")
        .allTextContents()
        .then((rows) => rows.join("").includes(secret))) &&
      !(await page.evaluate(
        (secret) => JSON.stringify(localStorage).includes(secret),
        secret,
      )),
  );
  check(
    "HTML debug snapshots never serialize generated invitation secrets",
    !JSON.stringify(
      await snapshot(page, { selector: ".sync-settings", maxChars: 24000 }),
    ).includes(secret),
  );
  await page.getByRole("button", { name: "复制配对串", exact: true }).click();
  await idle(page);
  check(
    "Copy uses actual clipboard boundary",
    (await page.locator(".sync-live").innerText()) ===
      "配对串已复制，请仅发送给要加入的设备",
  );
  await page.evaluate(() => {
    window.__sync86ClipboardWrite = navigator.clipboard.writeText;
    navigator.clipboard.writeText = async () => {
      throw Error("synthetic clipboard denied");
    };
  });
  await page.getByRole("button", { name: "复制配对串", exact: true }).click();
  await idle(page);
  check(
    "Clipboard failure remains actionable instead of claiming a copy",
    (await page.locator(".sync-error").innerText()).includes("复制失败"),
  );
  await page.evaluate(() => {
    navigator.clipboard.writeText = window.__sync86ClipboardWrite;
    delete window.__sync86ClipboardWrite;
  });
  await command("settings.tab", { tab: "settings" });
  check(
    "Switching tabs removes generated invitation and clears secret",
    (await page.locator('[aria-label="生成的配对串"]').count()) === 0,
  );
  let hidden;
  try {
    await api(page, "sync.now");
  } catch (error) {
    hidden = error.code;
  }
  check("Hidden panel rejects sync commands", hidden === "APP_ERROR");
  await command("settings.tab", { tab: "sync" });
  check(
    "Returning to data does not recreate invitation",
    (await page.locator('[aria-label="生成的配对串"]').count()) === 0,
  );
  // Hold a real IPC response and cross the panel lifetime boundary.
  const original = backend.call.bind(backend);
  let release, started;
  const began = new Promise((resolve) => {
    started = resolve;
  });
  let hold = true;
  backend.call = async (id, args) => {
    const result = await original(id, args);
    if (
      id === "sync_command" &&
      args.command?.type === "createInvite" &&
      hold
    ) {
      hold = false;
      started();
      await new Promise((resolve) => {
        release = resolve;
      });
    }
    return result;
  };
  const pending = api(page, "sync.invite", {
    endpoint: "ws://192.168.1.2:49632",
  });
  try {
    await began;
    await api(page,"settings.tab", { tab: "settings" });
    release();
    await pending;
    await idle(page);
    await command("settings.tab", { tab: "sync" });
    check(
      "A late invitation response cannot recreate secret after tab change",
      (await page.locator('[aria-label="生成的配对串"]').count()) === 0,
    );
  } finally {
    release?.();
    backend.call = original;
  }
  let closeRelease, closeStarted;
  const closeBegan = new Promise((resolve) => {
    closeStarted = resolve;
  });
  backend.call = async (id, args) => {
    const result = await original(id, args);
    if (id === "sync_command" && args.command?.type === "createInvite") {
      closeStarted();
      await new Promise((resolve) => {
        closeRelease = resolve;
      });
    }
    return result;
  };
  const closePending = api(page, "sync.invite", {
    endpoint: "ws://192.168.1.2:49632",
  });
  try {
    await closeBegan;
    await close();
    closeRelease();
    await closePending;
    await idle(page);
    await command("settings.open"); await command("settings.tab", { tab: "sync" });
    check(
      "A late invitation response after closing cannot publish into reopened settings",
      (await page.locator('[aria-label="生成的配对串"]').count()) === 0,
    );
  } finally {
    closeRelease?.();
    backend.call = original;
  }
  backend.configure({ fail: { "sync-syncNow": 1 } });
  let failed;
  try {
    await command("sync.now");
  } catch (error) {
    failed = error.code;
  }
  check(
    "Failed native operation stays explicit and never claims synchronization success",
    failed === "APP_ERROR" &&
      (await page.locator(".sync-error").innerText()).includes("未完成") &&
      !(await page.locator(".sync-live").innerText()).includes("同步完成"),
  );
  await command("sync.now");
  check(
    "Retry calls real handler and clears prior action error",
    (await page.locator(".sync-error").count()) === 0 && calls("syncNow") === 2,
  );
  backend.sync.pendingCount = 3;
  await command("sync.status");
  check(
    "Durable pending data is distinguished from applied success",
    (await page.locator(".sync-live").innerText()).includes("等待安全应用"),
  );
  backend.sync.pendingCount = 0;
  // Singleflight: two DOM clicks, only one delayed IPC mutation.
  backend.configure({ delay: { "sync-syncNow": 300 } });
  const syncBefore = calls("syncNow");
  await page
    .getByRole("button", { name: "立即同步", exact: true })
    .evaluate((node) => {
      node.click();
      node.click();
    });
  await idle(page);
  check(
    "Double clicking a synchronous handler generates only one IPC mutation",
    calls("syncNow") === syncBefore + 1,
  );
  backend.configure({ delay: { "sync-syncNow": 0 } });
  await command("sync.stop");
  check(
    "Stop renders resumable paused state",
    (await sync().getAttribute("data-sync-state")) === "paused" &&
      (await page
        .getByRole("button", { name: "继续同步", exact: true })
        .isEnabled()),
  );
  await command("sync.resume");
  backend.sync.peers = [
    {
      id: "peer-ui",
      name: "我的手机",
      connected: false,
      lastSyncAt: 1760000000000,
    },
  ];
  backend.sync.conflictCount = 1;
  const variants = [
    {
      digest: "1".repeat(64),
      title: "合成笔记",
      updatedAt: 1760000000000,
      deleted: false,
      purged: false,
      locked: false,
      attachmentCount: 2,
    },
    {
      digest: "2".repeat(64),
      title: "锁定版本",
      updatedAt: 1760000001000,
      deleted: true,
      purged: false,
      locked: true,
      attachmentCount: 0,
    },
  ];
  backend.syncConflicts = [{ kind: "note", entityId: "note-ui", variants }];
  await command("sync.status");
  await command("sync.revoke", { peerId: "peer-ui" });
  check(
    "Revoke requires visible local confirmation and does not call IPC yet",
    calls("revoke") === 0 &&
      (await page
        .getByRole("group", { name: "确认同步操作", exact: true })
        .count()) === 1,
  );
  await page.getByRole("button", { name: "取消", exact: true }).click();
  check(
    "Cancelling revoke preserves the peer",
    backend.sync.peers.length === 1 && calls("revoke") === 0,
  );
  await command("sync.revoke", { peerId: "peer-ui" });
  await page.getByRole("button", { name: "确认撤销", exact: true }).click();
  await idle(page);
  check(
    "Confirmed revoke uses the real action handler",
    calls("revoke") === 1 && backend.sync.peers.length === 0,
  );
  await command("sync.conflicts");
  check(
    "Conflict UI displays versions, locked/deleted metadata and attachment counts",
    (await page.locator(".sync-conflict").innerText()).includes("已锁定") &&
      (await page.locator(".sync-conflict").innerText()).includes("已删除") &&
      (await page.locator(".sync-conflict").innerText()).includes("2 个附件"),
  );
  const resolution = {
    kind: "note",
    entityId: "note-ui",
    digest: "1".repeat(64),
    keepAll: false,
  };
  await command("sync.resolve", resolution);
  check(
    "Keeping one branch is explicit and confirmed before IPC",
    calls("resolve") === 0 &&
      (await page.locator(".sync-confirmation").innerText()).includes(
        "只保留所选版本",
      ),
  );
  await page
    .getByRole("button", { name: "确认保留此版本", exact: true })
    .click();
  await idle(page);
  check(
    "Single-branch confirmation dispatches the production UI resolve handler",
    calls("resolve") === 1 &&
      (await page.locator(".sync-conflict").count()) === 0,
  );
  backend.syncConflicts = [{ kind: "note", entityId: "note-ui", variants }];
  backend.sync.conflictCount = 1;
  await command("sync.conflicts");
  await command("sync.resolve", { ...resolution, keepAll: true });
  await page.getByRole("button", { name: "确认全部另存", exact: true }).click();
  await idle(page);
  check(
    "Keep-all path uses its separate explicit confirmation",
    calls("resolve") === 2,
  );
  // Malformed native responses fail closed. Preserve actual native adapter and
  // make only the explicit fixture return invalid data for one response.
  const originalMalformed = backend.call.bind(backend);
  backend.call = async (id, args) => {
    const r = await originalMalformed(id, args);
    if (id === "sync_command")
      r.value = { ...r.value, status: { ...r.value.status, pendingCount: -1 } };
    return r;
  };
  let malformed;
  try {
    await api(page, "sync.status");
  } catch (error) {
    malformed = error.message;
  } finally {
    backend.call = originalMalformed;
  }
  check(
    "Strict IPC wrapper rejects malformed counts without presenting success",
    malformed?.includes("无效数据") &&
      (await page.locator(".sync-error").count()) === 1,
  );
  await command("sync.status");
  await command("settings.tab", { tab: "data" });
  await command("data.navigate", { view: "all" });
  check(
    "Category details do not display synchronization block",
    !(await sync().isVisible()),
  );
  await command("data.navigate", { view: "overview" });
  check(
    "Data and existing note documents remain unchanged by synchronization UI fixture",
    before === JSON.stringify(backend.workspace),
  );
  const metrics = [];
  for (const width of [320, 390, 1280])
    for (const theme of ["light", "dark"]) {
      await close();
      await page.setViewportSize({ width, height: width === 320 ? 360 : 844 });
      await command("settings.update", { settings: { theme } });
      await command("settings.open"); await command("settings.tab", { tab: "sync" });
      const geometry = await sync().evaluate((node) => {
        const container = node.closest(".preferences-sync");
        return {
          smallButtons: [...node.querySelectorAll("button")].filter(
            (x) =>
              x.getClientRects().length &&
              (x.getBoundingClientRect().width < 44 ||
                x.getBoundingClientRect().height < 44),
          ).length,
          scrollWidth: container.scrollWidth,
          clientWidth: container.clientWidth,
          overflowY: getComputedStyle(container).overflowY,
          overflows: [...node.querySelectorAll("*")]
            .filter(
              (x) =>
                x.getClientRects().length &&
                x.getBoundingClientRect().right > innerWidth + 1,
            )
            .map((x) => x.className),
        };
      });
      metrics.push({ width, theme, geometry });
      check(
        `${width}px ${theme} has no horizontal overflow and shares reachable vertical scroll`,
        geometry.smallButtons === 0 &&
          geometry.scrollWidth <= geometry.clientWidth &&
          !geometry.overflows.length &&
          geometry.overflowY === "auto",
      );
      await sync().scrollIntoViewIfNeeded();
      await page.screenshot({
        path: resolve(output, `sync86-${width}-${theme}.png`),
      });
      await writeFile(
        resolve(output, `sync86-${width}-${theme}.html`),
        await page.locator(".preferences").evaluate((node) => node.outerHTML),
      );
    }
  await saveJSON(resolve(output, "sync86-layout.json"), metrics);
  await saveJSON(
    resolve(output, "sync86-snapshot.json"),
    await snapshot(page, {
      selector: ".preferences",
      maxChars: 24000,
      maxNodes: 160,
    }),
  );
  await close();
  await command("settings.open"); await command("settings.tab", { tab: "sync" });
  check(
    "Closing/reopening never retains a visible pairing secret",
    (await page.locator('[aria-label="生成的配对串"]').count()) === 0,
  );
  // Fresh local state tests join password input and secret clearing.
  await runtime.reset();
  await command("settings.open"); await command("settings.tab", { tab: "sync" });
  await page.getByRole("button", { name: "加入同步", exact: true }).click();
  const pair = page.locator('[aria-label="粘贴完整配对串"]');
  await pair.fill(secret);
  check(
    "HTML debug snapshots never serialize pasted invitation secrets",
    !JSON.stringify(
      await snapshot(page, { selector: ".sync-settings", maxChars: 24000 }),
    ).includes(secret),
  );
  check(
    "Pairing input conceals the invitation",
    (await pair.getAttribute("type")) === "password",
  );
  await command("settings.tab", { tab: "settings" });
  await command("settings.tab", { tab: "sync" });
  check(
    "Switching tabs clears unsent pairing input",
    (await pair.count()) === 0,
  );
  await page.getByRole("button", { name: "加入同步", exact: true }).click();
  await pair.fill(secret);
  await page
    .getByRole("textbox", { name: "同步设备名称", exact: true })
    .fill("UI 合成手机");
  await page.getByRole("button", { name: "连接并加入", exact: true }).click();
  await idle(page);
  check(
    "Pair handler dispatches IPC once and clears invitation on success",
    calls("pair") === 1 &&
      (await pair.count()) === 0 &&
      backend.sync.deviceName === "UI 合成手机",
  );
  // Existing devices must be able to use a fresh invitation after a tunnel
  // hostname changes. IPC stays an explicit fixture here; real sockets are
  // separately covered by sync87-routes.
  const previousIdentity = {
    workspaceId: backend.sync.workspaceId,
    deviceId: backend.sync.deviceId,
  };
  const update = page.getByRole("button", { name: "更新连接", exact: true });
  check(
    "An enabled device exposes Update Connection",
    await update.isEnabled(),
  );
  await update.click();
  await pair.fill(secret);
  await page.getByRole("button", { name: "取消连接", exact: true }).click();
  check(
    "Cancelling an endpoint update removes the unsent secret",
    (await pair.count()) === 0,
  );
  await update.click();
  await pair.fill(secret);
  await command("settings.tab", { tab: "settings" });
  await command("settings.tab", { tab: "sync" });
  check(
    "Tab changes clear an existing-device endpoint update",
    (await pair.count()) === 0,
  );
  await update.click();
  await pair.fill(secret);
  await close();
  await command("settings.open"); await command("settings.tab", { tab: "sync" });
  check(
    "Closing settings clears an existing-device endpoint update",
    (await pair.count()) === 0,
  );
  await update.click();
  await pair.fill(secret);
  await command("sync.stop");
  check(
    "Stopping synchronization clears an open endpoint update",
    (await pair.count()) === 0,
  );
  check(
    "Paused devices explain Resume before Update Connection",
    (await update.isDisabled()) &&
      (await sync().innerText()).includes("请先继续同步，再更新连接"),
  );
  await command("sync.resume");
  await update.click();
  await pair.fill(secret);
  backend.configure({ fail: { "sync-pair": 1 } });
  await page.getByRole("button", { name: "连接并加入", exact: true }).click();
  await idle(page);
  check(
    "A failed endpoint update retains the form and local identity",
    (await pair.count()) === 1 &&
      (await page.locator(".sync-error").count()) === 1 &&
      backend.sync.workspaceId === previousIdentity.workspaceId &&
      backend.sync.deviceId === previousIdentity.deviceId,
  );
  const beforeUpdate = calls("pair");
  backend.configure({ delay: { "sync-pair": 300 } });
  await page
    .getByRole("button", { name: "连接并加入", exact: true })
    .evaluate((node) => {
      node.click();
      node.click();
    });
  await idle(page);
  backend.configure({ delay: { "sync-pair": 0 } });
  check(
    "Update Connection reuses singleflight pair and clears the secret on success",
    calls("pair") === beforeUpdate + 1 &&
      (await pair.count()) === 0 &&
      backend.sync.workspaceId === previousIdentity.workspaceId &&
      backend.sync.deviceId === previousIdentity.deviceId &&
      (await page.locator(".sync-error").count()) === 0,
  );
  const beforeBrowserIPC = calls("status");
  const unavailable = await page.evaluate(async () => {
    const old = window.isTauri;
    window.isTauri = false;
    try {
      const { syncCommand } = window.__DEBUG_SYNC_MODULE__ || await import("/src/sync-client.ts");
      await syncCommand({ type: "status" });
      return "";
    } catch (error) {
      return error.message;
    } finally {
      window.isTauri = old;
    }
  });
  check(
    "Ordinary browser clearly requires the installed app and never falls back to fixture synchronization",
    unavailable.includes("已安装") && calls("status") === beforeBrowserIPC,
  );
  const badResultCount = await page.evaluate(async () => {
    const { validateSyncResult } = window.__DEBUG_SYNC_MODULE__ || await import("/src/sync-client.ts");
    const base = {
      state: "disabled",
      deviceName: "",
      peers: [],
      pendingCount: 0,
      conflictCount: 0,
    };
    const candidates = [
      { status: { ...base, secret: "forbidden" } },
      {
        status: { ...base, peers: [{ id: "p", name: "n", connected: "yes" }] },
      },
      { status: { ...base, state: "completed" } },
      { status: { ...base, lastSyncAt: -2 } },
      {
        status: base,
        conflicts: [
          {
            kind: "note",
            entityId: "n",
            variants: [
              {
                digest: "bad",
                title: "x",
                deleted: false,
                purged: false,
                locked: false,
                attachmentCount: 0,
              },
            ],
          },
        ],
      },
    ];
    return candidates.filter((value) => {
      try {
        validateSyncResult(value);
        return false;
      } catch {
        return true;
      }
    }).length;
  });
  check(
    "Strict native response validation rejects unknown fields, invalid booleans/states/times and digests",
    badResultCount === 5,
  );
  await saveJSON(resolve(output, "sync86-boundaries.json"), {
    scope: runtime.metadata,
    real: "React App, strict TypeScript IPC wrapper, actual handlers, DOM/HTML, clipboard boundary invocation",
    fixture:
      "sync_command responses only; no Rust/socket/Noise/merge/Android native proof",
    source: "scripts/debug/sync-settings.mjs",
  });
}
