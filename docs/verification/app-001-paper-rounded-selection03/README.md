# 手机纸张选框圆角候选03：源码与隔离渲染证据

状态：**CSS 已停止写入，等待不同作者独审；未暂存、未提交；新 Android 包实机圆角验收待做。**

本轮仅按 `docs/plan/tasks/app-001-paper-rounded-selection03.md` 和 `docs/ui/android.md` 改动 `src/style.css` 的手机纸张选中规则及其 `::after`。基线为 `832be31f13998f20aa87edcd9987831e0a1fed91`，候选 CSS SHA-256 为 `d7facf680ee801c348fd2ed0619213e0fc916d276f8fb3ddef1a78d11acf44d7`。精确差异保存在 `source.patch`。

## 实际改动

移除选中卡片的 outline，以绝对定位、`pointer-events:none` 的伪元素描边替代：源码请求 `inset:-2px`、`border:1.5px solid var(--accent)`、外圆角 `7px`。白卡片继续使用原 `5px` 圆角。既有卡片已设 `position:relative`，未新增 DOM 或更改基础按钮规则。宽高、位置、背景、阴影、图案、排列、状态和事件均沿用原实现。

`source-audit.json` 比较其列明的209项受跟踪产品输入，仅 `src/style.css` 不同；还验证完整 CSS 等于基线的一次精确局部替换。App、Editor、Rust、schema、依赖与锁文件未改动。该209项审计列表及聚合只代表此文件列出的范围，不能替代 root 的统一包冻结清单。

## 原始画面与平台边界

实施前读取完整相关 CSS cascade、原录屏86秒 plain 帧和 recovery02 真机同 plain 保存重开截图。两份原PNG的逐字节副本保存在 `inputs/`，原位置分别为：

- `references/mobile/frames-2s/frame-044.png`
- `docs/verification/android-paper-plain-geometry03/04-plain-saved-reopened.png`

原录屏金框呈圆角；recovery02 Android 旧金框四角为直角，白卡片本身已有圆角。**本轮 Chrome 156.0.8078.80 的旧 outline 已经呈圆角，与 Android 实际旧包绘制不同。** 不能用 Chrome 的旧新比较宣称 Android 直角已修复，亦不能把 Chrome 旧图标作“旧直角图”。旧 Android 直角 raster 完整保留在 inputs。

原版 radius、字体、DPR 仍未知。7px是既有卡片5px与2px外扩的候选推导，不是原版精确圆角测量值。

## 真实 App 检查结果

`check-real-app.mjs` 使用生产 App、Editor、完整 CSS 和原 browser-preview bridge，独立临时浏览器配置、临时 Vite cache，仅监听本机回环，阻止外部网页请求。真实 `.tiptap` 由 Editor 创建，脚本沿其 DOM 祖先找到实际 React fiber，并读取 SearchEditorHost 的真实父 key；直接保存 Editor、View、DOM 引用进行身份比较，未以 mock 代替。完整文档、选区、可编辑性、焦点、持久纸张值和实际 ProseMirror history 计数也一并记录。

最终 `run05/result.json` 的 `pass:true` 含义为 **CSS 无回归对照通过，开放交互缺口仍保留**，不代表全功能验收或原版像素通过。之前完整 run04 也保留；run05补足短屏末卡及桌面取消后的完整 before/after 状态记录，未修改产品源码。

- 390×844、fixture deviceScaleFactor=2：plain及六种横线/网格均通过真实选择→保存→重开→取消路径。每种已选状态在同一个 App/Editor 实例中切换旧、新完整 CSS，卡片几何、背景、图案、阴影、mask与命中结果相同。样式切换前后真实 key、Editor/View/DOM、完整文档、选区与 undo 计数完全相同。
- 每种已选状态的两份完整面板PNG逐像素相同，变化像素均为0；对应六张未选卡片及图案也逐像素相同。七对截图与实际 computed 数据互证。源 CSS 请求1.5px描边，但本次Chrome实际 computed将旧outline显示为1px+1px offset、新border显示为1px；此引擎量化已原样记录，未写成实际1.5px。
- 例如 plain 白卡 CSS rect 为 `[43.515625,162.765625,128.828125,104.453125]`；旧新金色 raster 边界均为 `[84,282,347,497]`（面板截图坐标、fixture DPR2）。两者角部均有空缺而非直角，完整结果见 `raster-analysis-run05.json`。`plain-*-3x.png` 是最近邻放大的自有Chrome图，仅用于审阅边缘。
- 390×500短屏：面板 clientHeight480、scrollHeight720、scrollTop240，最后疏网格真实按钮可达并可点击；前后完整文档、父key、当前Editor/View/DOM、选区、history、可编辑和焦点状态完全相同。旧新均有短屏PNG。
- 1088×800桌面：旧新 computed/几何相同，两次真实App运行的桌面面板PNG分别逐像素相同；取消后完整状态保全。这只证明该候选没有影响此次桌面渲染，不是桌面原版像素验收。
- 取消、Escape和遮罩关闭均走现有生产处理路径并保全已有状态。Escape为隔离浏览器键盘；遮罩用DOM事件调用原处理器，不能当作原生触摸/系统Back验收。页面错误和外部请求均为空。

## 不能归零的交互缺口

基线与候选均在首次点击当前已选 plain 时复现：

| 实际状态 | 点击前 | 点击后 |
|---|---|---|
| 选区 | anchor3 / head8 | anchor1 / head1 |
| SearchEditorHost父key | 原key | 改变 |
| Editor / View / DOM | 原实例 | 均改变 |
| history | done1 / undone0 | done0 / undone0 |
| 完整文档 | 两段合成正文 | 文档相同 |

其后六次选择的路径内真实实例、key、history、选区都保留。脚本同时保存相对最初实例与相对每次入口实例的身份结果，首次重建后的原始身份不会被重置成通过；`preexistingRisks` 完整列明差异。run03曾因严格身份要求在旧CSS该路径失败，原结果保留。run04/05将该失败改为显式开放风险并对比旧新行为，不能把此调整理解为降低产品要求。root已要求另设交互修复任务，本轮不扩CSS范围。

## 构建、失败与复现

`pnpm build`退出0，TypeScript与前端生产打包通过；`build.log`保留现有大于500kB chunk提示。未执行GUI、ADB、Android/桌面平台构建、安装或用户数据操作；未操作共享Rust target/Gradle cache，未下载依赖、升级或清理缓存。输出前磁盘可用约71GiB，高于2GiB要求。

失败记录全部保留：

- run01：默认受限环境拒绝fixture监听；没有进入产品验证。`environment-failure.json`记录EPERM。后续使用获准的本机隔离执行，并将Vite websocket绑定同一回环server。
- run02：验证器直接从Tiptap命令创建的DOM找React fiber，取不到父key；修正为沿真实DOM祖先寻找实际React宿主，保留原失败JSON。
- run03：旧CSS首次plain真实Editor身份未保全，严格断言失败；后续明确记录该开放产品缺口并做旧新比较。
- run04：完整CSS无回归检查通过；精确脚本副本为 `check-real-app-run04.mjs`。
- run05：补齐短屏/桌面完整状态检查的最终通过输出。

在仓库根目录，可用独立新输出目录复现；不得覆盖既有run目录：

```sh
PLAYWRIGHT_CORE_PATH=/Users/water/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.mjs CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' node docs/verification/app-001-paper-rounded-selection03/check-real-app.mjs docs/verification/app-001-paper-rounded-selection03/run-new
python3 docs/verification/app-001-paper-rounded-selection03/analyze-raster.py run-new
```

原始文件SHA与自有证据身份见manifest。root独审后才能冻结准确commit并离线构建新APK；随后须保数据升级，同plain保存重开确认四角与外边界，并恢复原grid-large。字体/说明宽度/色值/系统栏/全页像素及上述首plain交互缺口保持独立待验。
