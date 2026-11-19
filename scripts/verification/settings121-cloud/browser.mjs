import assert from "node:assert/strict";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createServer } from "node:http";
import { createServer as createViteServer } from "vite";
import react from "@vitejs/plugin-react";
import { createHash } from "node:crypto";
const output = resolve(process.argv[2] || "/tmp/settings121-cloud-ui");
await mkdir(output, { recursive: true });
const { chromium } = await import(
  pathToFileURL(
    process.env.PLAYWRIGHT_CORE_PATH ||
      "/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/playwright-core/index.mjs",
  )
);
const entry = `import React from 'react';import{createRoot}from'react-dom/client';import{CloudSyncSettings}from'/src/cloud-sync/index.ts';import'/src/style.css';import'/__settings-ui.css';
const h=window.fixture={commands:[],confirms:[],commits:[],active:true,fail:false,context:{window:'fixture',session:'fixture-session',token:{epoch:1},storeInstance:'fixture-store'},status:{revision:0,enabled:true,selected:'webdav',minutes:0,providers:{webdav:{fields:{endpoint:'https://dav.example.com',username:'fixture-user'},credentialsSet:{password:true}}},passphraseSet:true,lastSuccess:null,lastError:null,recoveries:['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa']}};
const root=createRoot(document.querySelector('#root'));const client=async(ctx,c)=>{h.commands.push({ctx,c});if(h.fail)throw{code:'network',message:'无法连接存储服务，请检查网络后重试'};if(c.type==='save'){Object.assign(h.status,{...c.patch,revision:h.status.revision+1});}return{status:{...h.status},...(c.type==='preview'?{preview:{id:'preview-fixture',source:c.recovery?'recovery:'+c.recovery:'remote',remoteExists:true,workspaceId:'fixture-workspace',localNotes:3,versions:5,attachments:2,bytes:20000,conflicts:1}}:{}),...(['sync','restore'].includes(c.type)?{result:{applied:true,pending:0,conflicts:1},message:'同步完成；并发版本已保留'}:{}),...(c.type==='test'?{message:'连接成功；未写入远端或笔记'}:{})};};
h.render=()=>root.render(<CloudSyncSettings active={h.active} client={client} ports={{context:async()=>h.context,confirm:async text=>{h.confirms.push(text);return true},onCommitted:r=>h.commits.push(r)}}/>);h.render();`;
const localCss = await readFile("src/Preferences.css", "utf8");
const sharedCssPath = localCss.includes(".settings121-list")
  ? resolve("src/Preferences.css")
  : "/Users/water/work/2026/.cybernote-worktrees/settings121-ui/src/Preferences.css";
const sharedCss = await readFile(sharedCssPath, "utf8");
const vite = await createViteServer({
  configFile: false,
  plugins: [
    {
      name: "cloud-fixture-entry",
      resolveId: (id) =>
        ["/__cloud_entry.jsx", "/__settings-ui.css"].includes(id) ? id : null,
      load: (id) =>
        id === "/__cloud_entry.jsx"
          ? entry
          : id === "/__settings-ui.css"
            ? sharedCss
            : null,
    },
    react(),
  ],
  server: { middlewareMode: true },
  appType: "custom",
});
const server = createServer((req, res) => {
  if (req.url === "/__cloud")
    vite
      .transformIndexHtml(
        "/__cloud",
        '<html lang="zh-CN"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{height:auto!important;overflow:visible!important}body{margin:0;background:var(--grouped)}main{padding:20px;max-width:980px;margin:auto}</style></head><body><main class="preferences-workspace" id="root" style="height:auto;overflow:visible"></main><script type="module" src="/__cloud_entry.jsx"></script></body></html>',
      )
      .then((x) => {
        res.setHeader("content-type", "text/html");
        res.end(x);
      });
  else if (req.url === "/__cloud_entry.jsx")
    vite
      .transformRequest("/__cloud_entry.jsx")
      .then((x) => {
        res.setHeader("content-type", "application/javascript");
        res.end(x.code);
      })
      .catch((e) => {
        res.statusCode = 500;
        res.end(String(e));
      });
  else vite.middlewares(req, res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
const checks = [],
  errors = [],
  external = [];
try {
  browser = await chromium.launch({
    executablePath:
      process.env.CHROME_PATH ||
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
  });
  const page = await browser.newPage();
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.route("**/*", (route) => {
    const u = route.request().url();
    if (u.startsWith(origin) || u.startsWith("data:")) return route.continue();
    external.push(u);
    return route.abort();
  });
  await page.goto(origin + "/__cloud");
  await page.getByRole("button", { name: "设置…", exact: true }).waitFor();
  assert.deepEqual(
    await page.evaluate(() => fixture.commands.map((x) => x.c.type)),
    ["status"],
  );
  checks.push("mount only reads status");
  await page.getByRole("button", { name: "设置…", exact: true }).click();
  await page.getByLabel("用户名", { exact: true }).fill("draft-user");
  await page.getByRole("button", { name: "存储服务", exact: true }).click();
  await page.getByRole("option", { name: "S3 兼容存储", exact: true }).click();
  await page
    .getByLabel("Endpoint", { exact: true })
    .fill("https://minio.example.com");
  await page.getByRole("button", { name: "存储服务", exact: true }).click();
  await page.getByRole("option", { name: "WebDAV", exact: true }).click();
  assert.equal(
    await page.getByLabel("用户名", { exact: true }).inputValue(),
    "draft-user",
  );
  assert.equal(
    await page.getByLabel("密码或应用密码", { exact: true }).inputValue(),
    "",
  );
  checks.push(
    "provider drafts survive switch; credentials never returned to inputs",
  );
  const providerButton = page.getByRole("button", {
    name: "存储服务",
    exact: true,
  });
  await providerButton.focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Escape");
  assert.equal(await providerButton.getAttribute("aria-expanded"), "false");
  assert.equal(
    await page.getByLabel("用户名", { exact: true }).isVisible(),
    true,
  );
  checks.push(
    "desktop owned dropdown keyboard navigation and inner Escape preserve the form",
  );
  for (const [width, appearance] of [
    [1200, "light"],
    [1200, "dark"],
    [390, "light"],
    [390, "dark"],
  ]) {
    await page.setViewportSize({ width, height: 1050 });
    await page.evaluate((dark) => {
      document.documentElement.classList.toggle("dark", dark === "dark");
      document.documentElement.style.colorScheme = dark;
    }, appearance);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: resolve(output, `${width}-${appearance}.png`),
      fullPage: true,
    });
  }
  checks.push(
    "desktop/narrow light/dark screenshots and no horizontal overflow",
  );
  await page.getByLabel("用户名", { exact: true }).focus();
  await page.keyboard.press("Escape");
  assert.equal(
    await page
      .getByRole("button", { name: "设置…", exact: true })
      .evaluate((e) => e === document.activeElement),
    true,
  );
  checks.push("Escape collapses inline form and restores focus");
  await page.getByRole("button", { name: "测试连接", exact: true }).click();
  await page.getByText("连接成功；未写入远端或笔记", { exact: true }).waitFor();
  await page.getByRole("button", { name: "预览", exact: true }).click();
  await page.getByRole("region", { name: "同步预览" }).waitFor();
  assert.equal(
    await page.evaluate(
      () => fixture.commands.filter((x) => x.c.type === "sync").length,
    ),
    0,
  );
  await page.getByRole("button", { name: "确认同步…", exact: true }).click();
  await page.getByText("同步完成；并发版本已保留", { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => fixture.confirms.length), 1);
  assert.equal(await page.evaluate(() => fixture.commits.length), 1);
  checks.push(
    "preview and native-confirm port precede sync; committed receipt reaches host",
  );
  await page.evaluate(() => (fixture.fail = true));
  await page.getByRole("button", { name: "测试连接", exact: true }).click();
  await page.getByRole("alert").waitFor();
  assert.equal(await page.getByRole("alert").count(), 1);
  checks.push("one localized error surface");
  await page.evaluate(() => {
    fixture.active = false;
    fixture.render();
  });
  await page.waitForFunction(
    () => !document.querySelector(".cloud-sync-settings"),
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  const sourceFiles = [
    "src/cloud-sync/CloudSelect.tsx",
    "src/cloud-sync/CloudSyncSettings.tsx",
    "src/cloud-sync/cloud-sync.css",
    "src/cloud-sync/client.ts",
  ];
  const hashes = {};
  for (const f of sourceFiles)
    hashes[f] = createHash("sha256")
      .update(await readFile(f))
      .digest("hex");
  const result = {
    status: "pass",
    checks,
    errors,
    external,
    hashes,
    limits: [
      "Mounted production React component in Chromium with controlled native client/confirm ports.",
      "Does not prove Tauri registration, real service credentials, macOS WebKit, Android WebView, native IME or device acceptance.",
    ],
  };
  await writeFile(
    resolve(output, "result.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result));
} finally {
  await browser?.close();
  await new Promise((r) => server.close(r));
  await vite.close();
}
