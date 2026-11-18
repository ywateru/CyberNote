# CyberBus 发布 inventory：62 项既有差异分组审计

2026-11-18，独立 verify agent。**来源与敏感内容审计：pass；最终 source export：仍 blocked。** 62 项均能追溯到本仓库既有开发提交，未发现凭据、用户资料库内容、外部原始日志或来源不明的二进制。可以按下列分组审核后更新对应的既有 SHA，但本报告没有修改或自动刷新任何 inventory，也不代表完整发布清单、许可证闭包或组合构建已通过。

## 固定输入与证据

- manifest/被审源码：platform `b74eeb637a68370d2b4faae26647be349fa31c50`。
- platform 之前的基线：`728cac3815c3cc5b9932e50699a4072467bb25f3`。
- 旧 inventory 对应源码：`7e99c4c4a086d397cd05193c6480389c6eacc271`，2026-11-16，`Refresh source delivery inventory for CyberGrid SDK 0.4.0`。
- 逐条计算 platform manifest 的 SHA256，精确得到 **62** 个不匹配路径。其 expected SHA **62/62** 均匹配 `7e99c4c4` 的对应源码；当前 blob **62/62** 均与 `728cac38` 完全相同。两段 ancestry 已检查。这不是本轮 platform 改坏了 62 个哈希，也不是未提交工作区字节混入。
- 62 项合计 **1,360,797 bytes**，全部为 regular tracked text，未见 NUL/二进制内容；相对上述旧源码共 **+2,412 / -1,247 行**。来源变化集中在 2026-11-17 的服务/Agent/主题/呈现交互开发。
- 与 `b74eeb637` 的产品变更路径精确交集为 **0**。但 `src-tauri/Cargo.toml`、`src-tauri/Cargo.lock`、`src-tauri/src/lib.rs` 这 **3** 项属于 CyberBus finalizer 的 native 输入，最终合并后必须重新核对；其余 **59** 项不能依靠该 finalizer 顺带处理。

检查只读 Git committed blobs、历史 diff 和必要的本地依赖引用，未读取运行中的应用、用户 Notes、grant store、原始设备回执或线上账户。作者并行产生的修复工作区字节不属于本报告输入；后续修复 SHA 另行复审。

## 六组可 review 清单（合计 62 项）

| 组 | 数量 | 既有变化与来源 | 与本轮 scope 的交叉 | 凭据／外部原始日志风险与更新判断 |
| --- | ---: | --- | --- | --- |
| A 构建、发布入口 | 3 | 新增历史 interaction test 命令；把 MCP bundle hook 纳入产品指纹；向 frontend release stamp 补传 dirty/inputCount。`6309967f`、`515e9f14`、`f9f1188b` | 构建/发布共享契约，非本轮 platform 修改；未来打包需保留这些既有修正 | 未见凭据或构建机器日志。属于源代码/配置，可更新现有 pins；需同时核对 MCP source/hook 缺漏，见后文 |
| B 原生工具栏主题 | 6 | 有限 ThemeId、八套 palette 的原生投影、颜色/外观刷新、对应测试。`ccfd6ca7` | `notes-ui`，区别于本轮 `notes-auth`；无直接文件交叉 | 颜色/枚举/测试源码，无 key、授权记录或原始屏幕数据。可更新既有 pins；补齐被引用的 palette header 需单独列新增输入 |
| C 编辑、移动交互 | 4 | 移动 interaction context、播放器点击语义、IME/visualViewport 高度与旋转恢复、字体/列宽计算。`6309967f` | 本轮 scope 外；账户前端运行在相同 App 中，不能回退这些既有交互 | 未见正文快照、用户附件或原始输入日志。可更新既有 pins；需保留 interaction 模块引用闭包 |
| D 原生服务、Store、测试 | 15 | Application/Agent host 装配、外部写屏障、Store schema、严格文档字段、appearance/presentation settings、受 cfg 限制的诊断与测试。`868c6dcf`、`4ceb15e9`、`eb9cee7d`、`ccfd6ca7`、`515e9f14` 等 | **Cargo.toml/lock/lib.rs 与本轮 native integration 重叠**；Session/Store 屏障也是 account 接入上下文 | 包含处理 grant/文件/诊断的代码，但没有持久 grant、真实 token、设备日志或用户 DB。旧基线 blob 可追溯；最终这 3 个 native 文件不能直接以本次旧基线审计替代合并后复核 |
| E 前端装配、设置、协调 | 11 | themes/presentation/shells/Agent UI 装配、设置确认与失败恢复、Agent/同步冻结协调、导航提交代际、debug DTO 扩展。`7e53af80`、`7a5bb3dc`、`5e10f614`、`e5e66193`、`f6e0b6b4` | App/bridge 为账户功能的共享装配处；不是本轮 account-client DTO 的改动 | 有诊断接口的源码和允许的字段名，没有运行时采样结果、note body dump 或登录凭据。可更新既有 pins；新增依赖需另审 |
| F 主题首屏、样式 | 23 | AppearanceV2 首屏缓存、theme tokens、CSS 语义色/半径、高对比、checklist 与布局修正。`b6040ea1`、`43f583e3`、`ccfd6ca7`、`bdae5d21` | `AccountSettings.css` 邻接本轮账户页面，但本轮改的是 `.tsx`；其余为共享外观 | 缓存代码只涉及外观偏好，不是实际 localStorage 导出。未发现外部图片/跟踪 URL、凭据或原始用户数据。可更新既有 pins；tokens/geometry 等新增输入不可遗漏 |

精确路径按组列出，以下是审阅清单，不是允许通配符导入的发布规则。

**A / 3**：`package.json`、`scripts/build-info.mjs`、`scripts/release.mjs`。

**B / 6**：`plugins/tauri-plugin-notes-ui/build.rs`、`plugins/tauri-plugin-notes-ui/guest-js/index.ts`、`plugins/tauri-plugin-notes-ui/macos/toolbar.m`、`plugins/tauri-plugin-notes-ui/src/model.rs`、`plugins/tauri-plugin-notes-ui/src/tests.rs`、`src/native-toolbar-state.ts`。

**C / 4**：`src/editor-session/controller.ts`、`src/editor-session/use-editor-session.ts`、`src/Editor.tsx`、`src/font-size.ts`。

**D / 15**：`src-tauri/capabilities/default.json`、`src-tauri/Cargo.lock`、`src-tauri/Cargo.toml`、`src-tauri/src/lib.rs`、`src-tauri/src/session.rs`、`src-tauri/src/session/metadata.rs`、`src-tauri/src/session/synchronization.rs`、`src-tauri/src/startup_tests.rs`、`src-tauri/src/startup.rs`、`src-tauri/src/store.rs`、`src-tauri/src/store/archive.rs`、`src-tauri/src/store/archive/document.rs`、`src-tauri/src/store/archive/tests.rs`、`src-tauri/src/sync_e2e.rs`、`src-tauri/src/sync/adapter_media_tests.rs`。

**E / 11**：`src/App.tsx`、`src/bridge.ts`、`src/confirmed-settings.ts`、`src/debug/protocol.ts`、`src/debug/runtime.ts`、`src/navigation/use-navigation.ts`、`src/network-sync.ts`、`src/platform/layout.ts`、`src/platform/system-events.ts`、`src/Preferences.tsx`、`src/types.ts`。

**F / 23**：`index.html`、`public/startup.css`、`public/startup.js`；`src/` 下的 `AccountSettings.css`、`AppleNotesImport.css`、`AttachmentGallery.css`、`button-feedback.css`、`DataManagement.css`、`design-controls.css`、`desktop.css`、`DrawingPanel.css`、`ImagePreview.css`、`interface-details.ts`、`main.tsx`、`Menu.css`、`OcrPanel.css`、`Preferences.css`、`RecordingPanel.css`、`smart-folders.css`、`smart-folders.ts`、`startup.ts`、`style.css`、`SyncSettings.css`。

## 敏感内容与来源判断

对全部 62 个实际 blob 执行 `scripts/publish/policy.mjs` 的 `scanBytes`，**62/62 pass**。另外核对了 literal auth/password/client-secret/access-token/refresh-token/API-key 赋值、URL userinfo/敏感 query 和行首原始时间戳/stdout/stderr 记录，未发现候选。没有执行 `readInventory(..., {refresh:true})` 或 manifest refresh 命令。

这 62 项识别出的 HTTP(S)/WS/Redis URL origin 仅为 `http://tauri.localhost`、`http://www.w3.org`、`https://github.com`；分别属于 Tauri 本地 origin、SVG 命名空间、Cargo registry 来源。未见含口令 URL、外部日志服务或不明下载来源。

需要人工理解但不应误报为秘密的三类内容：

- Cargo.lock 新增 `unicode-normalization 0.1.26`，有 crates.io registry source/checksum，Cargo.toml 同步增加依赖；Tokio 增加 `process` feature。checksum 是依赖完整性数据，不是凭据。最终 Rust dependency license closure 仍按最终 lockfile 单独核对。
- `lib.rs` 新增 Agent grant/settings/tester/window 命令和实际服务创建链；它们是凭据处理与权限边界的**代码**。capability diff 反而移除了 renderer 任意创建 WebviewWindow 的 permission。这里判断的是导出内容，不重新判定这些模块的功能安全验收。
- `sync_e2e.rs` 新增诊断 ring/操作，受 `all(feature = "sync-e2e", debug_assertions, desktop)` 限制；保存或返回诊断的逻辑不等于已把诊断结果写进源码。`startup_tests.rs`、archive/media tests 使用临时目录与测试数据。已检查的 diff 中没有运行日期/PID/真实路径回执或附件原字节 dump。

据此，这 **62 个固定版本**可以归类为本仓库已提交的开发变更，而不是未知导入物。这个结论不自动覆盖后续修复、core/account 新文件、所有 Git 历史或将来生成的日志。

## 更新旧 SHA 之外，integrator 需另审的已有输入缺漏

只修 62 个 existing-entry SHA 不会形成可构建的 source export。对 baseline manifest 所保留源码的本地 import / Rust module / include / Objective-C header 引用作只读核对，定位到 **27 个未列的 tracked 直接依赖路径**：其中 **25 个**是下面几组的新增候选入口，另外 **2 个**分别是已有 public fixture 转换和退役 helper，不能笼统当作需要补回的文件。该数量是直接引用定位结果，不是完整递归构建闭包或自动新增清单。

| 缺漏组 | 已确认的引用和候选输入 | 来源／风险／处理建议 |
| --- | --- | --- |
| 主题、呈现、shell | `index.html`/`src/main.tsx` → `src/themes/tokens.css`；`interface-details.ts` → `src/themes/geometry.json`；App/bridge/types → `src/themes/appearance.ts`、`src/presentation/model.ts`、`resolver.ts`、`context.ts`、`PreferencesPresentation.tsx`、`src/shells/WorkspaceShell.tsx`、`MobileShell.tsx`；toolbar → `plugins/tauri-plugin-notes-ui/macos/theme-palettes.h` | 本仓库 114/115/117 开发链。继续引用 registry/palettes、DesktopShell/shell CSS 等，不能只补最先报错的一个文件。按真实 committed import/header 闭包另建 exact path/SHA extension，不要递归收整个目录 |
| 前端 Agent、移动 interaction | App/bridge → `src/AgentSettings.tsx`、`src/agent-window.ts`；App/Editor → `src/platform/interaction.ts` | 本仓库 112/113/118/119 装配；进一步依赖 agent-client/setup/tester UI/CSS 等。源代码可列候选，运行时 grant/config/tester 输出不属于候选；不因当前 62 项扫描通过而预先批准整组新增字节 |
| 原生服务、Agent、WebView | lib → `src-tauri/src/agent_access/mod.rs`、`agent_adapter.rs`、`agent_host/mod.rs`、`agent_host/desktop.rs`、`agent_host/service.rs`、`agent_tester/mod.rs`、`application/mod.rs`、`webview_profile.rs`；Session/Store → `session/external.rs`、`store/application.rs` | 本仓库 111/112/117/119 创建链。需继续展开 `mod`、条件编译和测试 include；source exporter 的现有 closure 检查不验证全部 Rust `mod` 或 ObjC header，不应把 dry-run 通过当完整编译。harness、README 和运行产物分别选择，不能整树 copy |
| archive settings 测试 JSON | `src-tauri/src/store/archive/tests.rs:832` → `src-tauri/tests/evolve114-settings-recovery.json`；`:964` → `src-tauri/tests/evolve115-presentation-replays.json` | 原文件各 4/9 条；分别来自 `43f583e3`、`7e53af80`。已额外读取并扫描，内容为固定 appearance/presentation/settings replay、合成 note 标识，无账户、设备或正文日志；可按精确 blobs 作为 fixture 候选，不改成导入私有采样目录 |
| 打包内置 MCP | `scripts/build-info.mjs` 追踪 `scripts/bundle-mcp.mjs`；tracked `src-tauri/tauri.macos.conf.json` 调用该 hook 并声明 MCP externalBin；hook 构建 `crates/notes-mcp/Cargo.toml` | 以上 hook、macOS 配置、notes-mcp root 均未列在 baseline manifest。这是 119 既有打包缺漏，不属于 62 个 existing-entry mismatch。`crates/notes-mcp` 必须单独声明准确 first-party ownership/rights 并审 exact source/tests/fixtures；不把 `artifacts/bundled-mcp` 或构建输出加入源码库存 |

两项直接依赖例外：

- `src-tauri/src/store/smart_tests.rs` → `docs/fixtures/smart-projection09.json`：`scripts/publish/package-transform.mjs` 已有精确 export-only rewrite，指向已 retained 的 `src-tauri/tests/fixtures/archive/smart-projection09.json`。**不需要为了源码闭包加入 docs/ 原始证据目录。**
- `vendor/cybergrid-sdk/src/provider.rs:261` → `provider-assets/darwin-arm64/cloudflared`：platform 已移除旧 binary/runtimeAssets，但保留的 legacy 源码仍含 `include_bytes!`。现有 `export.mjs:26-28` 会检查该 include，即使最终生产依赖已迁移，也不能忽略这条保留源码的闭包。**不要补回退役 helper**；integrator 应明确处理不再构建的 legacy source/清单保留策略，再严格导出。该事项与核心 vendor/cyberbus 新来源审核分开，后者见 platform review F2。

另一个容易扩大范围的点：`package.json` 仅新增 `test:evolve113-interaction`，公开 package transform 已用 allowlisted scripts 替换开发脚本。无需仅为该历史命令把设备测试器、私有 debug/verification 目录加入公开 source inventory。

## 合法更新顺序建议（未执行）

1. 选定最终 committed source SHA。以这 62 个固定 baseline blob 为分组审阅起点；合并后相同路径若又有变化，尤其三个 native 输入，须审新增差异。不要把本报告当未来 HEAD 字节的预批准。
2. 把 **existing-entry pin 更新**、**遗漏的既有开发模块新增**、**本轮 platform/core/account/vendor 新输入**分成可识别的 review 集合。前者不改变源码归属；新增 `crates/notes-mcp` / `vendor/cyberbus` 则要准确 firstParty/thirdParty provenance 与 licenses。候选引用清单只用于定位，不授权通配符 allowlist。
3. 注意现有工具语义：`scripts/publish/manifest.mjs:26` 会刷新所给 ref 的**全部 existing entries**；extension 只接受未列的新路径（`:20-23`），不能用 extension 限定只刷新这 62 项。integrator 应先查看 dry-run 的完整 changes，确认每项都落在已审核集合；超出部分先审，不直接 `--write`。本轮没有运行这个工具。
4. corrected CyberBus finalizer 仍会在最后调用严格 `readInventory`；它不能替代其范围外的 59 项审核或缺漏模块 closure。可先提交经审核的 baseline inventory 更新，再处理 core/account 合并后的 pins；也可在最终树一次形成清晰分组的 manifest 变更，但必须以最终提交字节重新计算，不能套用 `728cac38` 的旧 native hashes。
5. manifest 更新提交后，严格 `node scripts/publish/export.mjs --ref <最终提交>`，并在独立导出目录验证锁定依赖、前端/原生/MCP/Android 构建与发布 notices。处理 legacy include、模块闭包和 fixed vendor patch，不通过降低 scanner/closure 策略使其变绿。不得用“哈希已更新”代表发布或设备运行通过。

## 本次交付边界

仅新增本审计报告；未改产品、manifest、ownership、hash、导出模板或原故障 fixture，未将候选依赖自动加入发布范围。原 review 的 F1/F2 等待作者修复 SHA 后独立复审。本报告解决的是 **62 项差异是否可追溯、是否含敏感/原始外部数据、应如何分组审核**，并指出影响其合法更新的直接输入缺漏。
