import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createServer } from "node:http";
import { createServer as createViteServer } from "vite";
import react from "@vitejs/plugin-react";
if (!process.env.PLAYWRIGHT_CORE_PATH || !process.env.CHROME_PATH)
  throw Error("Use existing browser paths only; no download");
const { chromium } = await import(
  pathToFileURL(process.env.PLAYWRIGHT_CORE_PATH)
);
const output = resolve(process.argv[2] || "artifacts/ocr-panel-browser");
await mkdir(output, { recursive: true });
const entry = `import React from 'react';import {createRoot} from 'react-dom/client';import OcrPanel from '/src/OcrPanel.tsx';import '/src/style.css';const root=createRoot(document.querySelector('#root'));window.renderNumber=0;window.showOcr=(state,android=false,inserted=false)=>{const version=++window.renderNumber;root.render(React.createElement('div',{'data-check-render':version},React.createElement(OcrPanel,{state,android,inserted,onImage:()=>window.calls.push('image'),onCamera:()=>window.calls.push('camera'),onFile:file=>window.calls.push({file:file.name}),onConfirm:()=>window.calls.push('confirm'),onCancel:()=>window.calls.push('cancel')})));return version};window.calls=[];`;
const vite = await createViteServer({
  configFile: false,
  cacheDir: resolve("artifacts/ocr-panel-vite-cache"),
  plugins: [
    react(),
    {
      name: "actual-ocr-panel",
      resolveId: (id) => (id === "/__ocr.tsx" ? id : undefined),
      load: (id) => (id === "/__ocr.tsx" ? entry : undefined),
    },
  ],
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
});
const server = createServer((req, res) => {
  if (req.url === "/__check") {
    res.setHeader("Content-Type", "text/html");
    vite
      .transformIndexHtml(
        req.url,
        '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/__ocr.tsx"></script>',
      )
      .then((html) => res.end(html))
      .catch((error) => {
        res.statusCode = 500;
        res.end(String(error));
      });
  } else vite.middlewares(req, res);
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
let browser;
const checks = [],
  errors = [],
  external = [];
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH,
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage(),
    origin = `http://127.0.0.1:${server.address().port}`;
  await page.route("**/*", (route) => {
    const url = route.request().url();
    if (
      url.startsWith(origin) ||
      url.startsWith("data:") ||
      url.startsWith("blob:")
    )
      return route.continue();
    external.push(url);
    return route.abort();
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(origin + "/__check");
  await page.waitForFunction(() => !!window.showOcr);
  const show = async (
    phase,
    text = "",
    error = "",
    android = false,
    inserted = false,
  ) => {
    const version = await page.evaluate(
      (args) => window.showOcr(...args),
      [{ phase, text, error }, android, inserted],
    );
    await page.waitForFunction(
      ({ phase, version }) =>
        document.querySelector("[data-check-render]")?.dataset.checkRender ===
          String(version) &&
        document.querySelector("[data-ocr-phase]")?.dataset.ocrPhase === phase,
      { phase, version },
    );
  };
  const test = async (name, run) => {
    await run();
    checks.push(name);
  };
  await test("Mac local image source has no camera/Continuity impersonation and picker binds selected File", async () => {
    await show("choose");
    assert.equal(
      await page.getByRole("button", { name: "拍摄文字" }).count(),
      0,
    );
    assert.ok(
      await page
        .getByRole("button", { name: "插入", exact: true })
        .isDisabled(),
    );
    await page.locator("input[type=file]").setInputFiles({
      name: "user-selected.png",
      mimeType: "image/png",
      buffer: Buffer.from("controlled file selection"),
    });
    assert.deepEqual(await page.evaluate(() => window.calls.at(-1)), {
      file: "user-selected.png",
    });
  });
  await test("Android sources emit distinct actual user choices", async () => {
    await show("choose", "", "", true);
    await page
      .getByRole("button", { name: "从图片识别文本…", exact: true })
      .click();
    await page.getByRole("button", { name: "拍摄文字", exact: true }).click();
    assert.deepEqual(await page.evaluate(() => window.calls.slice(-2)), [
      "image",
      "camera",
    ]);
  });
  await test("Actual OCR text is literal and preserves newlines; confirmation uses accessible custom button", async () => {
    await show("recognized", "第一行\n\n<script>alert(1)</script>");
    assert.equal(
      await page.getByLabel("识别文字预览").textContent(),
      "第一行\n\n<script>alert(1)</script>",
    );
    assert.equal(await page.locator(".ocr-panel script").count(), 0);
    await page.getByRole("button", { name: "插入", exact: true }).click();
    assert.equal(await page.evaluate(() => window.calls.at(-1)), "confirm");
    await page.screenshot({ path: resolve(output, "recognized-390.png") });
  });
  await test("Busy, empty and failed noninserted states never enable insertion or substitute empty success", async () => {
    for (const phase of [
      "processing",
      "confirming",
      "cancelling",
      "empty",
      "failed",
    ]) {
      await show(phase, "", phase === "failed" ? "真实识别失败" : "");
      assert.ok(
        await page
          .getByRole("button", { name: "插入", exact: true })
          .isDisabled(),
      );
      if (phase === "failed")
        assert.match(
          await page.getByRole("alert").textContent(),
          /真实识别失败/,
        );
      if (phase === "empty")
        assert.match(
          await page.getByRole("status").textContent(),
          /未识别到文字/,
        );
    }
  });
  await test("Pending body retry and post-ACK cleanup retry are distinct actions", async () => {
    await show("failed", "实际文字", "保存失败", false, true);
    assert.ok(
      await page
        .getByRole("button", { name: "重试保存", exact: true })
        .isEnabled(),
    );
    await show("cleanup-pending", "实际文字", "清理失败", false, true);
    assert.match(await page.getByRole("status").textContent(), /文字已保存/);
    assert.ok(
      await page
        .getByRole("button", { name: "重试清理", exact: true })
        .isEnabled(),
    );
    assert.equal(
      await page.getByRole("button", { name: "插入", exact: true }).count(),
      0,
    );
  });
  await test("Keyboard focus cycles within panel and Escape routes cancellation", async () => {
    await show("recognized", "实际文字");
    await page.getByRole("button", { name: "插入", exact: true }).focus();
    await page.keyboard.press("Tab");
    assert.equal(
      await page.evaluate(() =>
        document.activeElement.getAttribute("aria-label"),
      ),
      "识别文字预览",
    );
    await page.keyboard.press("Shift+Tab");
    assert.equal(
      await page.evaluate(() => document.activeElement.textContent),
      "插入",
    );
    await page.keyboard.press("Escape");
    assert.equal(await page.evaluate(() => window.calls.at(-1)), "cancel");
  });
  await test("320x568 long text remains scrollable with 44px reachable actions and no viewport overflow", async () => {
    await page.setViewportSize({ width: 320, height: 568 });
    await show("recognized", Array(100).fill("本地文字识别核验").join("\n"));
    const geometry = await page.evaluate(() => {
      const r = document.querySelector(".ocr-panel").getBoundingClientRect();
      return {
        panel: { x: r.x, y: r.y, right: r.right, bottom: r.bottom },
        textScrollable:
          document.querySelector(".ocr-text").scrollHeight >
          document.querySelector(".ocr-text").clientHeight,
        buttons: [...document.querySelectorAll(".ocr-actions button")].map(
          (n) => {
            const r = n.getBoundingClientRect();
            return { height: r.height, width: r.width, bottom: r.bottom };
          },
        ),
      };
    });
    assert.ok(
      geometry.panel.x >= 0 &&
        geometry.panel.y >= 0 &&
        geometry.panel.right <= 320 &&
        geometry.panel.bottom <= 568,
    );
    assert.ok(geometry.textScrollable);
    assert.ok(
      geometry.buttons.every(
        (r) => r.height >= 44 && r.width >= 44 && r.bottom <= 568,
      ),
    );
    await page.screenshot({ path: resolve(output, "recognized-long-320.png") });
    await writeFile(
      resolve(output, "geometry.json"),
      JSON.stringify(geometry, null, 2) + "\n",
    );
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  await writeFile(
    resolve(output, "result.json"),
    JSON.stringify(
      {
        status: "pass",
        checks: checks.length,
        results: checks,
        browser: await browser.version(),
        pageErrors: errors,
        externalRequests: external,
        limits: [
          "Actual mounted engineering OcrPanel with controlled props/callbacks and synthetic selected File",
          "No mounted App or real native OCR/device/camera/DB/ACK/cold start/original preview pixel acceptance",
        ],
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    `OCR panel passed ${checks.length} checks: ${output}/result.json`,
  );
} finally {
  await browser?.close();
  await vite.close();
  await new Promise((done) => server.close(done));
}
