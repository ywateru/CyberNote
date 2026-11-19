import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
// Override for another machine. This is a dev verification dependency only.
const runtime =
  process.env.PLAYWRIGHT_MODULE ??
  "/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/playwright-core/index.mjs";
const { chromium, webkit } = await import(pathToFileURL(runtime));
const out = process.env.UPDATE_PROOF_OUT ?? "/tmp/settings121-update-ui";
await mkdir(out, { recursive: true });
const useWebkit = process.env.UPDATE_WEBKIT === "1";
const browser = await (useWebkit ? webkit : chromium).launch(
  useWebkit
    ? { headless: true }
    : {
        headless: true,
        executablePath:
          process.env.CHROME_PATH ??
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      },
);
const hostCss = execFileSync("git", ["show", "e29a7d8c:src/Preferences.css"], {
  encoding: "utf8",
});
const checks = [],
  errors = [];
const origin = process.env.UPDATE_PROOF_ORIGIN ?? "http://127.0.0.1:1431";
const page = await browser.newPage();
page.on("pageerror", (e) => errors.push(e.message));
async function visit(mode, scheme = "light") {
  await page.goto(
    `${origin}/scripts/verification/settings121-update/ui.html?mode=${mode}&scheme=${scheme}`,
  );
  await page.addStyleTag({ content: hostCss });
  await page.getByRole("button", { name: "检查更新", exact: true }).waitFor();
}
try {
  for (const [width, scheme] of [
    [1000, "light"],
    [1000, "dark"],
    [520, "light"],
    [390, "dark"],
    [320, "light"],
  ]) {
    await page.setViewportSize({ width, height: 950 });
    await visit("available", scheme);
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.getByText("版本说明 · 0.2.0", { exact: true }).click();
    assert.equal(
      await page.locator(".software-update-notes script").count(),
      0,
    );
    await page.screenshot({
      path: `${out}/${useWebkit ? "webkit" : "chrome"}-${width}-${scheme}.png`,
      fullPage: true,
    });
    checks.push({ width, scheme, overflow: false });
  }
  await page.setViewportSize({ width: 900, height: 950 });
  await visit("empty");
  await page.getByText("尚无稳定版发布", { exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: /下载/ }).count(), 0);
  await page.getByRole("switch", { name: "定时检查", exact: true }).uncheck();
  assert(await page.getByLabel("检查频率", { exact: true }).isDisabled());
  await page.getByRole("switch", { name: "定时检查", exact: true }).check();
  await page.getByLabel("检查频率", { exact: true }).selectOption("15");
  await page.getByLabel("更新频道", { exact: true }).selectOption("preview");
  await page.getByRole("switch", { name: "启动时检查", exact: true }).focus();
  await page.keyboard.press("Space");
  assert.equal(
    await page
      .getByRole("switch", { name: "启动时检查", exact: true })
      .isChecked(),
    false,
  );
  await visit("error");
  await page.getByRole("button", { name: "下载 0.2.0", exact: true }).click();
  await page.getByRole("progressbar", { name: "更新下载进度" }).waitFor();
  await page
    .getByText("SHA-256 校验失败，请重新下载", { exact: true })
    .first()
    .waitFor();
  await page.screenshot({ path: `${out}/error.png`, fullPage: true });
  await page.getByRole("button", { name: "重试", exact: true }).click();
  await page
    .getByRole("button", { name: "安装并重新启动…", exact: true })
    .waitFor();
  assert.deepEqual(await page.evaluate(() => window.fixtureCalls), [
    "download",
    "download",
  ]);
  await page
    .getByRole("button", { name: "安装并重新启动…", exact: true })
    .click();
  await page
    .getByText("安装未继续：请确认保存、录音状态及安装操作", { exact: true })
    .first()
    .waitFor();
  await visit("android");
  await page.getByRole("button", { name: "下载 0.2.0", exact: true }).click();
  await page.getByText("已校验，无法安装", { exact: true }).waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "安装并重新启动…", exact: true })
      .count(),
    0,
  );
  await page.getByRole("button", { name: "隐藏更新徽标三天" }).click();
  assert.equal(
    await page.getByRole("button", { name: "隐藏更新徽标三天" }).count(),
    0,
  );
  await page.getByRole("button", { name: "立即显示", exact: true }).click();
  await page.getByRole("button", { name: "隐藏更新徽标三天" }).waitFor();
  await page.goto(
    `${origin}/scripts/verification/settings121-update/ui.html?mode=native`,
  );
  await page
    .getByText("无法读取原生更新服务，请确认宿主已完成注册", { exact: true })
    .waitFor();
  assert.equal(
    await page.getByRole("button", { name: "检查更新", exact: true }).count(),
    0,
  );
  assert.equal(
    await page
      .locator(".software-update-badge :is(button,input,a,select)")
      .count(),
    0,
  );
  assert.deepEqual(errors, []);
  await writeFile(
    `${out}/results-${useWebkit ? "webkit" : "chrome"}.json`,
    JSON.stringify(
      {
        checks,
        interactions:
          "empty, switches/keyboard, interval/channel, progress, checksum failure/retry, manual install/guard rejection, unsigned Android, badge hide/restore",
        errors,
        boundary:
          "Actual React components with injected client; no native install or device acceptance.",
      },
      null,
      2,
    ),
  );
  console.log(
    `PASS React UI ${useWebkit ? "WebKit" : "Chrome"} fixtures and screenshots: ${out}`,
  );
} finally {
  await browser.close();
}
