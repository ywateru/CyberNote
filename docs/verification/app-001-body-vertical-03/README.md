# Mac 全段落正文垂直候选 03：开发检查

本目录只验证 `app-001-body-vertical-03` 的样式边界与编辑器结构。产品仅在 `src/style.css` 增加两条规则：Mac 主窗 native-toolbar、非 separate、note-document 下，Tiptap 根至少一个直接 p 且所有直接元素均为 p 时，根 padding-top 为 2px、直接 p 的 line-height/min-height 为 17px。保留原 13px 字号及一般 p 的 17.22px 规则。混合根退出，手机、宽 Android 与独立窗排除。

17px/2px 是同文截图提出的联合候选参数。它不证明原版使用 17pt，也不证明图像 DPR、字体基线或 half-leading。安装包、原版两语料截图与实际输入回归由 root 后续执行；本目录不提供像素级通过结论。

## 源码与构建身份

基线产品源码提交：`8463ed896847f891fd4fd5579affb253a11d681b`。CSS 基线 SHA256 为 `75227796447c2f1404d5bb6e11f5c4663d53035d6cd343c288d92f6302f18bf7`；候选为 `de2222e4b3c8e4ccde3af4312e8d0db5480dabea1a3c54fe4a0bf9c2a3feb962`。

`check-source.mjs` / `source-audit.json` 验证移除精确新增块后与基线 CSS 逐字相同；基线至当前产品路径（src、src-tauri、package.json、pnpm-lock.yaml）仅 style.css 有差异。App、编辑器 schema、依赖与锁文件另记录 SHA256。审计时 HEAD 只用于说明外围文档提交身份；最终开发提交会由 git 封存本目录与 CSS。

`pnpm build` 通过，完整输出见 `frontend-build.log`，退出码、耗时与日志摘要见 `frontend-build.json`。构建仅产生前端 dist；保留现有大 chunk 警告。无 Rust/Gradle/平台包构建，无下载或升级。输出前磁盘可用约 72GiB，大于 2GiB 门槛。

## 实际渲染检查

`check-render.mjs` 使用生产 `createEditorExtensions()` 和真实 Tiptap Editor、完整旧/新 CSS。四个上下文为 Mac 主窗1088px、手机390px、宽 Android1088px、独立窗900px。18种文档×4=72场景，包含普通/空段落与 Placeholder、九种内联标记、三种标题、三种列表、表格、引用、代码、附件、绘图、无直接 p 标题，以及两份冻结语料。两份语料来源及 SHA256 在 result 内记录。

`render-run02/result.json`：Chrome `156.0.8078.80`，72/72通过，六个 Mac 纯 p 场景命中；其余66场景不命中。真实 `selector.matches()`、子元素 tag/class、computed 样式、段落/Range/行矩形、标记与祖先样式、JSON、selection 及对象身份全部保留。命中时仅允许根 padding-top 与直接 p 行高/最小高变化，字号13px；Range宽度与行矩形数量保持。排除场景相关样式及几何逐项相同。外部请求与 pageerror 均为空。

真实 `toggleHeading({level:1})` 事务完成 p→h1→p：根 padding 2→0→2px，剩余直接 p 行高17→17.22→17px；恢复后 JSON与之前相同，全程保持同一 Editor、View、root DOM。注册实际 ProseMirror `Decoration.widget(0, span)` 时，根直接元素为 SPAN/P…，守卫退出；卸载插件后回入，JSON与对象身份保持。这仅覆盖本次构造的直接 span widget，不能推广到未知插件结构。

首次 `render-run01` 保留失败。该版检查器未等待现有手机 page-in 动画结束，第25场景 phone/mixed-heading-3 的两个取样处在不同动画帧，段落 x 不同，样式相同；结果保存前24个通过场景及断言栈，未保存失败场景完整对照。随后只修改检查器：等待 document.fonts.ready、实际活动动画 finished 与两个渲染帧，并将场景记录提前到断言前。未改产品 CSS。run02在这些稳定采样条件下通过。当前检查器是 run02版本；run01检查器未在运行前单独哈希封存。失败文件未删除。

## 必要字体回归

`check-body-typography-regression.mjs` 是既有 `scripts/check-body-typography-browser.mjs` 的复制版，仅添加 mkdtemp、创建独占 /private/tmp 目录并使用该 cacheDir；逐字变换由 source audit 验证。它保留原14px基线提交（展开40位见 `typography-regression01/*.json`）与混合文档，用于确认既有13px范围与排除上下文。本轮四上下文均通过，生产旧检查器文件保持原样。只运行一次。

## 复现与限制

从仓库根目录运行，使用已安装外部工具，无新增依赖：

```sh
PLAYWRIGHT_CORE_PATH=/Users/water/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.mjs \
CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
node docs/verification/app-001-body-vertical-03/check-render.mjs \
docs/verification/app-001-body-vertical-03/render-run-new \
8463ed896847f891fd4fd5579affb253a11d681b
node docs/verification/app-001-body-vertical-03/check-source.mjs
```

渲染器只访问本地回环服务器，拦截非本地请求；使用独占临时 Vite 缓存和无用户资料的 headless 浏览器进程。附件/绘图使用生产 schema 默认 HTML，没有挂载 App 中的 React NodeView 或真实媒体。检查未覆盖原版 Notes、WKWebView、安装包、系统输入法、移动端原生输入/Back、真实存储或任意未知根 widget。未操作 GUI、ADB 或共享 target/cache。宽度/行数不变是这些固定语料在本次 Chrome 环境下的结果，不能替代同画布原版长段截图。

`manifest.json` 封存本目录除其自身以外的文件、生产输入与前端输出身份。
