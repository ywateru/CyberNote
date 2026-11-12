# sync108 启动回归长挂定向诊断

日期：2026-11-12，Asia/Shanghai。仓库：`/Users/water/work/2026/Apple-Notes-Clone`。

**结论：本次长挂是 `scripts/check-startup.mjs` 制造的测试等待循环，不是已证实的产品启动故障。正式原运行没有通过，已保存证据后人工终止。** 另发现 config-free static debug HTML 残留源码 CSS 链接的工具接线问题。临时工具修复方案的诊断验证完成桌面 16 项、移动 4 项并 exit 0，但其结果明确标记 `diagnosticOnly:true`、`formalStartupPassed:false`；不能替代正式新路径回归。

全部诊断脚本、日志、临时 bundle、候选方案结果位于：

`/private/tmp/sync108-startup-diag-20261112/`

没有修改主工作区源码、已有脚本、已有 artifacts 或暂存区，没有启动/控制用户 App。读取与停止操作仅针对题述 owned runner/Chrome及其子进程；诊断新启动的 headless 浏览器使用各自隔离 profile，并由临时 runner 清理退出。

## 1. 原始运行与实际挂起证据

原进程：

- Node PID **98895**，PPID 98890，命令 `node scripts/check-startup.mjs`，启动时间 **18:59:15 +08:00**。
- Chrome PID **99242**，PPID 98895，启动时间 **18:59:27 +08:00**，`--headless --remote-debugging-pipe`，测试 profile 为 `playwright_chromiumdev_profile-ErcbmX`。
- Node HTTP listener 为 **127.0.0.1:57615**。
- 首次完整保存进程树时 Node 已运行约 3 分 38 秒；后续再次读取时仍挂起超过 7 分钟。
- `artifacts/startup` 的九个现存文件全部为 **2026-11-07**，没有本次运行的新结果。旧 desktop-result.json 的 SHA256 为 `409300fa7aab4d50dba2d85fed5151c9f234cf2bcd228269da85e1a410eefdbd`。不能将这些旧结果作为本轮通过。

证据文件：

- `original-processes-before.txt`：原始进程及派生进程状态、完整命令。
- `original-artifacts-before.json`：九个既有产物的时间、大小、SHA256。
- `original-server-probes.json`、`original-served-index.html`、`original-served-app.js`：直接读取原测试 HTTP 服务的结果。

为确认原进程实际页面状态，对 **98895** 发出 SIGUSR1 开启它自身的 Node inspector，只连接该 PID 的 127.0.0.1:9229，枚举其既有 Playwright Browser 实例并读取它的测试页，没有控制其他浏览器或用户 App。最终成功的结果保存在 `original-live-page.json`，采样时间 **19:07:47.859 +08:00**：

```json
{
  "pid": 98895,
  "browsers": 1,
  "url": "http://127.0.0.1:57615/?notesDebug=1",
  "readyState": "interactive",
  "fontStatus": "loaded",
  "fontsReadyWithin250ms": false,
  "app": false,
  "splash": true,
  "splashState": "loading",
  "rootInert": true,
  "debug": "undefined",
  "text": "CyberNote\n\n打开时间较长，请稍候…\n\n重新加载"
}
```

这与脚本正在执行“拦住 app.js 后等待字体就绪”的状态一致，而非已经进入应用初始化后卡在新业务模块。

## 2. 根因：app.js gate 与 document.fonts.ready 形成等待循环

准确位置：`scripts/check-startup.mjs:20-27` 和 `:51`。

执行顺序：

1. 第 20–23 行创建 gate，并用 `page.route('**/app.js', hold)` 拦住应用模块请求；route handler 等待 gate 后才 `route.continue()`。
2. 第 24 行 reload 仅等待 commit，允许应用模块仍被拦住。
3. 第 25–26 行等待独立 HTML splash 和 startup.js，就绪后继续。
4. **第 27 行 `await page.evaluate(() => document.fonts.ready)` 无界等待。** `page.setDefaultTimeout(10000)` 不会为该 page.evaluate 的返回 Promise 自动设定超时。
5. 此时文档虽已 interactive、字体状态虽为 loaded，但 FontFaceSet.ready 仍等待文档加载完成；被拦住的模块请求阻止该阶段完成。
6. 解除 app.js gate 的 `release()` 在第 51 行，要等字体、断言和截图全部结束才会执行。因此循环不会自行打破。

### 可重复的有界诊断

临时脚本 `run-gate-diagnosis.mjs` 使用插桩副本 `runtime-instrumented.mjs`，保持产品源码不变。先按原 openRuntime 正常启动，再重复原 app.js gate，并给字体等待设置独立的 6 秒诊断预算。

`gate-diagnosis.jsonl` 记录：

| 时间（UTC） | 实际观察 |
| --- | --- |
| 11:05:28.158 | 初始 openRuntime 正常完成；readyState complete、debug.version=1、app 存在、splash 不存在。 |
| 11:05:28.183 | app.js 请求被 gate 拦住。 |
| 11:05:28.199 | 开始原字体 Promise 等待。 |
| 11:05:34.202 | 6 秒诊断预算结束，字体 Promise 仍未解析。 |
| 11:05:34.205 | 页面 interactive、fontStatus loaded、app 不存在、root inert、debug undefined。 |
| 11:05:34.205–206 | 诊断主动放行 app.js。 |
| 11:05:34.273 | 字体 Promise 解析；距放行约 **68 ms**，文档 complete。 |
| 11:05:34.633 | 应用启动完成，debug.version=1、root 非 inert、splash 移除、pageErrors=[]。 |
| 11:05:34.822 | 诊断退出，执行器确认 **exit 0**。 |

`gate-result.json` 中 `formalStartupPassed:false`。这不是正式 startup 回归通过，只是根因隔离实验。

### 不能仅删除第 27 行

检查本机实际使用的 Playwright `lib/server/screenshotter.js:218-220`，默认 screenshot 内部同样等待 `document.fonts.ready`。原脚本第 34、39、44 行截图仍在 release 之前。仅删掉显式字体 await 会把相同问题推迟到截图步骤，不能作为完整修复。

不建议依赖 Playwright 内部环境开关 `PW_TEST_SCREENSHOT_NO_FONTS_READY` 作为正式修复；应修正 gate 模型。

## 3. config-free static debug bundle 与新增模块接线

### 已确认的独立工具问题：源码 CSS URL 返回 500

`scripts/debug/runtime.mjs:131-133` 通过 `configFile:false`、JS entry 构建 debug bundle，再直接复制根 `index.html`，仅替换 `/src/main.tsx` 为 `/app.js` 并插入 `/style.css`。

根 HTML 新增：

```html
<link rel="stylesheet" href="/src/design-tokens.css" />
```

这条源码路径没有经过 Vite HTML transform，也不存在于 static debug bundle 内。原服务与临时未修复服务均实测：

- `/app.js` → 200，3,318,167 字节（原服务）；
- `/startup.js` → 200；
- `/style.css` → 200；
- **`/src/design-tokens.css` → 500**，浏览器记录 ERR_ABORTED 与资源加载错误。

此 500 **不是本次无限等待的根因**：不改它的第一轮 instrumented openRuntime 仍在约 4 秒内完成，pageErrors 无未捕获 JS 错误；保持 500 的 gate 诊断在放行后也能完成启动。但它是明确的测试服务接线缺陷，会污染控制台并使静态宿主与真正 Vite 构建行为不一致。

建议只在生成的 static debug HTML 中移除/转换此源码 CSS link，并确保使用实际构建的 CSS 资源；`src/main.tsx:12` 已导入 design-tokens.css，因此当前 debug `/style.css` 已含相同 token。不要为了迁就测试而从生产 HTML/源码删除 token 接线。

### 新模块检查结果

- 当前 `src/build-info.ts:16-18` 有 `typeof __CYBERNOTE_BUILD_INFO__ === 'undefined'` 的开发预览 fallback，符合 `configFile:false` 不注入构建宏的情况。本轮没有出现该宏 ReferenceError。
- 初始未改语义的诊断能运行 App、新 NativePlatform 与 editor/session 接线，注册 `__NOTES_DEBUG__.version === 1` 并完成 splash handoff；因此没有证据把原长挂归因于这些新模块无法装载。
- 原 static debug bundle 的拆分文件实际从 canonical `../app.js` 导入共享导出，例如 `assets/runtime-*.js` 导入 `p as parseInterfaceDetails`，`assets/native-recording-access-*.js` 导入 `i`/`r`。gate 修复必须保留 `/app.js` 的模块身份与导出。

## 4. 临时候选修复验证及保留的失败

### 候选一：直接替换 canonical app.js，不可采用

为诊断尝试将 `/app.js` 响应替换为小型 lazy stub，再通过 `/app.js?sync108diagnostic=1` 载入真正 bundle。它解除字体等待、完成前七项断言后失败：

```
SyntaxError: The requested module '../app.js' does not provide an export named 'p'
page.waitForFunction: Timeout 10000ms exceeded.
```

原因是拆分模块回引 canonical `/app.js`，命中了没有导出的 stub。此错误由诊断 gate 改写造成，**不归咎产品模块**。保留在：

- `run-proposed-tool-fix.mjs`；
- `proposed-tool-fix.stdout` / `.stderr`；
- `proposed-tool-fix-run/desktop-result.json`（passed:false，七项检查与两条 pageErrors）；
- 执行器确认该诊断 **exit 1**。

### 候选二：独立 gate entry，保留 canonical app.js，可供开发者采用

临时副本只修改工具逻辑：

1. 在 gate 阶段的测试 HTML，将入口 script 指向独立 `/startup-diagnostic-gate.js`。
2. 该独立入口完成加载，只暴露 `window.__SYNC108_RELEASE_APP__ = () => import('/app.js')`，此时不执行产品模块。
3. 文档能完整加载，字体 Promise 与截图可自然完成，仍能证明真实 HTML splash 在 React 前显示、底层 inert。
4. 断言完成后调用 release 函数，以 canonical `/app.js` 启动真实产品 bundle；动态 chunks 仍能获取正确导出。
5. 在生成的 debug HTML 中删除失效的源码 CSS link，只使用已构建的 style.css。

结果：`run-proposed-tool-fix2.mjs` 在 **11:09:28.909–11:09:49.549 UTC** 跑完原桌面 **16 项**及移动 **4 项**断言，两端均无 pageErrors，桌面/移动浏览器与 HTTP 服务全部 cleanup，执行器确认 **exit 0**。唯一 requestfailed 为原用例主动 abort app.js 的预期失败注入，没有额外 CSS 500。

独立产物路径：

`/private/tmp/sync108-startup-diag-20261112/proposed-tool-fix-run2/`

desktop-result.json 与 mobile-result.json 均含：

```json
{"diagnosticOnly":true,"formalStartupPassed":false}
```

其中原断言集合的 `passed:true` 仅表示**临时工具修复后的诊断检查**通过；原始正式运行仍为长挂人工结束，主仓库脚本没有被修复，正式新回归待开发者实施后另路径执行。未执行可选 `--capture-animation`。

## 5. 原运行的有界退出与保留状态

为防止原 runner 在错误展开时把本次结果写回旧 `artifacts/startup`，保存 live 页面与原进程树后：

- **19:08:46.828 +08:00** 对确认身份的 PID 98895 发出 **SIGKILL**，终止无界等待；这是人工停止，**不是自然成功退出**，本诊断并非其父进程，未取得 waitpid exit code，不伪造具体退出码。
- **19:08:46.872 +08:00** 对确认 owned profile/父 PID 的 Chrome 99242 发出 **SIGTERM**。
- **19:08:47.218 +08:00** 观察原 runner、Chrome、esbuild 98949 及此前枚举的全部 Chrome helper 均已消失，无残留 owned 进程。
- 后续查询 57615/9229 无 listener，原两个 PID 不存在。
- `preservation-check.json` 确认旧 `artifacts/startup` 九个文件**大小、内容 SHA256、mtime 全部保持不变**。

详见 `original-termination.json`。原 Node 总运行约 **9 分 32 秒**。所有进程操作均有确切 PID/parent/profile 检查，没有使用全局 killall/pkill。

## 6. 给主代理的最小修复建议

请派开发者修改工具，范围限定：

1. **`scripts/check-startup.mjs`**：采用独立 lazy gate entry，保留 canonical app.js 的身份与导出；不要在挂起真实模块请求时等待 fonts.ready 或截图。为 gate 阶段设置明确总预算，失败时在 finally 中释放/移除 gate，避免 page.evaluate Promise 长挂。
2. **`scripts/debug/runtime.mjs`**：生成 config-free static debug HTML 时转换/移除源码 CSS URL，使用已生成的 CSS；把 500/意外 requestfailed 作为诊断输出，避免静默资源接线失败。
3. **结果隔离与报告**：正式工具提供/使用新的 output 路径，不覆盖 `artifacts/startup` 旧日期结果；尽早记录 running/阶段信息，setup 失败也写入失败记录。当前 openRuntime 位于 check-startup 自身 try/catch 外，setup 错误也可能留下旧文件造成误判。
4. 修复后正式新跑 desktop/mobile，并另测 gate 超时能有界失败和清理。保留本次原始长挂、候选一失败和候选二诊断结果。无需据本轮证据修改产品 App/启动逻辑。

本诊断未操作 Git add/reset/commit 或修改 index。审阅开始时暂存 diff SHA256 为 `a65d3bf48418197df97ca77e84c8a0832196d01a9548ec0a43457ad3c5b6e45b`；期间主工作流已产生产品/文档/设计/研究/计划提交，最终暂存 diff 为空，HEAD 为 `70dad4f4bf95ad723d7c3ced88659d8b1a8d76d6`。该外部并发变化已如实记入 preservation-check，不能宣称“暂存哈希全程不变”，也不归因于本诊断操作。
