import assert from "node:assert/strict";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createServer } from "node:http";
import { createServer as createViteServer } from "vite";
import react from "@vitejs/plugin-react";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
const output = resolve(process.argv[2] || "/tmp/settings121-cloud-ui");
await mkdir(output, { recursive: true });
const { chromium } = await import(
  pathToFileURL(
    process.env.PLAYWRIGHT_CORE_PATH ||
      "/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/playwright-core/index.mjs",
  )
);
const entry = `import React from 'react';import{createRoot}from'react-dom/client';import{CloudSyncSettings}from'/src/cloud-sync/index.ts';import'/src/style.css';import'/__settings-ui.css';
const h=window.fixture={commands:[],confirms:[],commits:[],active:true,fail:false,confirmFail:false,confirmDelay:false,confirmResolvers:[],clientDelay:false,clientResolvers:[],contextDelay:false,contextResolvers:[],context:{window:'fixture',session:'fixture-session',token:{epoch:1},storeInstance:'fixture-store'},status:{revision:0,enabled:true,selected:'webdav',minutes:0,providers:{webdav:{fields:{endpoint:'https://dav.example.com',username:'fixture-user'},credentialsSet:{password:true}}},passphraseSet:true,lastSuccess:null,lastError:null,recoveries:['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa']}};
const root=createRoot(document.querySelector('#root'));const client=async(ctx,c)=>{h.commands.push({ctx,c});if(h.clientDelay && c.type!=='status')await new Promise(resolve=>h.clientResolvers.push(resolve));if(h.fail)throw{code:'network',message:'无法连接存储服务，请检查网络后重试'};if(c.type==='save'){Object.assign(h.status,{...c.patch,revision:h.status.revision+1});}return{status:{...h.status},...(['preview','previewSetup'].includes(c.type)?{preview:{id:'preview-fixture',source:c.type==='previewSetup'?'setup':c.recovery?'recovery:'+c.recovery:'remote',remoteExists:true,workspaceId:'fixture-workspace',localNotes:3,versions:5,attachments:2,bytes:20000,conflicts:1}}:{}),...(['sync','restore'].includes(c.type)?{result:{applied:true,pending:0,conflicts:1},message:'同步完成；并发版本已保留'}:{}),...(c.type==='test'?{message:'连接成功；未写入远端或笔记'}:{})};};
h.render=()=>root.render(<CloudSyncSettings active={h.active} client={client} ports={{context:async()=>{if(h.contextDelay)await new Promise(resolve=>h.contextResolvers.push(resolve));return h.context},confirm:async text=>{h.confirms.push(text);if(h.confirmFail)throw Error('native dialog failed');if(h.confirmDelay)return new Promise(resolve=>h.confirmResolvers.push(resolve));return true},onCommitted:r=>h.commits.push(r)}}/>);h.render();`;
const localCss = await readFile("src/Preferences.css", "utf8");
const sharedCssPath = localCss.includes(".settings121-list")
  ? resolve("src/Preferences.css")
  : "/Users/water/work/2026/.cybernote-worktrees/settings121-ui/src/Preferences.css";
const sharedCss = await readFile(sharedCssPath, "utf8");
const oldRevision = process.env.CLOUD_COMPONENT_REVISION;
if (oldRevision && !/^[a-f0-9]{40}$/.test(oldRevision))
  throw Error("Expected exact old component revision");
const oldComponent = oldRevision
  ? execFileSync(
      "git",
      ["show", `${oldRevision}:src/cloud-sync/CloudSyncSettings.tsx`],
      { encoding: "utf8" },
    )
  : null;
const vite = await createViteServer({
  configFile: false,
  plugins: [
    {
      name: "cloud-fixture-entry",
      enforce: "pre",
      resolveId: (id) =>
        ["/__cloud_entry.jsx", "/__settings-ui.css"].includes(id) ? id : null,
      load: (id) =>
        oldComponent &&
        id
          .replaceAll("\\", "/")
          .endsWith("/src/cloud-sync/CloudSyncSettings.tsx")
          ? oldComponent
          : id === "/__cloud_entry.jsx"
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
  page.setDefaultTimeout(8000);
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.route("**/*", (route) => {
    const u = route.request().url();
    if (u.startsWith(origin) || u.startsWith("data:")) return route.continue();
    external.push(u);
    return route.abort();
  });
  await page.goto(origin + "/__cloud");
  const setup = page.getByRole("button", { name: "设置", exact: true });
  const provider = (name) => page.getByRole("radiogroup", { name: "同步到" }).getByRole("radio", { name, exact: true });
  await setup.waitFor();
  assert.deepEqual(
    await page.evaluate(() => fixture.commands.map((x) => x.c.type)),
    ["status"],
  );
  checks.push("mount only reads status");
  await setup.click();
  await page.getByLabel("用户", { exact: true }).fill("draft-user");
  await provider("WebDAV").focus();
  await page.keyboard.press("ArrowRight");
  assert.equal(await provider("S3").getAttribute("aria-checked"), "true");
  await page
    .getByLabel("Endpoint", { exact: true })
    .fill("https://minio.example.com");
  await provider("WebDAV").click();
  assert.equal(
    await page.getByLabel("用户", { exact: true }).inputValue(),
    "draft-user",
  );
  assert.equal(
    await page.getByLabel("密码", { exact: true }).inputValue(),
    "",
  );
  checks.push(
    "provider drafts survive switch; credentials never returned to inputs",
  );
  await page.getByRole("button", { name: "预览", exact: true }).click();
  await page.getByText(/配置预览/).waitFor();
  const previewCommand = await page.evaluate(() => fixture.commands.at(-1).c);
  assert.equal(previewCommand.type, "previewSetup");
  assert.equal(previewCommand.patch.fields.username, "draft-user");
  assert.equal(await page.getByRole("button", { name: "确认同步…" }).count(), 0);
  await page.getByRole("button", { name: "关闭预览" }).click();
  checks.push("provider segments support arrows and preview draft without saving or transfer actions");
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
  await page.getByLabel("用户", { exact: true }).focus();
  await page.keyboard.press("Escape");
  assert.equal(
    await page
      .locator(".cloud-sync-row button[aria-expanded=false]")
      .evaluate((e) => e === document.activeElement),
    true,
  );
  checks.push("Escape collapses inline form and restores focus");
  await page.getByRole("button", { name: "测试连接", exact: true }).click();
  await page.getByText("连接成功；未写入远端或笔记", { exact: true }).waitFor();
  await page.getByRole("button", { name: "立即同步…", exact: true }).click();
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
  const button = (name) => page.getByRole("button", { name, exact: true });
  const reopen = async () => {
    await page.evaluate(() => {
      fixture.active = false;
      fixture.render();
    });
    await page.waitForFunction(
      () => !document.querySelector(".cloud-sync-settings"),
    );
    await page.evaluate(() => {
      fixture.active = true;
      fixture.render();
    });
    await page.waitForFunction(
      () =>
        document
          .querySelector(".cloud-sync-settings")
          ?.getAttribute("aria-busy") === "false",
    );
  };
  await button("立即同步…").click();
  await page.getByRole("region", { name: "同步预览" }).waitFor();
  const committedBefore = await page.evaluate(() => fixture.commits.length);
  if (process.env.CLOUD_REGRESSION_ONLY !== "c5") {
    await page.evaluate(() => {
      fixture.confirmFail = true;
    });
    await button("确认同步…").click();
    await page
      .getByRole("alert")
      .filter({ hasText: "无法打开确认对话框" })
      .waitFor();
    assert.equal(
      await page.evaluate(() => fixture.commits.length),
      committedBefore,
    );
    assert.equal(await page.getByRole("alert").count(), 1);
    await page.evaluate(() => {
      fixture.confirmFail = false;
      fixture.confirmDelay = true;
    });
    const confirmsBefore = await page.evaluate(() => fixture.confirms.length);
    // Synchronous repeated DOM clicks exercise the owner before React disables.
    await button("确认同步…").evaluate((el) => {
      el.click();
      el.click();
    });
    await page.waitForFunction(() => fixture.confirmResolvers.length === 1);
    assert.equal(
      await page.evaluate(() => fixture.confirms.length),
      confirmsBefore + 1,
    );
    assert.equal(await button("确认同步…").isDisabled(), true);
    await page.evaluate(() => {
      fixture.confirmDelay = false;
      fixture.confirmResolvers.shift()(false);
    });
    await page.waitForFunction(
      () =>
        document
          .querySelector(".cloud-sync-settings")
          .getAttribute("aria-busy") === "false",
    );
    assert.equal(
      await page.evaluate(() => fixture.commits.length),
      committedBefore,
    );
    checks.push(
      "C4 confirmation rejection is one safe alert; pending confirmation owns single action before dialog resolves; cancel does not sync",
    );
  }

  if (process.env.CLOUD_REGRESSION_ONLY !== "c5") {
    await page.evaluate(() => {
      fixture.confirmDelay = true;
    });
    await button("确认同步…").click();
    await page.waitForFunction(() => fixture.confirmResolvers.length === 1);
    await page.getByRole("region", { name: "同步预览" }).evaluate((el) => {
      el.tabIndex = -1;
      el.focus();
    });
    await page.keyboard.press("Escape");
    await page.waitForFunction(
      () => !document.querySelector(".cloud-sync-preview"),
    );
    await page.evaluate(() => {
      fixture.confirmDelay = false;
      fixture.confirmResolvers.shift()(true);
    });
    assert.equal(
      await page.evaluate(() => fixture.commits.length),
      committedBefore,
      "Escape invalidates pending native confirmation",
    );
    await button("立即同步…").click();
    await page.getByRole("region", { name: "同步预览" }).waitFor();
  }
  // Late native confirmation after reactivation cannot sync its consumed view.
  await page.evaluate(() => {
    fixture.confirmDelay = true;
  });
  await button("确认同步…").click();
  await page.waitForFunction(() => fixture.confirmResolvers.length === 1);
  await reopen();
  await page.evaluate(() => {
    fixture.confirmDelay = false;
    fixture.confirmResolvers.shift()(true);
  });
  assert.equal(
    await page.evaluate(() => fixture.commits.length),
    committedBefore,
  );

  // Old request remains a native responsibility, but its old UI owner cannot
  // disable or clear a new generation's owner/status/message.
  await page.evaluate(() => {
    fixture.clientDelay = true;
  });
  await button("测试连接").click();
  await page.waitForFunction(() => fixture.clientResolvers.length === 1);
  await reopen();
  const previewsBefore = await page.evaluate(
    () => fixture.commands.filter((x) => x.c.type === "preview").length,
  );
  await button("立即同步…").click();
  await page.waitForFunction(() => fixture.clientResolvers.length === 2);
  assert.equal(
    await page.evaluate(
      () => fixture.commands.filter((x) => x.c.type === "preview").length,
    ),
    previewsBefore + 1,
    "enabled click must invoke or report native busy, never silently ignore",
  );
  await page.evaluate(() => fixture.clientResolvers.shift()());
  await page.waitForTimeout(50);
  assert.equal(
    await button("立即同步…").isDisabled(),
    true,
    "old finally cannot release new operation",
  );
  assert.equal(
    await page.getByText("连接成功；未写入远端或笔记", { exact: true }).count(),
    0,
  );
  await page.evaluate(() => {
    fixture.clientDelay = false;
    fixture.clientResolvers.shift()();
  });
  await page.getByRole("region", { name: "同步预览" }).waitFor();
  checks.push(
    "C5 hide/reopen releases old UI owner, enabled action sends real request, old result/finally cannot clobber newer pending action",
  );

  // Context requests are fenced before issuing any client invocation too.
  await page.evaluate(() => {
    fixture.contextDelay = true;
  });
  await button("测试连接").click();
  await page.waitForFunction(() => fixture.contextResolvers.length === 1);
  await page.evaluate(() => {
    fixture.active = false;
    fixture.render();
  });
  await page.waitForFunction(
    () => !document.querySelector(".cloud-sync-settings"),
  );
  await page.evaluate(() => {
    fixture.contextDelay = false;
    fixture.active = true;
    fixture.render();
  });
  await page.waitForFunction(
    () =>
      document
        .querySelector(".cloud-sync-settings")
        ?.getAttribute("aria-busy") === "false",
  );
  const testCalls = await page.evaluate(
    () => fixture.commands.filter((x) => x.c.type === "test").length,
  );
  await page.evaluate(() => fixture.contextResolvers.shift()());
  await page.waitForTimeout(50);
  assert.equal(
    await page.evaluate(
      () => fixture.commands.filter((x) => x.c.type === "test").length,
    ),
    testCalls,
    "late context cannot issue hidden-generation client work",
  );
  await setup.click();
  await page.getByText("高级", { exact: true }).click();
  const limits = await page.locator(".cloud-sync-limits").innerText();
  for (const text of ["32 MiB", "48 MiB", "16 MiB", "1024", "128", "不截断"])
    assert(limits.includes(text));
  checks.push(
    "C5 delayed context does not invoke after hide; C6 exact plaintext/ciphertext/attachment/entity budgets are visible",
  );

  await page.getByRole("button", { name: "取消", exact: true }).click();
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
    "src/preferences-menu/PreferenceSegments.tsx",
    "src/preferences-menu/PreferenceSelect.tsx",
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
} catch (error) {
  await writeFile(
    resolve(output, "failure.json"),
    JSON.stringify(
      { error: String(error), errors, external, oldRevision },
      null,
      2,
    ),
  );
  await browser
    ?.contexts()[0]
    ?.pages()[0]
    ?.screenshot({ path: resolve(output, "failure.png"), fullPage: true });
  throw error;
} finally {
  await browser?.close();
  await new Promise((r) => server.close(r));
  await vite.close();
}
