import { resolve } from "node:path";
import {
  api,
  idle,
  state,
  snapshot,
  saveJSON,
  openRuntime,
} from "./runtime.mjs";

export async function runPreferences(runtime, { command, check, output }) {
  const { page, backend } = runtime;
  const close = () =>
    page.getByRole("button", { name: "关闭设置", exact: true }).click();
  const tab = (name) => page.getByRole("tab", { name, exact: true });
  const selected = async (value) =>
    (await state(page)).preferences?.tab === value;
  const inventories = () =>
    backend.calls.filter((row) => row.command === "get_data_management").length;
  const notesBefore = JSON.stringify(
    backend.workspace.notes.map((note) => note.document),
  );
  if (runtime.mobile) {
    await command("note.select", { id: "note-a" });
    await command("app.back");
    await page.locator(".mobile-home-settings").click();
  } else {
    check(
      "Footer replaces only its more control with the actual settings gear",
      (await page
        .locator('.folder-footer [aria-label="设置"] svg.lucide-settings')
        .count()) === 1 &&
        (await page
          .locator('.folder-footer [aria-label="更多设置"]')
          .count()) === 0,
    );
    await page.locator('.folder-footer [aria-label="设置"]').click();
  }
  await idle(page);
  check(
    "Actual platform settings entry opens one shared dialog on settings tab",
    (await selected("settings")) &&
      (await page.getByRole("dialog").count()) === 1 &&
      (await page.locator(".preferences-backdrop").count()) === 1,
  );
  check(
    "Settings-only visit does not mount or sample local data",
    inventories() === 0 &&
      (await page.locator(".data-management").count()) === 0,
  );
  check(
    "Two icon tabs expose selected controls and labelled panels",
    (await page.getByRole("tablist", { name: "设置与数据" }).count()) === 1 &&
      (await tab("设置").getAttribute("aria-selected")) === "true" &&
      (await tab("数据").locator("svg").count()) === 1,
  );
  for (const [label, value] of [
    ["外观", "dark"],
    ["排序方式", "created"],
    [runtime.mobile ? "桌面显示方式" : "显示方式", "gallery"],
  ]) {
    await page
      .getByRole("combobox", { name: label, exact: true })
      .selectOption(value);
    await idle(page);
  }
  await page
    .getByRole("checkbox", {
      name: runtime.mobile ? "桌面按日期分组" : "按日期分组",
    })
    .uncheck();
  await idle(page);
  check(
    "Actual settings controls persist existing fields through the real settings handler",
    backend.workspace.settings.theme === "dark" &&
      backend.workspace.settings.sort === "created" &&
      backend.workspace.settings.view === "gallery" &&
      backend.workspace.settings.groupDates === false,
  );
  await close();
  await page.reload();
  await page.waitForFunction(() => window.__NOTES_DEBUG__?.version === 1);
  await idle(page);
  await command("settings.open");
  check(
    "Settings survive a renderer reload using the persistence fixture",
    (await page
      .getByRole("combobox", { name: "外观", exact: true })
      .inputValue()) === "dark" &&
      (await page
        .getByRole("combobox", { name: "排序方式", exact: true })
        .inputValue()) === "created" &&
      !(await page
        .getByRole("checkbox", {
          name: runtime.mobile ? "桌面按日期分组" : "按日期分组",
        })
        .isChecked()),
  );
  await page
    .getByRole("combobox", {
      name: runtime.mobile ? "桌面显示方式" : "显示方式",
      exact: true,
    })
    .selectOption("list");
  await idle(page);
  await page
    .getByRole("button", { name: "关闭所有已锁定的备忘录", exact: true })
    .click();
  await idle(page);
  check(
    "Close locked notes uses the existing action",
    backend.calls.some(
      (row) => row.command === "workspace_action" && row.type === "closeLocks",
    ),
  );
  backend.dataExtras = Array.from({ length: 48 }, (_, i) => ({
    relativePath: `other/entry-${i}-` + "很长的本地文件名".repeat(10),
    category: "other",
    size: i,
    modifiedAt: 1760000000000,
    exists: true,
    status: "file",
  }));
  await tab("设置").focus();
  await page.keyboard.press("ArrowRight");
  await idle(page);
  await page.waitForSelector(".storage-summary");
  check(
    "Arrow Right selects and focuses data, sampling only on first visit",
    (await selected("data")) &&
      (await tab("数据").evaluate((node) => node === document.activeElement)) &&
      // Development StrictMode replays the initial effect. Later tab switches
      // must preserve this count, independent of that development detail.
      inventories() > 0,
  );
  await page.evaluate(() => {
    window.__preferences82Shell = document.querySelector(".preferences");
    window.__preferences82Data = document.querySelector(".data-management");
  });
  await command("data.navigate", { view: "all" });
  await command("data.filter", { query: "entry", page: 1 });
  await page.locator(".data-management-scroll").evaluate((node) => {
    node.scrollTop = 90;
    window.__preferences82Scroll = node.scrollTop;
  });
  const beforeSwitch = inventories();
  await tab("设置").click();
  await idle(page);
  check(
    "Hidden data panel is inert without remounting its snapshot or shell",
    (await page.locator("#preferences-panel-data").getAttribute("hidden")) !==
      null &&
      (await page.locator("#preferences-panel-data").getAttribute("inert")) !==
        null &&
      (await page.evaluate(
        () =>
          window.__preferences82Data ===
            document.querySelector(".data-management") &&
          window.__preferences82Shell ===
            document.querySelector(".preferences"),
      )),
  );
  for (const [id, args] of [
    ["data.refresh", {}],
    ["data.navigate", { view: "image" }],
    ["data.filter", { query: "wrong" }],
    ["data.exportAttachment", { id: "unknown" }],
  ]) {
    let code;
    try {
      await api(page, id, args);
    } catch (error) {
      code = error.code;
    }
    check(
      `Hidden ${id} rejects starting a new operation`,
      code === "APP_ERROR",
    );
  }
  await tab("设置").focus();
  await page.keyboard.press("End");
  await idle(page);
  check(
    "End returns to data with snapshot, category, query, page and scroll retained",
    (await selected("data")) &&
      inventories() === beforeSwitch &&
      (await page
        .locator(".data-management")
        .getAttribute("data-storage-view")) === "all" &&
      (await page
        .getByRole("textbox", { name: "搜索本地文件" })
        .inputValue()) === "entry" &&
      (await page.locator(".data-pagination").innerText()).includes(
        "第 2 / 3 页",
      ) &&
      (await page
        .locator(".data-management-scroll")
        .evaluate((node) => node.scrollTop === window.__preferences82Scroll)),
  );
  await page.keyboard.press("Home");
  await idle(page);
  check(
    "Home selects and focuses settings",
    (await selected("settings")) &&
      (await tab("设置").evaluate((node) => node === document.activeElement)),
  );
  await page.keyboard.press("ArrowLeft");
  await idle(page);
  check(
    "Arrow Left wraps to data",
    (await selected("data")) &&
      (await tab("数据").evaluate((node) => node === document.activeElement)),
  );
  await command("data.navigate", { view: "overview" });
  await page
    .getByRole("button", { name: "导出完整备份…", exact: true })
    .scrollIntoViewIfNeeded();
  const configure = (value) =>
    page.evaluate((value) => window.__DEBUG_PLATFORM__.configure(value), value);
  await configure({ dialog: { save: [null] } });
  await page
    .getByRole("button", { name: "导出完整备份…", exact: true })
    .click();
  await idle(page);
  check(
    "Backup cancellation stays in the shared shell without claiming success",
    (await page.locator(".preferences").count()) === 1 &&
      !(await page.locator(".data-management").innerText()).includes(
        "完整备份已导出",
      ),
  );
  backend.configure({ fail: { archive: 1 } });
  await page
    .getByRole("button", { name: "导出完整备份…", exact: true })
    .click();
  await idle(page).catch(() => {});
  check(
    "Backup errors remain explicit and keep the current data",
    (await page.locator(".data-error").innerText()).includes(
      "Controlled archive",
    ) && (await page.locator(".storage-summary").count()) === 1,
  );
  await command("app.dismissError");
  const archiveCall = backend.call.bind(backend);
  let releaseArchive, archiveStarted;
  const archiveBegan = new Promise((resolve) => {
    archiveStarted = resolve;
  });
  backend.call = async (id, args) => {
    if (id === "export_archive") {
      archiveStarted();
      await new Promise((resolve) => {
        releaseArchive = resolve;
      });
    }
    return archiveCall(id, args);
  };
  try {
    await page
      .getByRole("button", { name: "导出完整备份…", exact: true })
      .click();
    await archiveBegan;
    await tab("设置").click();
    check(
      "In-flight backup keeps the shared shell interactive on settings",
      (await selected("settings")) &&
        (await tab("设置").evaluate((node) => node === document.activeElement)),
    );
    releaseArchive();
    await idle(page);
    check(
      "Completing a hidden backup does not steal settings focus",
      await tab("设置").evaluate((node) => node === document.activeElement),
    );
  } finally {
    releaseArchive?.();
    backend.call = archiveCall;
  }
  await tab("数据").click();
  await idle(page);
  check(
    "Completed backup notice survives switching tabs",
    (await page.locator(".data-notice").innerText()).includes("完整备份已导出"),
  );
  await page.getByRole("button", { name: "导入备份…", exact: true }).click();
  await idle(page);
  check(
    "Backup import and settings hydrate preserve the selected tab and shared shell",
    (await selected("data")) &&
      (await page.evaluate(
        () =>
          window.__preferences82Shell ===
          document.querySelector(".preferences"),
      )) &&
      (await page.locator(".data-notice").innerText()).includes(
        "本地备份已导入",
      ),
  );
  // Hold a real inventory response, hide its panel, then cross an authority boundary.
  const originalCall = backend.call.bind(backend);
  let release, started;
  const began = new Promise((resolve) => {
    started = resolve;
  });
  let hold = true;
  backend.call = async (id, args) => {
    const result = await originalCall(id, args);
    if (id === "get_data_management" && hold) {
      hold = false;
      result.value.rootPath = "/synthetic/stale-hidden82";
      started();
      await new Promise((resolve) => {
        release = resolve;
      });
    }
    return result;
  };
  const pending = api(page, "data.refresh").then(
    () => ({ ok: true }),
    (error) => ({ code: error.code }),
  );
  try {
    await began;
    await tab("设置").click();
    backend.suspended = ["note-a"];
    backend.operationId = "preferences82-prepare";
    await page.evaluate(
      (value) => window.__DEBUG_PLATFORM__.emit("notes-access", value),
      {
        phase: "prepare",
        operationId: backend.operationId,
        noteIds: ["note-a"],
        access: backend.state().access,
      },
    );
    await page.waitForFunction(
      () =>
        document.querySelector(".preferences[data-preferences-tab=settings]") &&
        document.querySelectorAll(".storage-summary").length === 0,
    );
    release();
    await pending;
    await idle(page);
    check(
      "Hidden authority changes clear data and reject late protected inventory without hidden data taking focus",
      (await selected("settings")) &&
        !(await page.locator(".preferences").innerText()).includes(
          "stale-hidden82",
        ) &&
        (await page.locator(".storage-summary").count()) === 0 &&
        // The existing access-cover hides the whole shell during prepare and
        // the browser can move focus to BODY; hidden data must never take it.
        (await page
          .locator("#preferences-panel-data")
          .evaluate((node) => !node.contains(document.activeElement))),
    );
    backend.suspended = [];
    backend.operationId = null;
    backend.accessEpoch++;
    backend.noteEpochs["note-a"] = (backend.noteEpochs["note-a"] || 0) + 1;
    await page.evaluate(
      (value) => window.__DEBUG_PLATFORM__.emit("notes-access", value),
      {
        phase: "commit",
        operationId: "preferences82-prepare",
        noteIds: ["note-a"],
        access: backend.state().access,
      },
    );
    await idle(page);
    await tab("数据").click();
    await idle(page);
    await page.waitForSelector(".storage-summary");
    check(
      "Authorized recovery refreshes the existing data instance without reviving old values",
      (await page.evaluate(
        () =>
          window.__preferences82Data ===
          document.querySelector(".data-management"),
      )) &&
        !(await page.locator(".data-management").innerText()).includes(
          "stale-hidden82",
        ),
    );
  } finally {
    release?.();
    backend.call = originalCall;
  }
  await close();
  await command("settings.open");
  check(
    "Reopening settings resets entry tab and lazy data lifetime",
    (await selected("settings")) &&
      (await page.locator(".data-management").count()) === 0,
  );
  let invalid;
  try {
    await api(page, "settings.tab", { tab: "cloud" });
  } catch (error) {
    invalid = error.code;
  }
  check(
    "Unknown tab is rejected by the public enum before changing settings",
    invalid === "INVALID_ARGUMENT" && (await selected("settings")),
  );
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Tab");
  check(
    "Body Tab enters only visible controls of the shared dialog",
    await page
      .locator(".preferences-close")
      .evaluate((node) => node === document.activeElement),
  );
  await page.keyboard.press("Shift+Tab");
  check(
    "Reverse Tab wraps to the visible settings action",
    await page
      .getByRole("button", { name: "关闭所有已锁定的备忘录", exact: true })
      .evaluate((node) => node === document.activeElement),
  );
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Escape");
  await idle(page);
  check(
    "Body Escape closes the shell and restores a visible entry",
    (await page.locator(".preferences").count()) === 0 &&
      (await page.evaluate(
        () =>
          document.activeElement !== document.body &&
          !!document.activeElement?.getClientRects().length,
      )),
  );
  check(
    "Preferences interactions never rewrite note documents or Undo content",
    notesBefore ===
      JSON.stringify(backend.workspace.notes.map((note) => note.document)),
  );
  // Active synthetic microphone session remains owned across preferences tabs.
  await runtime.reset();
  await command("note.select", { id: "note-a" });
  await command("recording.open");
  await command("recording.action", { action: "toggle" });
  await command("settings.open");
  await command("settings.tab", { tab: "data" });
  check(
    "Recording remains active on the data tab and backup actions stay disabled",
    (await state(page)).recording.active &&
      (await state(page)).recording.state.phase === "recording" &&
      (await page
        .getByRole("button", { name: "导出完整备份…", exact: true })
        .isDisabled()) &&
      (await page
        .getByRole("button", { name: "导入备份…", exact: true })
        .isDisabled()),
  );
  await command("settings.tab", { tab: "settings" });
  await command("settings.tab", { tab: "data" });
  check(
    "Repeated tab switches do not stop or reassign the recording",
    (await state(page)).recording.active &&
      (await state(page)).recording.state.phase === "recording" &&
      backend.workspace.attachments.length === 0,
  );
  await command("modal.cancel");
  await command("recording.action", { action: "close" });
  await runtime.reset();
  backend.configure({ fail: { inventory: 100 } });
  await command("data.open");
  check(
    "First inventory failure still leaves backup recovery controls available",
    (await page
      .getByRole("button", { name: "重试读取", exact: true })
      .count()) === 1 &&
      (await page
        .getByRole("button", { name: "导入备份…", exact: true })
        .isEnabled()) &&
      (await page
        .getByRole("button", { name: "导出完整备份…", exact: true })
        .isEnabled()),
  );
  backend.configure({ fail: { inventory: 0 } });
  await page.getByRole("button", { name: "重试读取", exact: true }).click();
  await idle(page);
  const metrics = [];
  for (const width of [320, 390, 800, 1280])
    for (const theme of ["light", "dark"]) {
      await close();
      await page.setViewportSize({ width, height: 844 });
      await command("settings.update", { settings: { theme } });
      await command("settings.open");
      for (const value of ["settings", "data"]) {
        await command("settings.tab", { tab: value });
        const geometry = await page.locator(".preferences").evaluate((node) => {
          const r = node.getBoundingClientRect(),
            close = node
              .querySelector(".preferences-close")
              .getBoundingClientRect();
          return {
            left: r.left,
            right: r.right,
            top: r.top,
            bottom: r.bottom,
            clientWidth: node.clientWidth,
            scrollWidth: node.scrollWidth,
            close: close.toJSON(),
            overflows: [...node.querySelectorAll("*")]
              .filter(
                (x) =>
                  !x.closest("[hidden]") &&
                  x.getClientRects().length &&
                  x.getBoundingClientRect().right > innerWidth + 1,
              )
              .map((x) => x.className),
          };
        });
        metrics.push({ width, theme, tab: value, geometry });
        check(
          `${width}px ${theme} ${value} fits one shell with reachable tabs and close`,
          geometry.left >= 0 &&
            geometry.right <= width &&
            geometry.top >= 0 &&
            geometry.bottom <= 844 &&
            geometry.scrollWidth <= geometry.clientWidth &&
            geometry.close.right <= width &&
            !geometry.overflows.length,
        );
        if (
          (width === 320 && theme === "light" && value === "settings") ||
          (width === 390 && theme === "dark" && value === "data") ||
          (width === 800 && theme === "dark" && value === "settings") ||
          (width === 1280 && theme === "light" && value === "data")
        )
          await page.screenshot({
            path: resolve(
              output,
              `preferences82-${width}-${theme}-${value}.png`,
            ),
          });
      }
    }
  await page.setViewportSize({ width: 320, height: 360 });
  check(
    "Short screens keep shared close and tabs fixed while data scrolls",
    (await page
      .locator(".preferences-close")
      .evaluate(
        (node) => node.getBoundingClientRect().bottom <= innerHeight,
      )) &&
      (await tab("设置").isVisible()) &&
      (await page
        .locator(".data-management-scroll")
        .evaluate(
          (node) =>
            node.scrollHeight > node.clientHeight &&
            getComputedStyle(node).overflowY === "auto",
        )),
  );
  await saveJSON(resolve(output, "preferences82-layout.json"), {
    metrics,
    scope: runtime.metadata,
  });
  await saveJSON(
    resolve(output, "preferences82-final.snapshot.json"),
    await snapshot(page, { selector: ".preferences", maxChars: 35000 }),
  );
  await close();
  await page.setViewportSize(runtime.viewport);
  // Mac-specific App projection, with toolbar IPC explicitly simulated.
  if (!runtime.mobile) {
    const mac = await openRuntime({ nativeToolbar: true });
    try {
      const run = async (id, args) => {
        await api(mac.page, id, args);
        await idle(mac.page);
      };
      await run("settings.open");
      await mac.page.waitForFunction(
        () =>
          window.__DEBUG_PLATFORM__.toolbarStates.at(-1)?.contentOverlay ===
          true,
      );
      const settingOverlay = await mac.page.evaluate(
        () => window.__DEBUG_PLATFORM__.toolbarStates.at(-1).contentOverlay,
      );
      await run("settings.tab", { tab: "data" });
      const dataOverlay = await mac.page.evaluate(
        () => window.__DEBUG_PLATFORM__.toolbarStates.at(-1).contentOverlay,
      );
      await run("modal.cancel");
      await mac.page.waitForFunction(
        () =>
          window.__DEBUG_PLATFORM__.toolbarStates.at(-1)?.contentOverlay ===
          false,
      );
      await saveJSON(resolve(output, "preferences82-native-projection.json"), {
        scope:
          "Actual App -> NativeToolbar -> guest transport, synthetic Mac platform and native IPC only; no AppKit rendering claim",
        states: await mac.page.evaluate(
          () => window.__DEBUG_PLATFORM__.toolbarStates,
        ),
        pageErrors: mac.errors,
      });
      check(
        "Actual App native projection protects both tabs and restores toolbar after closing",
        settingOverlay && dataOverlay && mac.errors.length === 0,
      );
    } finally {
      await mac.cleanup();
    }
  }
}
