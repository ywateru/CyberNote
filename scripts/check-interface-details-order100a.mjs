// Author regression: real component, controlled owner props/receipts only.
// Storage failure/reload coverage remains in check-interface-details100a.mjs.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import react from "@vitejs/plugin-react";
import { createServer as createViteServer } from "vite";

const out = resolve("artifacts/design100a-order");
await mkdir(out, { recursive: true });
const entry = `import React,{useState}from'react';
import{createRoot}from'react-dom/client';
import Details from'/src/PreferencesInterfaceDetails.tsx';
import{defaultInterfaceDetails}from'/src/interface-details.ts';
function Owner(){
 const[value,setValue]=useState(defaultInterfaceDetails);
 window.external=iconScale=>setValue({...defaultInterfaceDetails,iconScale});
 window.current=value;
 return <Details value={value} mobile={false} disabled={false} onSettings={patch=>{
   window.patch=patch.interfaceDetails;
   setValue({...patch.interfaceDetails});
   return new Promise((resolve,reject)=>{
     window.receipt=ok=>ok?resolve():reject(Error('controlled failure'));
   });
 }}/>;
}createRoot(document.getElementById('root')).render(<Owner/>);`;
const vite = await createViteServer({
  configFile: false,
  cacheDir: resolve(out, "vite-cache"),
  plugins: [react(), {
    name: "order-fixture",
    resolveId: id => id === "/__order.tsx" ? id : undefined,
    load: id => id === "/__order.tsx" ? entry : undefined,
  }],
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
});
const server = createServer(async (req, res) => {
  if (req.url === "/__check") {
    res.setHeader("content-type", "text/html");
    res.end(await vite.transformIndexHtml(req.url, '<!doctype html><div id="root"></div><script type="module" src="/__order.tsx"></script>'));
  } else vite.middlewares(req, res);
});
await new Promise(done => server.listen(0, "127.0.0.1", done));
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_CORE_PATH || "/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/playwright-core/index.mjs"));
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const checks = [], errors = [];
try {
  for (const success of [true, false]) {
    const page = await browser.newPage();
    page.on("pageerror", e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/__check`);
    await page.getByRole("button", { name: "界面细节", exact: true }).click();
    const icon = page.getByRole("slider", { name: "图标大小", exact: true });
    await icon.focus();
    await page.keyboard.press("ArrowRight");
    await page.waitForFunction(() => window.current.iconScale === 101 && window.receipt);
    // Multiple outside renders must preserve the latest, not the first.
    await page.evaluate(() => window.external(109));
    await page.waitForFunction(() => window.current.iconScale === 109);
    await page.evaluate(() => window.external(111));
    await page.waitForFunction(() => window.current.iconScale === 111);
    await page.evaluate(ok => window.receipt(ok), success);
    await page.waitForFunction(() => document.querySelector('[aria-busy]').getAttribute('aria-busy') === 'false');
    assert.equal(await icon.inputValue(), "111");
    assert.equal(await page.getByRole("alert").count(), success ? 0 : 1);
    assert.equal(await page.locator('.preferences-details-example').evaluate(el => el.style.getPropertyValue('--interface-icon-size')), "22.2px");
    // An unrelated edit submits a complete object based on outside authority.
    await page.getByRole("combobox", { name: "菜单间距", exact: true }).selectOption("comfortable");
    await page.waitForFunction(() => window.patch.menuSpacing === 'comfortable');
    const patch = await page.evaluate(() => window.patch);
    assert.equal(patch.iconScale, 111);
    await page.evaluate(() => window.receipt(true));
    await page.waitForFunction(() => document.querySelector('[aria-busy]').getAttribute('aria-busy') === 'false');
    checks.push({ receipt: success ? "ACK" : "reject", external: 111, control: 111, preview: "22.2px", nextPatch: patch });
    await page.close();
  }
  assert.deepEqual(errors, []);
  const result = { ok: true, checks, errors, scope: "Real component controlled lifecycle; no storage or native claim." };
  await writeFile(resolve(out, "result.json"), JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
  await new Promise(done => server.close(done));
  await vite.close();
}
