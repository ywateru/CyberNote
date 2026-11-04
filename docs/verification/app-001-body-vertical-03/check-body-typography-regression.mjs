// Offline headless cascade check. Requires the same preinstalled tooling as other browser checks.
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile, mkdtemp } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createServer as createViteServer } from "vite";

assert(
  process.env.PLAYWRIGHT_CORE_PATH && process.env.CHROME_PATH,
  "Use existing external browser tooling; do not install dependencies",
);
const output = resolve(process.argv[2] || "artifacts/body-typography/run01");
await mkdir(output, { recursive: false });
const baselineHead = execFileSync(
  "git",
  ["rev-parse", process.argv[3] || "e44dba7"],
  { encoding: "utf8" },
).trim();
const baselineCss = execFileSync(
  "git",
  ["show", `${baselineHead}:src/style.css`],
  { encoding: "utf8" },
);
const candidateCss = await readFile("src/style.css", "utf8");
const sha = (value) => createHash("sha256").update(value).digest("hex");
const selector =
  ".desktop.native-toolbar:not(.separate) .note-document .tiptap > p";
const fixtureEntry = `
import { Editor } from '@tiptap/core';
import { createEditorExtensions } from '/src/editor-schema.ts';
const text = (text, marks) => ({type:'text',text,...(marks ? {marks} : {})});
const p = (...content) => ({type:'paragraph',content});
const doc = {type:'doc',content:[
 p(text('QA-WIDE-20261104-05')),p(text('宽三栏工具栏与搜索对照。')),p(text('仅本地合成内容。')),p(),
 p(text('bold',[{type:'bold'}]),text(' italic',[{type:'italic'}]),text(' underline',[{type:'underline'}]),text(' strike',[{type:'strike'}]),text(' highlight',[{type:'highlight',attrs:{color:'#ffee88'}}]),text(' color',[{type:'textStyle',attrs:{color:'#aa2211'}}]),text(' #校准',[{type:'noteTag',attrs:{name:'校准'}}]),text(' link',[{type:'link',attrs:{href:'https://example.invalid'}}]),text(' code',[{type:'code'}])),
 ...[1,2,3].map(level=>({type:'heading',attrs:{level},content:[text('标题'+level)]})),
 {type:'bulletList',content:[{type:'listItem',content:[p(text('列表正文'))]}]},
 {type:'orderedList',content:[{type:'listItem',content:[p(text('编号正文'))]}]},
 {type:'taskList',content:[{type:'taskItem',attrs:{checked:false},content:[p(text('清单正文'))]}]},
 {type:'table',content:[{type:'tableRow',content:[{type:'tableCell',content:[p(text('表格正文'))]}]}]},
 {type:'blockquote',content:[p(text('引用正文'))]},
 {type:'codeBlock',content:[text('const answer = 42;')]},
 {type:'attachment',attrs:{id:'fixture',name:'附件',kind:'file'}},
 {type:'drawing',attrs:{strokes:[]}}
]};
window.fixtureEditor = new Editor({element:document.querySelector('#editor-mount'),extensions:createEditorExtensions(),content:doc});
window.fixtureEditor.state.doc.check();
window.fixtureReady = true;
`;
const isolatedCache = await mkdtemp("/private/tmp/notes-body-vertical-03-regression-");
const vite = await createViteServer({
  configFile: false,
  cacheDir: isolatedCache + "/vite-cache",
  plugins: [
    {
      name: "body-typography-fixture",
      resolveId(id) {
        if (id === "/__body-typography.ts") return id;
      },
      load(id) {
        if (id === "/__body-typography.ts") return fixtureEntry;
      },
    },
  ],
  server: {
    middlewareMode: true,
    watch: {
      ignored: [
        "**/src-tauri/target/**",
        "**/artifacts/**",
        "**/docs/verification/**",
      ],
    },
  },
  appType: "custom",
});
const server = createServer((req, res) => {
  if (req.url === "/__body-typography") {
    res.setHeader("Content-Type", "text/html");
    vite
      .transformIndexHtml(
        req.url,
        '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style id="production-css"></style><div id="root"><div id="fixture-app"><section class="editor-pane"><div class="editor-scroll"><button class="note-date">2026年11月4日</button><div class="note-document"><div id="editor-mount"></div></div></div></section></div></div><script type="module" src="/__body-typography.ts"></script>',
      )
      .then((html) => res.end(html))
      .catch((error) => {
        res.statusCode = 500;
        res.end(String(error));
      });
  } else vite.middlewares(req, res);
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const origin = `http://127.0.0.1:${server.address().port}`;
const { chromium } = await import(
  pathToFileURL(process.env.PLAYWRIGHT_CORE_PATH)
);
const results = [],
  errors = [],
  external = [];
let browser;
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH,
    headless: true,
    args: ["--mute-audio"],
  });
  const context = await browser.newContext({
    viewport: { width: 1088, height: 800 },
    deviceScaleFactor: 1,
  });
  await context.route("**/*", (route) => {
    if (
      route
        .request()
        .url()
        .startsWith(origin + "/")
    )
      return route.continue();
    external.push(route.request().url());
    return route.abort();
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto(origin + "/__body-typography");
  await page.waitForFunction(() => window.fixtureReady === true);
  const capture = async (css, classes) =>
    page.evaluate(
      async ({ css, classes, selector }) => {
        document.querySelector("#production-css").textContent = css;
        document.querySelector("#fixture-app").className = classes;
        await document.fonts.ready;
        const props = [
          "fontSize",
          "lineHeight",
          "minHeight",
          "fontFamily",
          "fontWeight",
          "letterSpacing",
          "paddingLeft",
          "paddingTop",
          "paddingRight",
          "paddingBottom",
          "marginTop",
          "marginBottom",
          "transform",
          "zoom",
          "color",
          "textDecorationLine",
          "backgroundColor",
        ];
        const inspect = (element) => ({
          tag: element.tagName,
          classes: element.className,
          matches: element.matches(selector),
          style: Object.fromEntries(
            props.map((prop) => [prop, getComputedStyle(element)[prop]]),
          ),
        });
        const tiptap = document.querySelector(".tiptap");
        const paragraphs = [...tiptap.querySelectorAll(":scope > p")];
        const marked = paragraphs[4];
        const inkRange = document.createRange();
        inkRange.selectNodeContents(paragraphs[0]);
        return {
          document: window.fixtureEditor.getJSON(),
          targets: paragraphs.map(inspect),
          marks: [...marked.children].map(inspect),
          excluded: [
            ...tiptap.querySelectorAll(
              "h1,h2,h3,li p,td p,blockquote p,pre,pre code,[data-attachment],[strokes]",
            ),
          ].map(inspect),
          ancestors: [
            document.documentElement,
            document.querySelector(".editor-scroll"),
            document.querySelector(".note-date"),
            document.querySelector(".note-document"),
            tiptap,
          ].map(inspect),
          firstLineWidth: inkRange.getBoundingClientRect().width,
        };
      },
      { css, classes, selector },
    );
  for (const [name, width, classes] of [
    ["mac-main", 1088, "app desktop native-toolbar page-editor"],
    ["phone", 390, "app mobile page-editor"],
    ["wide-android", 1088, "app desktop page-editor"],
    ["independent", 900, "app desktop native-toolbar separate page-editor"],
  ]) {
    await page.setViewportSize({ width, height: 800 });
    const before = await capture(baselineCss, classes),
      after = await capture(candidateCss, classes);
    await writeFile(
      resolve(output, `${name}.json`),
      JSON.stringify({ name, width, classes, before, after }, null, 2) + "\n",
      { flag: "wx" },
    );
    assert.deepEqual(
      after.document,
      before.document,
      `${name}: document changed`,
    );
    assert.deepEqual(
      after.excluded,
      before.excluded,
      `${name}: excluded format changed`,
    );
    assert.deepEqual(
      after.ancestors,
      before.ancestors,
      `${name}: ancestor/date/font stack changed`,
    );
    assert(
      after.excluded.length >= 12,
      `${name}: missing excluded format samples`,
    );
    if (name === "mac-main") {
      assert.equal(after.targets.length, 5);
      for (const [i, p] of after.targets.entries()) {
        assert.equal(p.matches, true);
        assert.equal(p.style.fontSize, "13px");
        assert.equal(p.style.lineHeight, "17.22px");
        assert.equal(p.style.minHeight, "17.22px");
        assert.equal(before.targets[i].style.fontSize, "14px");
        for (const prop of Object.keys(p.style).filter((x) => x !== "fontSize"))
          assert.equal(
            p.style[prop],
            before.targets[i].style[prop],
            `main paragraph ${i} ${prop}`,
          );
      }
      assert.equal(after.marks.length, 9);
      for (const [i, mark] of after.marks.entries()) {
        assert.equal(mark.style.fontSize, "13px");
        for (const prop of Object.keys(mark.style).filter(
          (x) => x !== "fontSize",
        ))
          assert.equal(
            mark.style[prop],
            before.marks[i].style[prop],
            `mark ${i} ${prop}`,
          );
      }
      assert(
        after.firstLineWidth < before.firstLineWidth,
        "smaller text did not reduce measured range width",
      );
    } else {
      assert.deepEqual(
        after.targets,
        before.targets,
        `${name}: paragraph cascade changed`,
      );
      assert.deepEqual(
        after.marks,
        before.marks,
        `${name}: mark cascade changed`,
      );
      assert(
        after.targets.every((p) => !p.matches),
        `${name}: candidate matched`,
      );
    }
    results.push({
      name,
      passed: true,
      targets: after.targets.length,
      marks: after.marks.length,
      excluded: after.excluded.length,
      firstLineWidthBefore: before.firstLineWidth,
      firstLineWidthAfter: after.firstLineWidth,
    });
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  await writeFile(
    resolve(output, "result.json"),
    JSON.stringify(
      {
        baselineHead,
        baselineCssSha256: sha(baselineCss),
        candidateCssSha256: sha(candidateCss),
        browserVersion: browser.version(),
        results,
        errors,
        external,
        limits:
          "Isolated headless Chromium with real schema and complete CSS. No AppKit/WebKit/original font identity, native input, persistence or pixel acceptance.",
      },
      null,
      2,
    ) + "\n",
    { flag: "wx" },
  );
  console.log(JSON.stringify({ passed: true, results }, null, 2));
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
  await vite.close();
}
