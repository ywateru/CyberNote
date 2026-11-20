import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
const { chromium } = await import(
  pathToFileURL(
    process.env.PLAYWRIGHT_MODULE ??
      "/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/playwright-core/index.mjs",
  )
);
const output = process.env.UPDATE_FIX_OUT ?? "/tmp/settings121-update-fix-ui";
await mkdir(output, { recursive: true });
const origin = process.env.UPDATE_PROOF_ORIGIN ?? "http://127.0.0.1:1457";
const css = execFileSync("git", ["show", "e29a7d8c:src/Preferences.css"], {
  encoding: "utf8",
});
const currentCss = await readFile("src/Preferences.css", "utf8");
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ??
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const results = [];
async function scenario(baseline, staleRetry) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("requestfailed", (r) =>
    errors.push(r.url() + ":" + r.failure()?.errorText),
  );
  try {
    await page.route("**/favicon.ico", (route) =>
      route.fulfill({ status: 204, body: "" }),
    );
    if (baseline) {
      for (const [name, mime] of [
        ["useSoftwareUpdate.tsx", "text/tsx"],
        ["SoftwareUpdateSettings.tsx", "text/tsx"],
        ["software-update.css", "text/css"],
      ]) {
        await page.route(url => url.pathname === `/src/software-update/${name}`, async (route) => {
          const source = execFileSync(
            "git",
            ["show", `cfde3810:src/software-update/${name}`],
            { encoding: "utf8" },
          );
          // Ask Vite to transform the frozen actual source via a local virtual test endpoint.
          if (mime === "text/css")
            return route.fulfill({
              body:
                'const style=document.createElement("style");style.textContent=' +
                JSON.stringify(source) +
                ";document.head.append(style);",
              contentType: "application/javascript",
            });
          const vite = await import("vite");
          const transformed = await vite.transformWithEsbuild(
            source,
            `src/software-update/${name}`,
            { loader: "tsx", jsx: "automatic", target: "es2022" },
          );
          let transformedCode = transformed.code.replace(
            /import\s*\{([^}]+)\}\s*from\s*"(react(?:\/jsx-runtime)?)";/g,
            (_, names, module) => {
              const alias = module === "react" ? "frozenReact" : "frozenJsx";
              const destructure = names.replace(/\s+as\s+/g, ":");
              return `import ${alias} from "${module === "react" ? "/node_modules/.vite/deps/react.js" : "/node_modules/.vite/deps/react_jsx-runtime.js"}";const {${destructure}}=${alias};`;
            },
          );
          const body = transformedCode
            .replaceAll(
              '"./useSoftwareUpdate"',
              '"/src/software-update/useSoftwareUpdate.tsx"',
            )
            .replaceAll('"react"', '"/node_modules/.vite/deps/react.js"')
            .replaceAll(
              '"react/jsx-runtime"',
              '"/node_modules/.vite/deps/react_jsx-runtime.js"',
            );
          await route.fulfill({ body, contentType: "application/javascript" });
        });
      }
    }
    await page.goto(
      origin +
        "/scripts/verification/settings121-update/ui.html?mode=configure-error-" +
        (staleRetry ?? "none"),
    );
    await page.addStyleTag({ content: baseline ? css : currentCss });
    const toggle = (name) => page.getByRole("switch", { name, exact: true });
    const option = (name, label) => page.getByRole("radiogroup", { name, exact: true }).getByRole("radio", { name: label, exact: true });
    const checked = (name) => baseline ? toggle(name).isChecked() : option(name, "开启").isChecked();
    const automaticOff = baseline ? toggle("定时检查") : option("定时检查", "关闭");
    await automaticOff.waitFor();
    await page.evaluate(() => {
      const mobile = document.createElement("div");
      mobile.className = "preferences-mobile";
      const host = document.querySelector(".preferences-workspace");
      host.replaceWith(mobile);
      mobile.append(host);
    });
    const switches = await page
      .getByRole(baseline ? "switch" : "radio")
      .evaluateAll((nodes) =>
        nodes.map((el) => ({
          label: el.getAttribute("aria-label"),
          width: el.getBoundingClientRect().width,
          height: el.getBoundingClientRect().height,
          labels: el.closest('[role="radiogroup"][aria-label]') ? 1 : (el.labels?.length ?? 0),
        })),
      );
    await automaticOff.click();
    await page.getByRole("alert").waitFor();
    assert(await checked("定时检查"));
    await page.getByRole("button", { name: "重试", exact: true }).click();
    await page.getByRole("alert").waitFor({ state: "hidden" });
    const calls = await page.evaluate(() => window.fixtureCalls);
    const enabled = await checked("定时检查");
    if (baseline) {
      assert.deepEqual(calls, [
        'configure:{"automaticChecks":false}',
        staleRetry ?? "check",
      ]);
      assert(enabled);
      assert(
        switches.every((s) => s.width < 44 && s.height < 44 && s.labels === 0),
      );
    } else {
      assert.deepEqual(calls, [
        'configure:{"automaticChecks":false}',
        'configure:{"automaticChecks":false}',
      ]);
      assert(!enabled);
      assert(
        switches.every((s) => s.width >= 44 && s.height >= 44 && s.labels > 0),
      );
      const startup = option("启动时检查", "关闭");
      await startup.click({ position: { x: 1, y: 1 } });
      await page.waitForFunction(() => window.fixtureCalls.length === 3);
      assert(await startup.isChecked());
      await option("显示更新徽标", "关闭").focus();
      await page.keyboard.press("Space");
      await page.waitForFunction(() => window.fixtureCalls.length === 4);
      assert(!await checked("显示更新徽标"));
      // During a native operation the edge of the target cannot toggle.
      await page
        .getByRole("button", { name: "下载 0.2.0", exact: true })
        .click();
      const startupOn = option("启动时检查", "开启");
      await startupOn.waitFor({ state: "attached" });
      assert(await startupOn.isDisabled());
      const b = await startupOn.boundingBox();
      await page.mouse.click(b.x + 1, b.y + 1);
      assert(!await checked("启动时检查"));
    }
    assert.deepEqual(errors, []);
    await page.screenshot({
      path: `${output}/${baseline ? "baseline" : "fixed"}-${staleRetry ?? "none"}.png`,
      fullPage: true,
    });
    return { baseline, staleRetry, calls, enabled, switches };
  } catch (error) {
    console.error(
      JSON.stringify({
        baseline,
        errors,
        body: await page.locator("body").innerText(),
        calls: await page.evaluate(() => window.fixtureCalls),
        reject: await page.evaluate(() => window.rejectConfigure),
      }),
    );
    throw error;
  } finally {
    await page.close();
  }
}
try {
  results.push(await scenario(true, null));
  for (const retry of [null, "download", "install"])
    results.push(await scenario(false, retry));
  await writeFile(
    output + "/results.json",
    JSON.stringify(
      {
        results,
        boundary:
          "Actual frozen/current React source and controlled native client. Chromium with shared CSS and mobile wrapper; no real app/service.",
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
}
