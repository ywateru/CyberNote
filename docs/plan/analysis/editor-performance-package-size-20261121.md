# 编辑器输入性能与安装包体积改进方案

2026-11-21 · 编辑器第一阶段已实施，安装包实验待实施。源码调查基线为 `2932a965df1f85fd177b6f222180934531229964`（`v0.2.5`）。包体记录来自 `v0.2.4` 发布元数据和两份本地历史样本。编辑器真机性能基线仍待采集，因此本文不宣称达到 30% 延迟下降。

两条路线可以并行建立基线。编辑器先减少每次输入触发的正文扫描和工作区派生，再调整保存调度。安装包先测原生二进制剥离符号的收益，再比较编译参数和依赖裁剪。

## 本轮实现状态

| 状态 | 内容 | 代码入口 |
| --- | --- | --- |
| 已实现 | 标签清理从每次整篇遍历改为受影响文本块；加载后的首个相关事务覆盖整篇，复杂或无法映射的事务回退整篇。 | [标签插件](../../../src/note-tag-extension.ts) |
| 已实现 | 标签和纯文本按不可变文档身份缓存，避免同一快照被标签目录、智能文件夹、搜索和乐观更新重复扫描；标签结果数组由缓存共享，调用方不得原地修改。 | [标签缓存](../../../src/note-tags.ts) · [文本缓存](../../../src/types.ts) |
| 已实现 | 合法标签保存快照直接返回，不再为常见路径深拷贝整篇 JSON；只有需要修复非法标签时才克隆。 | [保存快照](../../../src/editor-save-snapshot.ts) |
| 已实现 | 普通正文保存按笔记合并：一个在途保存加一份最新正文，默认 `180 ms` 静默窗口、`1000 ms` 最大等待；附件、OCR、录音和冲突副本仍走精确保存路径。 | [保存调度器](../../../src/editor-save-scheduler.ts) · [App 接入](../../../src/App.tsx) |
| 已实现 | 普通正文的乐观工作区更新使用 React transition；标签筛选不活跃时不再为每次输入扫描标签。 | [App 乐观更新](../../../src/App.tsx) |
| 已实现 | 列表排序、标签目录和文件夹/智能文件夹投影共享一次排序和遍历，并按工作区身份缓存；不再为三个派生视图分别排序和扫描资料库。 | [工作区投影](../../../src/workspace-projection.ts) · [App 接入](../../../src/App.tsx) |
| 待实施 | macOS/Android 同源包体基线、符号剥离、ThinLTO、字体和依赖裁剪实验。 | 见下方安装包章节 |
| 待采集 | macOS WKWebView、Android 实体机上的输入延迟、长任务、保存队列和 ACK 基线。 | 见下方验收表 |

本轮验证只覆盖源码、浏览器引擎和合成数据，不代表真实 WebView 输入法或安装包体积验收：

```text
pnpm typecheck
pnpm test:schema
pnpm test:editor
pnpm test:editor-hot-path
pnpm test:save-scheduler
pnpm test:workspace-projection
check-tags-browser.mjs                         31 项通过
check-mobile-editor-interactions.mjs           21 项通过
check-table-controls-browser.mjs               通过
check-recording-refresh.mjs                    通过
```

`check-tags-composition-retention.mjs` 和 `check-tags-save-boundary.mjs` 需要仓库外的既有 reviewed Store CLI；本机未找到该二进制，未运行。macOS 和 Android 真机性能、安装包同源重建与设备验收仍未执行。

## 编辑器输入性能

### 当前调用链

用户所说的 Markdown 编辑窗口对应 CyberNote 的 Tiptap/ProseMirror 富文本编辑器。桌面主窗、独立笔记窗和 Android 编辑页共用正文与保存链路。编辑会话管理焦点、面板、书签和导航失效。保存与授权仍由 App、原生 Session 和 Store 负责。[编辑器会话](../../architecture/editor-session.md) · [双端呈现](../../ui/adaptive-presentation.md)

```text
键盘 / IME / 粘贴 → ProseMirror 事务 → 标签插件 → 正文更新
  → 整篇 JSON 与保存标签校验（常见路径不再深拷贝）→ App 乐观更新与保存队列
      ├─ React 工作区 → 标签、智能文件夹、筛选与排序
      └─ 原生保存意图 → Session 校验 → Store 事务 → ACK → 工作区刷新
```

| 源码确认的行为 | 对体验的影响假设 | 代码入口 |
| --- | --- | --- |
| 每次正文更新仍生成整篇 JSON；合法标签不再深拷贝，标签清理已限制在受影响文本块。 | 只改一字时，剩余成本主要来自 `getJSON()`、全文提取和 React 工作区派生。 | [正文更新](../../../src/Editor.tsx#L612) · [保存快照](../../../src/editor-save-snapshot.ts#L10) · [标签插件](../../../src/note-tag-extension.ts#L188) |
| 乐观更新提取全文并发布工作区状态；标签和文本已按文档身份缓存，React 更新降为 transition。列表、标签目录和智能文件夹共享一次投影，但仍随工作区对象变化重新计算。 | 资料库规模仍可能放大短笔记的一次按键成本。 | [编辑保存](../../../src/App.tsx#L1570) · [工作区派生](../../../src/App.tsx#L658) · [工作区投影](../../../src/workspace-projection.ts) |
| 普通正文先进入合并调度器，同一笔记最多一笔在途保存和一份最新正文；精确保存会先排空调度器。原生保存意图在调度时登记，排空/失败仍保留现有门禁。 | IPC 或 Store 变慢时旧快照积压已减少，但 ACK、刷新和水合仍需实测。 | [保存调度器](../../../src/editor-save-scheduler.ts) · [保存队列](../../../src/save-queue.ts#L4) · [刷新](../../../src/App.tsx#L1028) · [原生保存](../../../src-tauri/src/session.rs#L353) · [Store](../../../src-tauri/src/store.rs#L501) |
| 表格活动态在事务后可能读取整行、整列的几何。桌面录音期间，目标编辑器的事务还会生成一份 JSON。 | 表格和录音场景可能有独立热点，需要各自采样。 | [表格几何](../../../src/TableControls.tsx#L95) · [录音事务监听](../../../src/App.tsx#L2055) |

### 实施顺序

1. **建立输入基线。** 固定应用构建、设备、系统、WebView 和帧率。使用隔离资料库和合成正文，两组对照分别增加正文长度、资料库笔记数。覆盖短文、长文、含表格和附件的笔记、活动搜索或智能文件夹。记录英文连打、中文候选停留与上屏、大段粘贴。分段记录输入到下一次可见更新、事务与标签检查、JSON 快照、React 提交、布局绘制、保存队列深度和 ACK 延迟。采样只记录耗时和计数。**当前状态：待采集。**
2. **缩小每次输入的计算范围。** 把常规标签检查限制在受影响文本块，以合成结束、复杂结构变更和无法可靠映射的事务覆盖完整检查路径。按正文身份复用标签、清单、标题和摘要，仅失效受影响的投影。保持现有过滤、排序和授权判定。表格控件对选区、表结构与实际布局变化作响应。此阶段沿用现有保存时序，便于归因。**当前状态：标签增量清理、标签/文本缓存、保存快照快速路径和共享工作区投影已实现；按资料库规模进一步增量化仍待采样后决定。**
3. **合并普通正文保存。** 为现有保存协调器加入按笔记及窗口所有权约束的调度。同一笔记保留一笔在途保存与一份最新的待提交正文，待提交内容立即计入未保存。当前仍由 Editor 回调生成 `getJSON()` 快照；采样确认 `getJSON()` 占主要成本后，再评估把 JSON 物化推迟到提交时。可先对照 `150–250 ms` 静默窗口及约 `1 s` 最大等待。通过受控慢 IPC 验证合并、失败恢复和最终快照。**当前状态：调度器和 App 排空接入已实现；受控慢 IPC、真实 Session/Store 和双端竞态验收待执行。**
4. **按采样结果处理剩余热点。** 若媒体布局、纸张绘制或录音期快照仍占主要耗时，分别优化并单独验收。延续现有 ProseMirror 文档、历史和选区生命周期。**当前状态：待采样。**

原生保存意图在访问屏障前登记，并绑定窗口、笔记和授权范围。更改调度时，先明确待提交正文如何加入现有屏障排空契约，再接入切笔记、返回、关窗、锁定、同步和外部写入。屏障成功依赖真实 ACK，排空失败要保留待保存正文和错误。对导航、撤权和销毁后的旧回调验证 owner 与代次。附件、OCR、录音操作继续按各自精确正文和提交回执确认。[保存意图](../../../src/bridge.ts#L122) · [原生屏障校验](../../../src-tauri/src/session.rs#L376) · [现有排空入口](../../../src/App.tsx#L1141)

### 性能与行为验收

| 检查 | 建议通过条件 |
| --- | --- |
| 打字延迟 | 同设备、同负载、同测量口径下，长文输入到可见的 p95 较基线下降至少 30%，短文无可重复退化。基线采集后确认阈值，并保留输入延迟、长任务和 ACK 的独立数据。 |
| 保存压力 | 连续输入和慢 IPC 下，普通待提交项有界。最终正文及格式与预期一致，重开可恢复。保存失败和版本冲突可见且可重试。 |
| 输入与导航 | macOS WKWebView 主窗和独立窗、Android 实体机分别验证中文候选及上屏、选区、撤销/重做、任务列表、表格和焦点。覆盖 Android 返回与窄屏、双端亮暗外观。 |
| 授权与并发 | 用受控延迟覆盖输入与锁定、关窗、切笔记、同步、外部更新重叠。过期保存保持原 owner，撤权后受到既有门禁约束。附件、OCR 和录音仍等待对应的保存回执。 |

实现阶段从 `pnpm test:schema`、`pnpm test:editor`、`pnpm test:mobile-editor`、`pnpm test:table-controls`、`pnpm test:recording-refresh` 及会话回归中选取受影响用例。测试记录区分浏览器、真实 WebView 和安装包上的输入法证据。[现有会话用例](../../../src/editor-session/README.md)

## macOS 和 Android 安装包体积

本轮只完成源码归因和方案，不修改 Cargo release profile、Gradle 打包参数、字体资源、签名或发布流程；以下实验需要在同源构建中单独测量后再决定是否采用。

### 已记录的样本

| 来源 | 下载或包体大小 | 包内观察 |
| --- | --- | --- |
| GitHub `v0.2.4` 正式资产元数据 | macOS arm64 ZIP 48.19 MiB、DMG 51.45 MiB。Android arm64 签名 APK 53.45 MiB。 | 完整资产下载超时，正式包内部归因待补。 |
| 本机 macOS `0.2.3` 已安装 `.app` | 已测包内文件的未压缩字节。 | 主程序 89.02 MiB，MCP sidecar 7.91 MiB。 |
| 本地 Android `0.2.2` arm64 QA release APK | 53.42 MiB。 | 主 Rust `.so` 压缩后 44.85 MiB，占约 84%，含符号表。OCR 原生库与模型合计约 6 MiB，DEX 约 1.48 MiB。 |

当前 macOS ZIP、DMG 和 Android APK 的发布流水线已使用单 arm64 产物。两端主程序都为离线 SVG 文字缩略图内嵌约 15.68 MiB 的 Noto CJK 字体。字体原始字节、符号段大小和最终压缩包收益应分别测量。[发布资产](https://github.com/ywateru/CyberNote/releases/tag/v0.2.4) · [发布流水线](../../../.github/workflows/packages.yml) · [内嵌字体](../../../src-tauri/fonts/README.md) · [缩略图契约](../../architecture/attachment-media.md)

源码核对补充：`src-tauri/Cargo.toml` 当前没有 `[profile.release]`，因此使用 Cargo 默认 release 配置，未启用 ThinLTO 或 strip；Android release 已启用 AGP `optimization`，但 `packaging.jniLibs.useLegacyPackaging = true` 仍按传统方式打包 JNI 库。符号剥离、LTO 和 JNI 压缩都应作为单变量实验，而不是与依赖裁剪同时修改。[Cargo 配置](../../../src-tauri/Cargo.toml) · [Android release 配置](../../../src-tauri/gen/android/app/build.gradle.kts#L63)

### 实施顺序

1. **建立同源包体基线。** 按发布流程固定 source stamp、目标架构与工具链。记录 ZIP、DMG、APK 的字节数，以及包内文件压缩前后尺寸和设备安装占用。归因到主程序、MCP、符号段、字体、前端、DEX、Android 资源与 OCR。按 `agent.md` 复用已有版本号和构建身份流程。
2. **先测符号剥离及编译参数。** macOS 主程序、MCP sidecar、Android 主 `.so` 分别做基线、仅剥离符号、仅启用 ThinLTO、剥离加 ThinLTO 四组对照。随后视结果单独比较 `opt-level`。保留与发包二进制匹配的符号文件并验证崩溃符号化，在签名前处理二进制。沿用 unwind 行为以兼容现有异常捕获路径。用最终分发字节、冷启、构建耗时及编辑和同步表现决定是否采用。[MCP 打包](../../../scripts/bundle-mcp.mjs) · [发包与签名](../../../scripts/publish/stage-packages.py)
3. **缩减能证明未使用的依赖和资源。** 用各目标的 Cargo feature 树和二进制归因确认冗余。Android 已启用 AGP release 优化，从 R8 报告、资源报告和实际保留规则找可删项，回归 JNI、插件和原生界面。前端按需加载优先服务启动解析，安装包收益用总产物字节差衡量。[Android release 配置](../../../src-tauri/gen/android/app/build.gradle.kts#L63) · [前端构建配置](../../../vite.config.ts)
4. **单独验证字体和 Android 打包实验。** 先评估保持完整字形覆盖的字体编码或压缩，测包体、首个缩略图延迟和内存。若考虑字体子集，增加简繁、罕见字、许可和缓存版本证据。对 Android JNI 库压缩方式的调整分别测下载、安装占用和 16 KB 页兼容。默认发行范围包含首次离线中文 OCR 和 macOS 内置 MCP。[扫描与 OCR 契约](../../../plugins/tauri-plugin-notes-scan/README.md) · [16 KB 页大小](https://developer.android.com/guide/practices/page-sizes)

### 发布验收

| 平台 | 检查 |
| --- | --- |
| macOS | 从同一签名 `.app` 取得 ZIP 和 DMG，验证架构、签名、包内身份、安装启动和 MCP stdio 握手。 |
| Android | 核对 release 标志、ABI、应用 ID、签名证书及对齐。验证保数据覆盖升级、冷启动、无网首次中文 OCR、相机扫描与附件。 |
| 两端 | 验证 SVG 文字缩略图、正文恢复、附件和同步相关路径。核包回执记录二进制与安装包尺寸、SHA-256、版本、revision、产品指纹、工具链和实测范围。首轮同源实测后再为 ZIP、DMG、APK 分别设置体积预算。 |

发布身份、签名和交付流程沿用已有可执行检查。[构建与交付](../../architecture/build-delivery.md) · [发布工具说明](../../../scripts/publish/README.md) · [仓库指南](../../../agent.md)

## 启动顺序与交付物

| 可独立验收的任务 | 前置条件 | 交付物 |
| --- | --- | --- |
| 编辑器测量与双端基线 | 合成语料和隔离环境 | 样本、原始 trace、输入及 ACK 指标、主要热点归因。 |
| 签名发布包与符号基线 | 固定源码及工具链 | 同源体积明细、按平台归因、基线核包回执。 |
| 输入同步计算优化 | 编辑器基线 | 最早稳定边界的回归用例、同口径前后对比及双端行为结果。 |
| 发布二进制瘦身 | 包体基线 | 单变量构建对照、符号化证据、新包核验和设备结果。 |
| 普通正文保存合并与集成 | 同步计算优化通过，保存屏障契约明确 | 真实 Editor → App → Session → Store 的受控竞态、数据一致性和真机验收。 |

本阶段完成源码追踪、发布资产大小查询、本地样本清点和编辑器第一阶段实现。实机采样、按资料库规模进一步投影增量化、同源包体重建和最终设备验收仍记为待实施。
