import { resolve } from "node:path";
import { api, idle, state, snapshot, saveJSON } from "./runtime.mjs";
import { chooseFiles, tinyPNG } from "./mobile-attachments.mjs";

/** Storage totals are explicit filesystem fixtures; actions remain the real App,
 * bridge, DataManagement and original-byte export handlers. No native claims. */
export async function runStorageOverview(runtime, { command, check, output }) {
  const { page, backend } = runtime;
  const originalCall = backend.call.bind(backend);
  const metrics = [];
  const categories = [
    "image",
    "audio",
    "video",
    "attachments",
    "database",
    "logs",
    "other",
  ];
  const labels = {
    image: "图片",
    audio: "录音",
    video: "视频",
    attachments: "其他附件",
    database: "数据库",
    logs: "辅助日志",
    other: "其他文件与目录",
  };
  const capture = async (name) => {
    await saveJSON(
      resolve(output, name + ".snapshot.json"),
      await snapshot(page, {
        selector: ".data-management",
        maxChars: 60000,
        maxNodes: 180,
      }),
    );
    await page.screenshot({ path: resolve(output, name + ".png") });
  };
  const close = async () => {
    await page
      .getByRole("button", { name: "关闭设置", exact: true })
      .click();
    await idle(page);
  };
  const open = async () => {
    await command("data.open");
    await page.waitForSelector(".storage-summary");
  };
  const back = async () => {
    await page
      .getByRole("button", { name: "返回数据管理总览", exact: true })
      .click();
    await page.waitForSelector(".storage-summary");
  };
  const category = async (id) => {
    await page.locator(`[data-storage-category="${id}"]`).click();
    await page.waitForSelector(`.data-management[data-storage-view="${id}"]`);
  };
  const configure = (value) =>
    page.evaluate((value) => window.__DEBUG_PLATFORM__.configure(value), value);
  if (runtime.mobile) await command("note.select", { id: "note-a" });
  await chooseFiles(page, [
    { name: "原始图片81.png", mimeType: "image/png", buffer: tinyPNG },
  ]);
  await idle(page);
  const attachment = backend.workspace.attachments[0];
  let mode = "normal",
    inventoryCounter = 0,
    reorder = false,
    lastInventory;
  const media = (path, kind, size, status = "file") => ({
    relativePath: path,
    category: "attachment",
    size,
    modifiedAt: size === null ? null : 1760000000000,
    exists: status !== "missing",
    status,
    attachment: {
      id: "fixture81-" + path,
      noteId: "note-a",
      kind,
      mime: kind + "/*",
      displayName: "测试-" + path.split("/").at(-1),
      declaredSize: size ?? 99999999,
      referenced: true,
      exportable: false,
    },
  });
  const fixture = (value) => {
    const files =
      mode === "empty"
        ? []
        : [
            ...value.files,
            media("attachments/session81.wav", "audio", 1024 * 1024),
            media("attachments/session81.mp4", "video", 2 * 1024 * 1024),
            media("attachments/document81.pdf", "file", 512 * 1024),
            media("attachments/missing81.png", "image", null, "missing"),
            {
              relativePath: "runtime/empty81",
              category: "other",
              size: null,
              modifiedAt: 1760000000000,
              exists: true,
              status: "directory",
            },
            {
              relativePath: "runtime/symlink81",
              category: "other",
              size: null,
              modifiedAt: 1760000000000,
              exists: true,
              status: "symlink",
            },
            {
              relativePath: "runtime/zero81",
              category: "other",
              size: 0,
              modifiedAt: 1760000000000,
              exists: true,
              status: "file",
            },
            ...Array.from({ length: 43 }, (_, i) => ({
              relativePath:
                `runtime/${String(i).padStart(2, "0")}-` +
                "很长的文件路径与名称".repeat(5) +
                ".bin",
              category: "other",
              size: 4096 + i,
              modifiedAt: 1760000000000,
              exists: true,
              status: "file",
            })),
            // Deliberately later conflicting metadata: physical path belongs to first
            // primary image row, not this duplicate's audio kind or declared payload.
            {
              ...value.files.find(
                (row) => row.attachment?.id === attachment.id,
              ),
              attachment: {
                ...value.files.find(
                  (row) => row.attachment?.id === attachment.id,
                ).attachment,
                id: "duplicate81",
                kind: "audio",
                displayName: "共享路径登记81",
                exportable: false,
              },
            },
          ];
    const paths = [
      ...new Map(
        files
          .slice()
          .reverse()
          .map((file) => [file.relativePath, file]),
      ).values(),
    ];
    const total = paths.reduce((n, file) => n + (file.size ?? 0), 0);
    const categoryBytes = (key) =>
      paths
        .filter((file) => file.category === key)
        .reduce((n, file) => n + (file.size ?? 0), 0);
    return {
      ...value,
      rootPath: "/synthetic81/" + "非常长的数据目录/".repeat(8),
      capturedAt: 1760000002222,
      files,
      totals: {
        databaseBytes: categoryBytes("database"),
        auxiliaryBytes: categoryBytes("wal") + categoryBytes("shm"),
        attachmentBytes: categoryBytes("attachment"),
        otherBytes: categoryBytes("other"),
        totalBytes: mode === "mismatch" ? total + 123 : total,
        declaredAttachmentBytes: 999999999,
      },
      counts: {
        ...value.counts,
        physicalFiles: paths.filter((file) => file.status === "file").length,
        attachments: files.filter((file) => file.attachment).length,
        missingAttachments: files.filter(
          (file) => file.attachment && !file.exists,
        ).length,
      },
      warnings: mode === "empty" ? [] : ["合成采样警告81：保留全部文件信息"],
    };
  };
  backend.call = async (c, a) => {
    const row = await originalCall(c, a);
    if (c === "get_data_management" && row.ok) {
      row.value = fixture(row.value);
      lastInventory = row.value;
      if (reorder) {
        const index = ++inventoryCounter;
        row.value.rootPath = index === 1 ? "/old-late81" : "/new-latest81";
        if (index === 1) await new Promise((done) => setTimeout(done, 220));
      }
    }
    return row;
  };
  try {
    await open();
    check(
      "Initial data page shows one storage overview and no expanded file rows",
      (await page.locator(".storage-summary").count()) === 1 &&
        (await page.locator(".data-file").count()) === 0 &&
        (await page.locator(".storage-category").count()) === 7,
    );
    const expected = await page.evaluate(async (snapshot) => {
      const { storageUsage } = await import("/src/storage-usage.ts");
      return storageUsage(snapshot);
    }, lastInventory);
    const total = await page
      .locator("[data-storage-total]")
      .getAttribute("data-storage-total");
    check(
      "App total uses snapshot totalBytes rather than declared bytes",
      Number(total) === expected.knownBytes && Number(total) !== 999999999,
    );
    const segments = await page
      .locator("[data-storage-segment]")
      .evaluateAll((nodes) =>
        nodes.map((node) => ({
          id: node.dataset.storageSegment,
          bytes: Number(node.dataset.storageBytes),
          width: node.getBoundingClientRect().width,
          parent: node.parentElement.getBoundingClientRect().width,
        })),
      );
    check(
      "Continuous bar uses exact actual byte proportions with no invented minimum segment size",
      segments.every(
        (row) =>
          Math.abs(row.width / row.parent - row.bytes / Number(total)) < 0.0001,
      ) && segments.reduce((n, row) => n + row.bytes, 0) === Number(total),
    );
    check(
      "Duplicate physical path contributes bytes only once to its primary image category",
      expected.duplicateRecords === 1 &&
        expected.groups.find((group) => group.id === "image").bytes ===
          tinyPNG.length &&
        expected.groups.find((group) => group.id === "audio").bytes ===
          1024 * 1024,
    );
    check(
      "Unknown/missing/directory sizes are explicitly excluded instead of declared payload substitution",
      expected.unknownPaths === 4 &&
        (await page.locator(".storage-summary-note").innerText()).includes(
          "4 项目录、缺失或大小未知",
        ),
    );
    check(
      "Color legend offers seven keyboard-operable semantic category buttons",
      (await page.locator(".storage-legend button").count()) === 7 &&
        (
          await page
            .locator(".storage-legend button")
            .first()
            .getAttribute("aria-label")
        ).includes("项"),
    );
    await page.locator(".data-storage-details summary").click();
    check(
      "Data root, sample time, counts and warnings stay discoverable in disclosure",
      (await page.locator(".data-storage-details").innerText()).includes(
        "合成采样警告81",
      ) &&
        (await page.locator(".data-root").innerText()).includes(
          "非常长的数据目录",
        ) &&
        (await page.locator(".data-sampled").innerText()).includes("2025"),
    );
    await page.locator(".data-storage-details summary").click();
    for (const id of categories) {
      await category(id);
      check(
        "Category " +
          id +
          " navigates within same dialog and retains complete entries",
        (await page.locator('[role="dialog"]').count()) === 1 &&
          (await page.locator(".storage-detail-heading").innerText()).includes(
            labels[id],
          ) &&
          Number(
            (await page.locator(".data-count").innerText()).match(
              /全部 (\d+)/,
            )[1],
          ) === expected.groups.find((group) => group.id === id).files.length,
      );
      await back();
    }
    await page
      .locator(".storage-legend button")
      .filter({ hasText: "录音" })
      .click();
    check(
      "Legend button enters its actual detail page",
      (await page.locator('[data-storage-view="audio"]').count()) === 1,
    );
    await back();
    await page
      .locator(".storage-legend button")
      .filter({ hasText: "视频" })
      .focus();
    await page.keyboard.press("Enter");
    check(
      "Enter on legend enters the chosen category",
      (await page.locator('[data-storage-view="video"]').count()) === 1,
    );
    await back();
    await page.locator('[data-storage-category="database"]').focus();
    await page.keyboard.press("Space");
    check(
      "Space on a category row enters its detail",
      (await page.locator('[data-storage-view="database"]').count()) === 1,
    );
    await back();
    await category("image");
    check(
      "Image detail retains primary, missing and conflicting duplicate registration rows",
      (await page.locator(".data-file").count()) === 3 &&
        (await page.getByText("共享路径登记81", { exact: true }).count()) ===
          1 &&
        (await page.locator(".data-export:disabled").count()) === 2,
    );
    const documentBefore = JSON.stringify((await state(page)).editorJSON),
      readsBefore = backend.calls.filter(
        (row) => row.command === "read_attachment",
      ).length;
    await configure({ dialog: { save: [null] } });
    await page
      .getByRole("button", {
        name: "导出 " + attachment.displayName,
        exact: true,
      })
      .click();
    await idle(page);
    check(
      "Image detail cancel writes nothing and reports no success",
      backend.exports.length === 0 &&
        (await page.getByText("附件已导出", { exact: true }).count()) === 0,
    );
    await configure({ dialog: { save: ["content://fixture81/original.png"] } });
    await page
      .getByRole("button", {
        name: "导出 " + attachment.displayName,
        exact: true,
      })
      .click();
    await idle(page);
    check(
      "Image detail export retains original bytes and real ID without payload inventory reads or editor changes",
      backend.exports.length === 1 &&
        backend.exports[0].id === attachment.id &&
        Buffer.from(backend.exports[0].data, "base64").equals(tinyPNG) &&
        JSON.stringify((await state(page)).editorJSON) === documentBefore &&
        backend.calls.filter((row) => row.command === "read_attachment")
          .length === readsBefore,
    );
    backend.configure({ fail: { export: 1 } });
    await page
      .getByRole("button", {
        name: "导出 " + attachment.displayName,
        exact: true,
      })
      .click();
    await idle(page);
    check(
      "Detail export failure remains visible without false success",
      (await page.locator(".data-error").count()) === 1 &&
        backend.exports.length === 1,
    );
    await page
      .getByRole("button", {
        name: "导出 " + attachment.displayName,
        exact: true,
      })
      .click();
    await idle(page);
    check(
      "Detail export retry publishes exactly once",
      backend.exports.length === 2,
    );
    await back();
    await category("other");
    await page.getByRole("button", { name: "下一页", exact: true }).click();
    await back();
    await category("other");
    check(
      "Returning to overview preserves category pagination",
      (await page.locator(".data-pagination").innerText()).includes(
        "第 2 / 3 页",
      ),
    );
    await page.getByRole("textbox", { name: "搜索本地文件" }).fill("zero81");
    check(
      "Detail path search filters actual list and resets page",
      (await page.locator(".data-file").count()) === 1 &&
        (await page.locator(".data-file").innerText()).includes("0 B"),
    );
    await back();
    await category("other");
    check(
      "Returning to category preserves its search",
      (await page
        .getByRole("textbox", { name: "搜索本地文件" })
        .inputValue()) === "zero81",
    );
    await command("data.filter", { kind: "all", query: "" });
    check(
      "Legacy all filter enters all-files detail including DB and logs",
      (await page.locator('[data-storage-view="all"]').count()) === 1 &&
        (await page.locator(".data-count").innerText()).includes(
          "全部 " +
            expected.groups.reduce((n, group) => n + group.files.length, 0),
        ) &&
        (await page.locator('[data-file-path="notes.sqlite3"]').count()) === 1,
    );
    await page.getByRole("textbox", { name: "搜索本地文件" }).fill("absent81");
    check(
      "All-files search empty result remains explicit",
      (await page.getByText("没有匹配的文件", { exact: true }).count()) === 1,
    );
    for (const [kind, id] of [
      ["image", "image"],
      ["audio", "audio"],
      ["video", "video"],
      ["file", "attachments"],
      ["unowned", "other"],
    ]) {
      await command("data.filter", { kind, query: "" });
      check(
        "Legacy kind " + kind + " enters matching detail",
        (await page.locator(`[data-storage-view="${id}"]`).count()) === 1,
      );
    }
    await back();
    // Helpers tested with values that cannot be inferred from the normal UI fixture.
    const edge = await page.evaluate(async () => {
      const { storageUsage, storageCategory, isStorageView } =
        await import("/src/storage-usage.ts");
      const { formatFileSize } = await import("/src/data-management.ts");
      const snapshot = {
        files: [
          {
            relativePath: "x",
            category: "attachment",
            size: 7,
            attachment: { kind: "image" },
          },
          {
            relativePath: "x",
            category: "attachment",
            size: 900,
            attachment: { kind: "audio" },
          },
          {
            relativePath: "null",
            category: "attachment",
            size: null,
            attachment: { kind: "video" },
          },
          { relativePath: "zero", category: "other", size: 0 },
        ],
        totals: { totalBytes: 7 },
      };
      return {
        usage: storageUsage(snapshot),
        category: storageCategory({
          category: "other",
          attachment: { kind: "drawing" },
        }),
        views: ["overview", "all", "logs", "bad", "__proto__"].map(
          isStorageView,
        ),
        large: formatFileSize(1024 ** 4),
        zero: formatFileSize(0),
        unknown: formatFileSize(null),
      };
    });
    check(
      "Summary helper preserves duplicate records but uses first path size/category and actual zero",
      edge.usage.consistent &&
        edge.usage.knownBytes === 7 &&
        edge.usage.duplicateRecords === 1 &&
        edge.usage.groups.find((group) => group.id === "image").files.length ===
          2 &&
        edge.usage.groups.find((group) => group.id === "audio").bytes === 0 &&
        edge.usage.groups.find((group) => group.id === "other").bytes === 0,
    );
    check(
      "Unknown kinds, view validation and large/zero/unknown formatting remain explicit",
      edge.category === "attachments" &&
        JSON.stringify(edge.views) === "[true,true,true,false,false]" &&
        edge.large === "1.00 TB" &&
        edge.zero === "0 B" &&
        edge.unknown === "未知",
    );
    for (const width of [320, 390, 800, 1280])
      for (const theme of ["light", "dark"]) {
        await close();
        await page.setViewportSize({ width, height: 844 });
        await command("settings.update", { settings: { theme } });
        await open();
        const geometry = await page
          .locator(".preferences")
          .evaluate((node) => {
            const r = node.getBoundingClientRect();
            const close = node
              .querySelector('[aria-label="关闭设置"]')
              .getBoundingClientRect();
            return {
              width: r.width,
              left: r.left,
              right: r.right,
              top: r.top,
              bottom: r.bottom,
              scrollWidth: node.scrollWidth,
              clientWidth: node.clientWidth,
              close: {
                left: close.left,
                right: close.right,
                top: close.top,
                bottom: close.bottom,
              },
              headerBottom: node.querySelector("header").getBoundingClientRect()
                .bottom,
            };
          });
        metrics.push({ width, theme, view: "overview", geometry });
        check(
          `${width}px ${theme} overview fits viewport and keeps fixed header/close reachable`,
          geometry.scrollWidth <= geometry.clientWidth &&
            geometry.left >= 0 &&
            geometry.right <= width &&
            geometry.top >= 0 &&
            geometry.bottom <= 844 &&
            geometry.close.top >= 0 &&
            geometry.close.right <= width,
        );
        await capture(`storage81-${width}-${theme}-overview`);
        await category("all");
        const detailsGeometry = await page
          .locator(".data-management")
          .evaluate((node) => ({
            width: node.clientWidth,
            scrollWidth: node.scrollWidth,
            overflow: [...node.querySelectorAll("*")]
              .filter(
                (x) =>
                  x.getClientRects().length &&
                  x.getBoundingClientRect().right > innerWidth + 1,
              )
              .map((x) => x.className),
          }));
        metrics.push({ width, theme, view: "all", geometry: detailsGeometry });
        check(
          `${width}px ${theme} detail wraps long paths without horizontal overflow`,
          detailsGeometry.scrollWidth <= detailsGeometry.width &&
            !detailsGeometry.overflow.length,
        );
        await capture(`storage81-${width}-${theme}-detail`);
        await back();
      }
    await page.evaluate(() =>
      document.querySelector(".app").style.setProperty("--native-top", "44px"),
    );
    const native = await page.locator(".preferences").evaluate((node) => ({
      top: node.getBoundingClientRect().top,
      close: node
        .querySelector('[aria-label="关闭设置"]')
        .getBoundingClientRect().top,
    }));
    check(
      "Reserved native title area keeps management header clear",
      native.top >= 44 && native.close >= 44,
    );
    await page.evaluate(() =>
      document.querySelector(".app").style.removeProperty("--native-top"),
    );
    const first = page.getByRole("button", {
      name: "关闭设置",
      exact: true,
    });
    await first.focus();
    await page.keyboard.press("Shift+Tab");
    check(
      "Focus trap wraps reverse Tab inside management dialog",
      await page
        .locator(".data-storage-details summary")
        .evaluate((node) => document.activeElement === node),
    );
    await page.keyboard.press("Tab");
    check(
      "Focus trap wraps forward Tab back to header",
      await first.evaluate((node) => document.activeElement === node),
    );
    mode = "mismatch";
    await command("data.refresh");
    check(
      "Inconsistent actual summary suppresses misleading proportions and asks to refresh",
      (await page.locator(".storage-bar").count()) === 0 &&
        (await page.locator(".storage-bar-empty").innerText()).includes("刷新"),
    );
    mode = "empty";
    await command("data.refresh");
    check(
      "Empty snapshot shows actual zero and empty categories without fake capacity",
      Number(
        await page
          .locator("[data-storage-total]")
          .getAttribute("data-storage-total"),
      ) === 0 &&
        (await page.locator(".storage-bar").count()) === 0 &&
        (await page.locator(".storage-category").count()) === 7 &&
        (await page.locator(".storage-bar-empty").innerText()).includes("暂无"),
    );
    await category("video");
    check(
      "Empty detail provides a clear empty state",
      (await page.getByText("此类别暂无文件", { exact: true }).count()) === 1,
    );
    await back();
    mode = "normal";
    await command("data.refresh");
    backend.configure({ fail: { inventory: 1 } });
    await page
      .getByRole("button", { name: "刷新数据管理", exact: true })
      .click();
    await page.getByRole("button", { name: "重试读取", exact: true }).waitFor();
    check(
      "Refresh failure retains previous total and categories with retry",
      (await page.locator(".storage-category").count()) === 7 &&
        Number(
          await page
            .locator("[data-storage-total]")
            .getAttribute("data-storage-total"),
        ) > 0,
    );
    await page.getByRole("button", { name: "重试读取", exact: true }).click();
    await idle(page);
    check(
      "Refresh retry clears inventory error",
      (await page.locator(".data-error").count()) === 0,
    );
    reorder = true;
    inventoryCounter = 0;
    const one = api(page, "data.refresh");
    await page.waitForTimeout(30);
    const two = api(page, "data.refresh");
    await Promise.all([one, two]);
    await idle(page);
    await page.locator(".data-storage-details summary").click();
    check(
      "Older late refresh cannot replace latest overview sampling",
      (await page.locator(".data-root").innerText()).includes("/new-latest81"),
    );
    await page.locator(".data-storage-details summary").click();
    const pending = api(page, "data.refresh");
    await close();
    await pending;
    check(
      "Closing during inventory does not revive the overlay",
      (await page.locator(".data-management").count()) === 0,
    );
    reorder = false;
    await open();
    await configure({ dialog: { save: [null] } });
    await page
      .getByRole("button", { name: "导出完整备份…", exact: true })
      .click();
    await idle(page);
    check(
      "Overview backup cancellation does not report completion",
      (await page.getByText("完整备份已导出", { exact: true }).count()) === 0,
    );
    await page
      .getByRole("button", { name: "导出完整备份…", exact: true })
      .click();
    await idle(page);
    check(
      "Overview backup uses real App archive handler and completion",
      (await page.getByText("完整备份已导出", { exact: true }).count()) === 1,
    );
    const emit = async (name, payload) =>
      page.evaluate(
        ({ name, payload }) => window.__DEBUG_PLATFORM__.emit(name, payload),
        { name, payload },
      );
    const prepare = async () => {
      backend.suspended = ["note-a"];
      backend.operationId = "storage81-prepare";
      await emit("notes-access", {
        phase: "prepare",
        operationId: backend.operationId,
        noteIds: ["note-a"],
        access: backend.state().access,
      });
    };
    const commit = async () => {
      backend.suspended = [];
      backend.operationId = null;
      backend.accessEpoch++;
      backend.noteEpochs["note-a"] = (backend.noteEpochs["note-a"] || 0) + 1;
      await emit("notes-access", {
        phase: "commit",
        operationId: "storage81-prepare",
        noteIds: ["note-a"],
        access: backend.state().access,
      });
    };
    await category("image");
    await page
      .getByRole("textbox", { name: "搜索本地文件" })
      .fill("原始图片81");
    await prepare();
    await page.waitForSelector(".access-cover");
    check(
      "Access prepare clears prior file names/total before sensitive state can remain visible",
      (await page.locator(".data-file").count()) === 0 &&
        (await page.locator("[data-storage-total]").count()) === 0,
    );
    await commit();
    await idle(page);
    await page.waitForSelector("[data-file-path]");
    check(
      "Trusted access completion reloads current category and clears stale filename query",
      (await page.locator('[data-storage-view="image"]').count()) === 1 &&
        (await page
          .getByRole("textbox", { name: "搜索本地文件" })
          .inputValue()) === "",
    );
    await back();
    const nativeCall = backend.call;
    backend.call = async (c, a) => {
      if (c === "import_archive") {
        await prepare();
        await page.waitForSelector(".access-cover");
        const result = await nativeCall(c, a);
        await commit();
        return { ...result, value: backend.state() };
      }
      return nativeCall(c, a);
    };
    await page.getByRole("button", { name: "导入备份…", exact: true }).click();
    await idle(page);
    await page.waitForSelector(".storage-summary");
    check(
      "Overview import retains actual App save barrier lifecycle and refreshes snapshot",
      (await page.locator(".storage-summary").count()) === 1 &&
        (await page.locator(".data-management").count()) === 1,
    );
    backend.call = nativeCall;
    await close();
    await command("recording.open");
    await command("recording.action", { action: "toggle" });
    await open();
    check(
      "Active recording still blocks both overview backup actions with unsaved audio explanation",
      (await page
        .getByRole("button", { name: "导入备份…", exact: true })
        .isDisabled()) &&
        (await page
          .getByRole("button", { name: "导出完整备份…", exact: true })
          .isDisabled()) &&
        (await page.locator(".data-warning").first().innerText()).includes(
          "内存中的录音尚未备份",
        ),
    );
    await close();
    await command("recording.action", { action: "close" });
    await open();
    await page.keyboard.press("Escape");
    check(
      "Escape closes management while retaining the surrounding App",
      (await page.locator(".data-management").count()) === 0 &&
        (await page.locator(".app").count()) === 1,
    );
    await saveJSON(resolve(output, "storage81-metrics.json"), {
      metrics,
      pageErrors: runtime.errors,
      scope: runtime.metadata,
      limitations: [
        "Inventory filesystem stat rows are synthetic typed fixtures; actual disk and ContentResolver are separately tested.",
        "No device, original app or native toolbar was driven; reserved native top is CSS simulation until combined native integration.",
      ],
    });
    check(
      "No page errors during storage overview/navigation/actions",
      runtime.errors.length === 0,
    );
  } finally {
    backend.call = originalCall;
  }
}

/** Regression: archive recovery must not depend on successful file inventory. */
export async function runStorageBackupAvailability(
  runtime,
  { command, check, output },
) {
  const { page, backend } = runtime;
  const originalCall = backend.call.bind(backend);
  const configure = (value) =>
    page.evaluate((value) => window.__DEBUG_PLATFORM__.configure(value), value);
  const buttons = page.locator(".data-backup-actions button");
  const available = async () =>
    (await buttons.count()) === 2 &&
    (await buttons.evaluateAll((nodes) =>
      nodes.every((node) => !node.disabled),
    ));
  const capture = async (name) => {
    await saveJSON(
      resolve(output, name + ".snapshot.json"),
      await snapshot(page, { selector: ".data-management", maxChars: 60000 }),
    );
    await page.screenshot({ path: resolve(output, name + ".png") });
  };
  const archiveCalls = () =>
    backend.calls.filter(
      (row) =>
        row.command === "export_archive" || row.command === "import_archive",
    ).length;
  let releaseInventory;
  const initialInventory = new Promise((resolve) => {
    releaseInventory = resolve;
  });
  let holdInventory = true;
  backend.configure({ fail: { inventory: 100 } });
  backend.call = async (c, a) => {
    if (c === "get_data_management" && holdInventory) await initialInventory;
    return originalCall(c, a);
  };
  const emit = async (name, payload) =>
    page.evaluate(
      ({ name, payload }) => window.__DEBUG_PLATFORM__.emit(name, payload),
      { name, payload },
    );
  const prepare = async () => {
    backend.suspended = ["note-a"];
    backend.operationId = "storage81-no-inventory";
    await emit("notes-access", {
      phase: "prepare",
      operationId: backend.operationId,
      noteIds: ["note-a"],
      access: backend.state().access,
    });
  };
  const commit = async () => {
    backend.suspended = [];
    backend.operationId = null;
    backend.accessEpoch++;
    backend.noteEpochs["note-a"] = (backend.noteEpochs["note-a"] || 0) + 1;
    await emit("notes-access", {
      phase: "commit",
      operationId: "storage81-no-inventory",
      noteIds: ["note-a"],
      access: backend.state().access,
    });
  };
  try {
    const opening = api(page, "data.open");
    await page.waitForSelector(".data-backup-section");
    check(
      "First pending inventory exposes both actual enabled archive controls without snapshot",
      (await available()) &&
        (await page.locator(".data-loading").count()) === 1 &&
        (await page.locator("[data-storage-total]").count()) === 0,
    );
    await capture("storage81-inventory-pending");
    holdInventory = false;
    releaseInventory();
    await opening;
    await idle(page);
    await page.getByRole("button", { name: "重试读取", exact: true }).waitFor();
    check(
      "First inventory failure retains import/export recovery and explicit retry without totals",
      (await available()) &&
        (await page.locator(".storage-summary").count()) === 0,
    );
    await capture("storage81-inventory-failed");
    for (const mode of ["import", "export"]) {
      const before = archiveCalls();
      await configure({
        dialog: { [mode === "import" ? "open" : "save"]: [null] },
      });
      await page
        .getByRole("button", {
          name: mode === "import" ? "导入备份…" : "导出完整备份…",
          exact: true,
        })
        .click();
      await idle(page);
      check(
        `No-snapshot ${mode} cancellation keeps both controls and performs no archive write`,
        archiveCalls() === before &&
          (await available()) &&
          (await page.locator(".data-notice").count()) === 0,
      );
    }
    for (const mode of ["export", "import"]) {
      backend.configure({ fail: { archive: 1 } });
      await page
        .getByRole("button", {
          name: mode === "import" ? "导入备份…" : "导出完整备份…",
          exact: true,
        })
        .click();
      await idle(page).catch((cause) => {
        if (!cause.message.includes("Controlled archive")) throw cause;
      });
      check(
        `No-snapshot ${mode} failure remains explicit and retry controls stay reachable`,
        (await page.locator(".data-error").allTextContents()).some((text) =>
          text.includes("Controlled archive"),
        ) &&
          (await available()) &&
          (await page.locator(".storage-summary").count()) === 0 &&
          (await page.locator(".data-notice").count()) === 0,
      );
      await command("app.dismissError");
    }
    let releaseArchive;
    const exporting = new Promise((resolve) => {
      releaseArchive = resolve;
    });
    backend.call = async (c, a) => {
      if (c === "export_archive") await exporting;
      return originalCall(c, a);
    };
    await page
      .getByRole("button", { name: "导出完整备份…", exact: true })
      .click();
    await page.getByRole("button", { name: "导出中…", exact: true }).waitFor();
    check(
      "No-snapshot archive in flight keeps both controls visible and disabled",
      (await buttons.count()) === 2 &&
        (await buttons.evaluateAll((nodes) =>
          nodes.every((node) => node.disabled),
        )),
    );
    releaseArchive();
    await idle(page);
    check(
      "No-snapshot export retry completes through actual App archive handler",
      (await available()) &&
        (await page.getByText("完整备份已导出", { exact: true }).count()) ===
          1 &&
        (await page.locator(".storage-summary").count()) === 0,
    );
    backend.call = async (c, a) => {
      if (c === "import_archive") {
        await prepare();
        await page.waitForSelector(".access-cover");
        check(
          "No-snapshot import prepare retains both controls disabled behind access cover",
          (await buttons.count()) === 2 &&
            (await buttons.evaluateAll((nodes) =>
              nodes.every((node) => node.disabled),
            )) &&
            (await page.locator("[data-storage-total]").count()) === 0,
        );
        const result = await originalCall(c, a);
        await commit();
        return { ...result, value: backend.state() };
      }
      return originalCall(c, a);
    };
    await page.getByRole("button", { name: "导入备份…", exact: true }).click();
    await idle(page);
    check(
      "No-snapshot import commit leaves recovery controls enabled even if inventory fails again",
      (await available()) &&
        (await page.locator(".access-cover").count()) === 0 &&
        (await page.locator(".data-management").count()) === 1 &&
        (await page.getByText("本地备份已导入", { exact: true }).count()) ===
          1 &&
        (await page.locator(".storage-summary").count()) === 0,
    );
    await capture("storage81-recovered-without-inventory");
    backend.call = originalCall;
    backend.configure({ fail: { inventory: 0 } });
    await page.getByRole("button", { name: "重试读取", exact: true }).click();
    await idle(page);
    check(
      "Inventory retry restores overview without duplicating or losing backup controls",
      (await available()) &&
        (await page.locator(".storage-summary").count()) === 1 &&
        (await page.locator(".data-backup-section").count()) === 1,
    );
    check(
      "No page errors during no-snapshot archive recovery",
      runtime.errors.length === 0,
    );
  } finally {
    holdInventory = false;
    releaseInventory();
    backend.call = originalCall;
  }
}
