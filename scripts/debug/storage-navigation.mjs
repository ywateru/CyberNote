import { api } from "./runtime.mjs";
/** Public catalog/protocol wiring must drive the real DataManagement handle. */
export async function runStorageNavigation(runtime, { command, check }) {
  const { page, backend } = runtime;
  if (runtime.mobile) await command("note.select", { id: "note-a" });
  await command("data.open");
  await page.waitForSelector(".storage-summary");
  const inventories = () =>
    backend.calls.filter((row) => row.command === "get_data_management").length;
  const before = inventories();
  const view = () =>
    page.locator(".data-management").getAttribute("data-storage-view");
  for (const value of [
    "all",
    "image",
    "audio",
    "video",
    "attachments",
    "database",
    "logs",
    "other",
    "overview",
  ]) {
    await command("data.navigate", { view: value });
    check(
      `Public data.navigate reaches real ${value} view`,
      (await view()) === value,
    );
  }
  check(
    "Category navigation preserves inventory snapshot without rereading payloads",
    inventories() === before,
  );
  for (const value of ["icloud", null, 42]) {
    let code;
    try {
      await api(page, "data.navigate", { view: value });
    } catch (error) {
      code = error.code;
    }
    check(
      `Public data.navigate rejects invalid enum ${String(value)} before changing view`,
      code === "INVALID_ARGUMENT" && (await view()) === "overview",
    );
  }
  await command("data.filter", { kind: "file" });
  check(
    "Legacy file filter maps to actual other attachments detail",
    (await view()) === "attachments",
  );
  await command("data.filter", { kind: "unowned" });
  check(
    "Legacy unowned filter maps to actual other files detail",
    (await view()) === "other",
  );
  await command("data.filter", { query: "notes.sqlite3" });
  check(
    "Query-only filter retains current category detail",
    (await view()) === "other",
  );
  await command("data.navigate", { view: "overview" });
  await command("data.filter", { query: "notes.sqlite3" });
  check(
    "Query from overview opens all files and applies the real filename search",
    (await view()) === "all" && (await page.locator(".data-file").count()) > 0,
  );
  await command("data.navigate", { view: "image" });
  await command("data.filter", { page: 1 });
  check("Page-only filter retains image detail", (await view()) === "image");
  await page.getByRole("button", { name: "关闭设置", exact: true }).click();
}
