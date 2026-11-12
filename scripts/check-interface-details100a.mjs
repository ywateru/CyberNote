// Real Preferences and real Rust Store through the existing small JSON bridge.
// Native window shell is not exercised; no user library or native build.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  readFile,
  writeFile,
  mkdir,
  mkdtemp,
  copyFile,
} from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createServer } from "node:http";
import { execFileSync } from "node:child_process";
import ts from "typescript";
import { createServer as createViteServer } from "vite";
import react from "@vitejs/plugin-react";
import { rustBackend } from "./debug/rust-backend.mjs";
const output = resolve("artifacts/design100a");
await mkdir(output, { recursive: true });
const modulePath = resolve(output, "interface-details.mjs");
await writeFile(
  modulePath,
  ts.transpileModule(await readFile("src/interface-details.ts", "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText,
);
const {
  parseInterfaceDetails,
  defaultInterfaceDetails,
  interfaceDetailVariables,
  interfaceDetailRanges,
} = await import(pathToFileURL(modulePath));
const checks = [];
const check = (name, fn) => {
  fn();
  checks.push(name);
};
check("Legacy absent details have explicit defaults", () =>
  assert.deepEqual(parseInterfaceDetails(undefined), defaultInterfaceDetails),
);
const invalid = [
  null,
  [],
  {},
  { ...defaultInterfaceDetails, version: 2 },
  { ...defaultInterfaceDetails, css: "color:red" },
  { ...defaultInterfaceDetails, iconScale: NaN },
  { ...defaultInterfaceDetails, iconScale: Infinity },
  { ...defaultInterfaceDetails, iconScale: 100.5 },
  { ...defaultInterfaceDetails, menuSpacing: "unknown" },
];
for (const [key, { min, max }] of Object.entries(interfaceDetailRanges))
  invalid.push(
    { ...defaultInterfaceDetails, [key]: min - 1 },
    { ...defaultInterfaceDetails, [key]: max + 1 },
    { ...defaultInterfaceDetails, [key]: String(min) },
  );
for (const v of invalid)
  assert.throws(
    () => parseInterfaceDetails(v),
    (e) => e.code === "interface_details_invalid",
  );
checks.push(
  "TS rejects null, incomplete, unknown keys/version, nonfinite, fractional, string and out-of-range values",
);
for (const mobile of [false, true])
  for (const bounds of ["min", "max"]) {
    const d = parseInterfaceDetails({
      ...defaultInterfaceDetails,
      ...Object.fromEntries(
        Object.entries(interfaceDetailRanges).map(([key, range]) => [
          key,
          range[bounds],
        ]),
      ),
    });
    const vars = interfaceDetailVariables(d, mobile);
    assert.ok(parseFloat(vars["--interface-hit-min"]) >= (mobile ? 44 : 28));
    for (const [key, value] of Object.entries(vars).filter(([key]) =>
      key.includes("radius"),
    ))
      assert.ok(parseFloat(value) >= 0 && parseFloat(value) <= 24);
  }
checks.push(
  "Shared map preserves mobile44/desktop28 minimum and radius0..24 at both extremes",
);
if (process.argv.includes("--unit-only")) {
  console.log(JSON.stringify({ checks }));
  process.exit(0);
}
const build = JSON.parse(
  await readFile(
    resolve(process.argv[2] || "artifacts/design100a-rust", "build.json"),
    "utf8",
  ),
);
for (const [path, hash] of Object.entries(build.sources)) {
  assert.equal(
    createHash("sha256")
      .update(await readFile(path))
      .digest("hex"),
    hash,
    `Stale transport source: ${path}`,
  );
}
const binary = resolve(output, "owned-transport");
if (
  createHash("sha256")
    .update(await readFile(build.binary.path))
    .digest("hex") !== build.binary.sha256
)
  throw Error("Shared transport changed after build; rebuild explicit harness");
await copyFile(build.binary.path, binary);
const store = await mkdtemp(resolve(output, "store-")),
  backend = await rustBackend(binary, store),
  errors = [];
let browser, server, vite;
const workspace = async () => {
  const r = await backend.call("load_workspace");
  if (!r.ok) throw Error(r.error.message);
  return r.value;
};
const save = async (patch) => {
  const w = await workspace();
  return backend.call("workspace_action", {
    action: { type: "settings", settings: patch },
    expected: { sessionId: w.access.sessionId, epoch: w.access.epoch },
  });
};
const entry = `import React,{useState}from'react';import{createRoot}from'react-dom/client';import Preferences from'/src/Preferences.tsx';import'/src/style.css';import'/src/desktop.css';
const initial=await fetch('/workspace').then(r=>r.json());const mobile=new URLSearchParams(location.search).has('mobile');
function Fixture(){const[settings,setSettings]=useState(initial.settings),[tab,setTab]=useState('settings');window.currentSettings=settings;window.external=async patch=>{const r=await fetch('/save',{method:'POST',body:JSON.stringify(patch)}).then(r=>r.json());if(!r.ok)throw Error(r.error.message);const w=await fetch('/workspace').then(r=>r.json());setSettings(w.settings);};return React.createElement('div',{className:'app '+(mobile?'mobile':'desktop')+(settings.theme==='dark'?' dark':''),style:{'--ui-scale':'.889','--ui-font-scale':'.889','--editor-scale':'.889'}},React.createElement(Preferences,{tab,onTab:setTab,onClose:()=>{},onBack:()=>{},settings,mobile,returnFocus:null,data:null,synchronization:null,onCloseLocks:async()=>{},onSettings:async patch=>{setSettings(old=>({...old,...structuredClone(patch)}));const r=await fetch('/save',{method:'POST',body:JSON.stringify(patch)}).then(r=>r.json());if(!r.ok)throw Error(r.error.message);}}));}createRoot(document.getElementById('root')).render(React.createElement(Fixture));`;
try {
  const init = await save({
    theme: "light",
    interfaceFontSize: "small",
    editorFontSize: "medium",
    customSetting: { keep: true },
  });
  assert.ok(init.ok);
  vite = await createViteServer({
    configFile: false,
    cacheDir: resolve(output, "vite-cache"),
    plugins: [
      react(),
      {
        name: "settings-fixture",
        resolveId: (id) => (id === "/__settings.tsx" ? id : undefined),
        load: (id) => (id === "/__settings.tsx" ? entry : undefined),
      },
    ],
    server: { middlewareMode: true, hmr: false },
    appType: "custom",
  });
  server = createServer(async (req, res) => {
    try {
      const path = new URL(req.url, "http://localhost").pathname;
      if (path === "/workspace") {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(await workspace()));
      } else if (path === "/save") {
        let body = "";
        for await (const b of req) body += b;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(await save(JSON.parse(body))));
      } else if (path === "/__check") {
        res.setHeader("content-type", "text/html");
        res.end(
          await vite.transformIndexHtml(
            req.url,
            '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/__settings.tsx"></script>',
          ),
        );
      } else vite.middlewares(req, res);
    } catch (error) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: error.message }));
    }
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const { chromium } = await import(
    pathToFileURL(
      process.env.PLAYWRIGHT_CORE_PATH ||
        "/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/playwright-core/index.mjs",
    )
  );
  browser = await chromium.launch({
    executablePath:
      process.env.CHROME_PATH ||
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
  });
  for (const [width, mobile] of [
    [1200, false],
    [320, true],
    [390, true],
  ]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(
      `http://127.0.0.1:${server.address().port}/__check${mobile ? "?mobile=1" : ""}`,
    );
    const toggle = page.getByRole("button", { name: "界面细节", exact: true });
    await toggle.waitFor();
    assert.equal(await toggle.getAttribute("aria-expanded"), "false");
    await toggle.focus();
    await page.keyboard.press("Enter");
    assert.equal(await toggle.getAttribute("aria-expanded"), "true");
    const change = async (label, value) => {
      const slider = page.getByRole("slider", { name: label, exact: true });
      await slider.evaluate((el, value) => {
        const setter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value",
        ).set;
        setter.call(el, String(value));
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }, value);
      await page.waitForFunction(
        () =>
          !document.querySelector(
            '.preferences-details-content[aria-busy="true"]',
          ),
      );
      assert.equal(await slider.inputValue(), String(value));
    };
    if (mobile) {
      await page.evaluate(async () =>
        window.external({
          interfaceDetails: {
            version: 1,
            iconScale: 100,
            desktopHitScale: 130,
            mobileHitScale: 100,
            menuSpacing: "standard",
            radiusScale: 100,
          },
        }),
      );
      await page.waitForFunction(
        () => window.currentSettings.interfaceDetails.desktopHitScale === 130,
      );
    }
    await change("图标大小", 120);
    await change("操作区域", mobile ? 120 : 130);
    await change("圆角", 150);
    await page
      .getByRole("combobox", { name: "菜单间距", exact: true })
      .selectOption("comfortable");
    await page.waitForFunction(
      () =>
        !document.querySelector(
          '.preferences-details-content[aria-busy="true"]',
        ),
    );
    const details = (await workspace()).settings.interfaceDetails;
    assert.equal(details.iconScale, 120);
    assert.equal(details.radiusScale, 150);
    if (mobile) assert.equal(details.desktopHitScale, 130);
    assert.equal(
      details[mobile ? "mobileHitScale" : "desktopHitScale"],
      mobile ? 120 : 130,
    );
    const example = page.getByLabel("界面细节即时示例");
    const dims = await example.evaluate((el) => {
      const button = el.querySelector("button"),
        svg = el.querySelector("svg");
      return {
        hit: button.getBoundingClientRect().height,
        icon: svg.getBoundingClientRect().width,
        radius: getComputedStyle(el).borderRadius,
      };
    });
    assert.ok(dims.hit >= (mobile ? 44 : 28));
    assert.equal(dims.icon, 24);
    assert.equal(dims.radius, "24px");
    checks.push(
      `${width}px real Preferences saves full bounded settings to real Store and example uses exported geometry`,
    );
    const menuHeight = () =>
      example
        .locator(".preferences-details-example-menu button")
        .first()
        .evaluate((el) => el.getBoundingClientRect().height);
    const spacious = await menuHeight();
    await page
      .getByRole("combobox", { name: "菜单间距", exact: true })
      .selectOption("compact");
    await page.waitForFunction(
      () =>
        !document.querySelector(
          '.preferences-details-content[aria-busy="true"]',
        ),
    );
    assert.ok((await menuHeight()) <= spacious - 7.9);
    await page
      .getByRole("combobox", { name: "菜单间距", exact: true })
      .selectOption("comfortable");
    await page.waitForFunction(
      () =>
        !document.querySelector(
          '.preferences-details-content[aria-busy="true"]',
        ),
    );
    await example.scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(output, `${width}-maximum.png`) });
    // A real SQLite trigger rejects the unchanged request; parent still exposes
    // its optimistic cloned props. No simulated successful persistence.
    execFileSync("sqlite3", [
      resolve(store, "notes.sqlite3"),
      "CREATE TRIGGER test_settings_failure BEFORE UPDATE ON settings BEGIN SELECT RAISE(ABORT,'controlled settings write failure'); END;",
    ]);
    const slider = page.getByRole("slider", { name: "图标大小", exact: true });
    await slider.focus();
    await page.keyboard.press("ArrowLeft");
    await page
      .getByRole("alert")
      .filter({ hasText: "界面细节未保存" })
      .waitFor();
    assert.equal(await slider.inputValue(), "120");
    assert.equal((await workspace()).settings.interfaceDetails.iconScale, 120);
    assert.equal(
      await page.evaluate(
        () => window.currentSettings.interfaceDetails.iconScale,
      ),
      119,
    );
    execFileSync("sqlite3", [
      resolve(store, "notes.sqlite3"),
      "DROP TRIGGER test_settings_failure;",
    ]);
    checks.push(
      `${width}px actual DB write failure retains acknowledged control/preview despite optimistic parent props`,
    );
    await page.evaluate(async () => {
      await window.external({
        interfaceDetails: structuredClone(
          window.currentSettings.interfaceDetails,
        ),
      });
    });
    await page.waitForFunction(
      () =>
        document.querySelector('input[aria-label="图标大小"]').value === "119",
    );
    assert.deepEqual(
      (await workspace()).settings.interfaceDetails,
      await page.evaluate(() => window.currentSettings.interfaceDetails),
    );
    checks.push(
      `${width}px subsequent persisted external update with identical rejected object contents is accepted`,
    );
    await change("图标大小", 80);
    await change("操作区域", 100);
    await change("圆角", 0);
    for (const theme of ["light", "dark"]) {
      await page.evaluate((theme) => window.external({ theme }), theme);
      await toggle.scrollIntoViewIfNeeded();
      await page
        .getByRole("button", { name: "恢复界面细节默认值" })
        .scrollIntoViewIfNeeded();
      await page.screenshot({ path: resolve(output, `${width}-${theme}.png`) });
      const geometry = await page.locator(".preferences").evaluate((el) => ({
        scroll: el.scrollWidth,
        client: el.clientWidth,
        right: el.getBoundingClientRect().right,
        viewport: innerWidth,
      }));
      assert.ok(
        geometry.scroll <= geometry.client + 1 &&
          geometry.right <= geometry.viewport + 0.5,
        JSON.stringify({ width, theme, geometry }),
      );
      const inner = await page
        .locator(".preferences-details-content")
        .evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
      assert.ok(
        inner.scroll <= inner.client + 1,
        JSON.stringify({ width, theme, inner }),
      );
    }
    await page.getByRole("button", { name: "恢复界面细节默认值" }).click();
    await page.waitForFunction(
      () =>
        !document.querySelector(
          '.preferences-details-content[aria-busy="true"]',
        ),
    );
    const reset = (await workspace()).settings;
    assert.deepEqual(reset.interfaceDetails, defaultInterfaceDetails);
    assert.equal(reset.interfaceFontSize, "small");
    assert.equal(reset.editorFontSize, "medium");
    assert.deepEqual(reset.customSetting, { keep: true });
    assert.equal(reset.theme, "dark");
    await page.reload();
    await toggle.waitFor();
    assert.equal(await toggle.getAttribute("aria-expanded"), "false");
    await toggle.click();
    assert.equal(
      await page.getByRole("slider", { name: "图标大小" }).inputValue(),
      "100",
    );
    await toggle.click();
    assert.equal(await toggle.getAttribute("aria-expanded"), "false");
    checks.push(
      `${width}px reset touches only details, persisted reload restores defaults, keyboard toggle/collapse and both themes fit`,
    );
    if (!mobile)
      assert.equal(
        await page.getByRole("radio", { name: "极小", exact: true }).count(),
        2,
      );
    else
      assert.equal(
        await page
          .getByRole("combobox", { name: "界面字体大小", exact: true })
          .locator("option")
          .count(),
        5,
      );
    await page.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(
    resolve(output, "result.json"),
    JSON.stringify(
      {
        ok: true,
        checks,
        errors,
        store,
        backend: backend.kind,
        browser: browser.version(),
        rustBinarySha256: build.binary.sha256,
        source: execFileSync("git", ["rev-parse", "HEAD"], {
          encoding: "utf8",
        }).trim(),
        sources: Object.fromEntries(
          await Promise.all(
            [
              "src/interface-details.ts",
              "src/PreferencesInterfaceDetails.tsx",
              "src/Preferences.tsx",
              "src/Preferences.css",
            ].map(async (path) => [
              path,
              createHash("sha256")
                .update(await readFile(path))
                .digest("hex"),
            ]),
          ),
        ),
        scope:
          "Real Preferences/Chrome + real production Rust Store, actual SQLite settings failure. No native AppKit/Android or global product variable wiring claim.",
      },
      null,
      2,
    ) + "\n",
  );
  console.log(JSON.stringify({ ok: true, checks }, null, 2));
} finally {
  await browser?.close();
  if (server) await new Promise((done) => server.close(done));
  await vite?.close();
  await backend.close();
}
