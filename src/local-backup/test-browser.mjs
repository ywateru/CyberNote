// Real React/Vite component, synthetic host, no installed app or user library.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createServer as createViteServer } from "vite";
import react from "@vitejs/plugin-react";

if (!process.env.PLAYWRIGHT_CORE_PATH || !process.env.CHROME_PATH)
  throw Error(
    "Set PLAYWRIGHT_CORE_PATH and CHROME_PATH to existing local dependencies.",
  );
const { chromium } = await import(
  pathToFileURL(process.env.PLAYWRIGHT_CORE_PATH)
);
const output = resolve(process.argv[2] || "/tmp/settings121-backup-ui");
await mkdir(output, { recursive: true });
const sharedCss = await readFile(
  process.env.SETTINGS121_SHARED_CSS || resolve("src/Preferences.css"),
  "utf8",
);
if (!sharedCss.includes(".settings121-list"))
  throw Error(
    "Provide SETTINGS121_SHARED_CSS pointing to the reviewed UI worker Preferences.css until it is integrated.",
  );
const entry = `
import React from 'react';import{createRoot}from'react-dom/client';
import{LocalBackupSettings}from'/src/local-backup/LocalBackupSettings.tsx';
import'/src/themes/tokens.css';
import'/__settings.css';
const root=createRoot(document.getElementById('root'));
const version={name:'cybernote-11d01c98-af23-4687-86d7-0cf11b6fe19f.cyberbackup',manifest:{format:'cybernote-local-backup',version:1,scope:'currentBusinessProjection',id:'11d01c98-af23-4687-86d7-0cf11b6fe19f',appVersion:'0.1.0',libraryId:'library-fixture',createdAtMs:1795046400000,reason:'manual',archiveBytes:102400,sha256:'a'.repeat(64)}};
const base=()=>({config:{version:1,hours:0,keep:7,directory:''},directory:'/Users/fixture/CyberNote/backups',dataDirectory:'/Users/fixture/CyberNote/library',libraryId:'library-fixture',versions:[version],issues:[],automaticSuspended:false,lastError:null,nextDueAtMs:null,directoryMode:window.fixture?.privateOnly?'privateOnly':'selectableFilesystem'});
let status=base(),props={active:true,blocked:false,accessKey:'one'};
window.fixture={calls:[],delayRead:false,delayChoose:false,delayBackup:false,readResolvers:[],chooseResolvers:[],backupResolvers:[],errorBackup:false,privateOnly:false,refreshFailed:false};
const f=window.fixture;
const host={status:async()=>{f.calls.push(['status']);return f.delayRead?new Promise(resolve=>f.readResolvers.push(resolve)):structuredClone(status);},
configure:async patch=>{f.calls.push(['configure',patch]);status.config={...status.config,...patch};status.directory=status.config.directory||'/Users/fixture/CyberNote/backups';return structuredClone(status);},
backupNow:async()=>{f.calls.push(['backup']);if(f.delayBackup)await new Promise(resolve=>f.backupResolvers.push(resolve));if(f.errorBackup)throw Error('fixture: disk full');return version;},
prepareRestore:async name=>{f.calls.push(['preview',name]);return{version,archive:{notes:12,folders:3,attachments:4,summary:'导入时保留本机内容，ID 冲突创建副本并更新设置。'},confirmation:'single-use',expiresAtMs:Date.now()+300000};},
restore:async confirmation=>{f.calls.push(['restore',confirmation]);return{outcome:'committed',maintenanceError:null,refreshError:f.refreshFailed?'fixture refresh failed':undefined,recovery:{...version,manifest:{...version.manifest,reason:'beforeRestore'}},delivery:{value:{}}};},
chooseDirectory:async()=>{f.calls.push(['choose']);return f.delayChoose?new Promise(resolve=>f.chooseResolvers.push(resolve)):'/Volumes/Fixture/Backup';},revealDirectory:async directory=>f.calls.push(['reveal',directory])};
const encrypted={export:async password=>{f.calls.push(['encrypted-export',password.length]);return{status:'success'};},prepareImport:async password=>{f.calls.push(['encrypted-preview',password.length]);return{confirmation:'encrypted-once',archive:{notes:2,folders:1,attachments:1,summary:'已解密并验证'},expiresAtMs:Date.now()+300000};},confirmImport:async confirmation=>{f.calls.push(['encrypted-import',confirmation]);return{outcome:'committed',maintenanceError:null};},discardImport:async confirmation=>{f.calls.push(['encrypted-discard',confirmation]);}};
f.render=(patch={})=>{props={...props,...patch};root.render(<div className="preferences" style={{width:'100%',height:'auto',border:0,boxShadow:'none'}}><div className="preferences-workspace"><LocalBackupSettings {...props} host={host} encryptedArchive={encrypted} onArchive={async mode=>{f.calls.push(['archive',mode]);return{status:'success'};}}/></div></div>);};
f.reset=()=>{status=base();f.calls=[];f.errorBackup=false;f.delayRead=false;f.delayChoose=false;f.delayBackup=false;f.render({active:true,blocked:false,accessKey:Math.random().toString()});};
f.resolveReads=label=>{f.delayRead=false;const next=base();next.directory=label;for(const resolve of f.readResolvers.splice(0))resolve(next);};
f.render();
`;
const vite = await createViteServer({
  configFile: false,
  root: process.cwd(),
  cacheDir: resolve(output, "vite-cache"),
  plugins: [
    react(),
    {
      name: "local-backup-fixture",
      resolveId: (id) =>
        ["/__backup.tsx", "/__settings.css"].includes(id) ? id : undefined,
      load: (id) =>
        id === "/__backup.tsx"
          ? entry
          : id === "/__settings.css"
            ? sharedCss
            : undefined,
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
        `<!doctype html><html data-theme-id="classic" data-scheme="light"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:var(--grouped);font:14px -apple-system,BlinkMacSystemFont,sans-serif}#root{padding:20px;max-width:840px;box-sizing:border-box;margin:auto}*{box-sizing:border-box}</style><div id="root"></div><script type="module" src="/__backup.tsx"></script></html>`,
      )
      .then((html) => res.end(html));
  } else vite.middlewares(req, res);
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
let browser;
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH,
    headless: true,
  });
  const page = await browser.newPage({
    viewport: { width: 960, height: 850 },
    deviceScaleFactor: 1,
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${server.address().port}/__check`);
  const calls = () => page.evaluate(() => window.fixture.calls);
  const button = (name) => page.getByRole("button", { name, exact: true });
  const choice = (name) => page.getByRole("radio", { name, exact: true });
  await button("立即备份").waitFor();
  await page.waitForFunction(
    () => !document.querySelector('[aria-busy="true"]'),
  );
  assert.equal(await choice("关闭").getAttribute("aria-checked"), "true");
  assert.equal((await calls()).filter((c) => c[0] === "backup").length, 0);
  await choice("6 小时").click();
  await page.waitForFunction(() =>
    window.fixture.calls.some((c) => c[0] === "configure"),
  );
  assert.deepEqual(
    (await calls()).find((c) => c[0] === "configure"),
    ["configure", { hours: 6 }],
  );
  await choice("6 小时").focus();
  await page.keyboard.press("ArrowRight");
  await page.waitForFunction(
    () =>
      document.querySelector('[role="radio"][aria-checked="true"]')
        ?.textContent === "1 天",
  );
  assert.equal(await choice("1 天").getAttribute("tabindex"), "0");
  await choice("14").click();
  await button("更改…").click();
  await page.getByText("/Volumes/Fixture/Backup", { exact: true }).waitFor();
  await button("导出…").click();
  assert((await calls()).some((c) => c[0] === "archive" && c[1] === "export"));
  await button("版本").click();
  await button("恢复…").click();
  await page.getByRole("group", { name: "确认恢复备份" }).waitFor();
  assert.equal((await calls()).filter((c) => c[0] === "restore").length, 0);
  await page.waitForFunction(
    () => document.activeElement.textContent === "取消",
  );
  await page.keyboard.press("Escape");
  assert.equal(
    await page.getByRole("group", { name: "确认恢复备份" }).count(),
    0,
  );
  assert.equal(
    await page.evaluate(() => document.activeElement.textContent),
    "恢复…",
  );
  await button("恢复…").click();
  await button("确认恢复").click();
  await page
    .getByText("备份已导入；恢复前的业务投影快照已保留", { exact: true })
    .waitFor();
  assert.deepEqual(
    (await calls()).find((c) => c[0] === "restore"),
    ["restore", "single-use"],
  );

  await page.evaluate(() => {
    window.fixture.refreshFailed = true;
  });
  await button("恢复…").click();
  await button("确认恢复").click();
  await page.getByRole("alert").filter({ hasText: "导入已提交" }).waitFor();
  assert.equal(await button("确认恢复").count(), 0);
  const committedCount = (await calls()).filter(
    (c) => c[0] === "restore",
  ).length;
  await button("重新读取").click();
  assert.equal(
    (await calls()).filter((c) => c[0] === "restore").length,
    committedCount,
  );
  await page.evaluate(() => {
    window.fixture.refreshFailed = false;
  });

  await page.evaluate(() => {
    window.fixture.errorBackup = true;
  });
  await button("立即备份").click();
  await page
    .getByRole("alert")
    .filter({ hasText: "fixture: disk full" })
    .waitFor();
  // Refreshing state after an action must not erase the action's error.
  assert.match(await page.getByRole("alert").textContent(), /disk full/);

  await button("加密导出…").click();
  await page.getByLabel("备份密码", { exact: true }).fill("fixture passphrase");
  await page.getByLabel("再次输入", { exact: true }).fill("different");
  await button("选择位置并导出…").click();
  await page.getByText("两次输入的密码不一致", { exact: false }).waitFor();
  assert.equal(
    (await calls()).filter((c) => c[0] === "encrypted-export").length,
    0,
  );
  await page.getByLabel("再次输入", { exact: true }).fill("fixture passphrase");
  await button("选择位置并导出…").click();
  await page.getByText("加密备份已导出", { exact: true }).waitFor();
  assert.equal(await page.locator('input[type="password"]').count(), 0);
  await button("加密导入…").click();
  await page.getByLabel("备份密码", { exact: true }).fill("fixture passphrase");
  await button("选择文件并预览…").click();
  await page.getByText("确认导入加密备份", { exact: true }).waitFor();
  assert.equal(
    (await calls()).filter((c) => c[0] === "encrypted-import").length,
    0,
  );
  await button("取消").click();
  assert((await calls()).some((c) => c[0] === "encrypted-discard"));

  // A native chooser completing after navigation must never configure a folder.
  await page.evaluate(() => {
    window.fixture.delayChoose = true;
    window.fixture.calls = [];
  });
  await button("更改…").click();
  await page.evaluate(() => window.fixture.render({ active: false }));
  await page.locator(".local-backup-settings").waitFor({ state: "hidden" });
  await page.evaluate(() =>
    window.fixture.chooseResolvers
      .splice(0)
      .forEach((resolve) => resolve("/wrong/stale")),
  );
  await page.waitForFunction(() => !window.fixture.chooseResolvers.length);
  assert.equal((await calls()).filter((c) => c[0] === "configure").length, 0);
  await page.evaluate(() => window.fixture.reset());
  await page.waitForFunction(
    () => !document.querySelector('[aria-busy="true"]'),
  );

  await page.evaluate(() =>
    window.fixture.render({ showArchiveControls: false }),
  );
  await page.waitForFunction(
    () =>
      ![...document.querySelectorAll("button")].some(
        (button) => button.textContent === "导入…",
      ),
  );
  assert.equal(await button("导出…").count(), 0);
  await button("立即备份").waitFor();
  await page.evaluate(() =>
    window.fixture.render({ showArchiveControls: true }),
  );
  await button("导出…").waitFor();

  // Do not publish old read responses after access generation changes.
  await page.evaluate(() => {
    window.fixture.delayRead = true;
    window.fixture.render({ accessKey: String(101) });
  });
  await page.waitForFunction(() => window.fixture.readResolvers.length === 1);
  await page.evaluate(() => {
    window.fixture.delayRead = false;
    window.fixture.render({ accessKey: String(102) });
  });
  await page
    .getByText("/Users/fixture/CyberNote/backups", { exact: true })
    .waitFor();
  await page.evaluate(() =>
    window.fixture.resolveReads("/should-never-appear"),
  );
  assert.equal(
    await page.getByText("/should-never-appear", { exact: true }).count(),
    0,
  );

  await page.evaluate(() => {
    window.fixture.calls = [];
    window.fixture.render({ blocked: true });
  });
  await page
    .getByText("请先完成录音或当前数据操作，并确认资料库访问权限。", {
      exact: true,
    })
    .waitFor();
  assert.equal(await button("立即备份").isDisabled(), true);
  assert.equal((await calls()).length, 0);
  await page.evaluate(() => window.fixture.reset());
  await page.waitForFunction(
    () => !document.querySelector('[aria-busy="true"]'),
  );

  await page.evaluate(() => {
    window.fixture.privateOnly = true;
    window.fixture.reset();
  });
  await page.getByText("备份保存在应用私有目录。", { exact: false }).waitFor();
  assert.equal(await button("更改…").count(), 0);
  assert.equal(await button("默认").count(), 0);
  await page.evaluate(() => {
    window.fixture.privateOnly = false;
    window.fixture.reset();
  });
  await button("更改…").waitFor();

  for (const [width, scheme] of [
    [960, "light"],
    [960, "dark"],
    [390, "light"],
    [390, "dark"],
  ]) {
    await page.setViewportSize({ width, height: width < 600 ? 1000 : 850 });
    await page.evaluate(
      ({ scheme, width }) => {
        document.documentElement.dataset.scheme = scheme;
        document.documentElement.classList.toggle("dark", scheme === "dark");
        document
          .querySelector(".preferences")
          .classList.toggle("preferences-mobile", width < 600);
      },
      { scheme, width },
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
      `${width}/${scheme}: overflow`,
    );
    if (width === 390) {
      const sizes = await page
        .locator("button:not([disabled])")
        .evaluateAll((elements) =>
          elements.map((el) => el.getBoundingClientRect().height),
        );
      assert(
        sizes.every((height) => height >= 44),
        "mobile touch targets must be at least 44px",
      );
    }
    await page.screenshot({
      path: resolve(output, `local-backup-${width}-${scheme}.png`),
      fullPage: true,
    });
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS: real React controls, archive routing, preview/confirmation/focus/Escape, password lifecycle, error persistence, stale chooser/read, access blocking, 390px touch/overflow, light/dark screenshots",
  );
  console.log(`Screenshots: ${output}`);
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
  await vite.close();
}
