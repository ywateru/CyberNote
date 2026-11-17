# appearance117 独立复核

日期：2026-11-17。实现树 `/private/tmp/cybernote-appearance117`，审查 commit `ccfd6ca78de7ed6a64627f8ec1302ba132be2faf`，baseline `bfd93158`。完整阅读两者之间全部 22 个文件的 diff，并追踪实际消费者、CSS 导入顺序、typed IPC / Rust / AppKit 和生成器链。实现只读；本提交仅增加报告。

结论：**BLOCKED：1 项 blocking finding（P2），需要作者修复后复核。** 其余本轮检查通过，具体边界见下文。未运行浏览器、真实 App 或模拟器；UI 由用户自验。

## Blocking

### B1 / P2：清单首行对齐与移动触控扩展没有旧 WebView 的 `lh` 回退

- 位置：`src/style.css:706`（label 的唯一 margin 声明）、`src/style.css:2291`（mobile label::before 的唯一 height 声明）。
- 触发：Android WebView 91，或 Safari/WKWebView 16.4 之前的引擎。项目 `vite.config.ts:12` 仍以 `chrome90` 为构建目标；`src/main.tsx:1`、`src/secure-id.ts:1` 和 `docs/architecture.md:211` 明确保留 WebView 91 兼容路径。
- 根因：`margin: calc((1lh - var(--task-circle)) / 2)` 和 `height: min(44px, 1lh)` 都使用 `lh`，且没有不含 `lh` 的前置 fallback。旧引擎会丢弃整个声明。CSS 构建目标不会把行高单位转换为兼容的运行时几何。
- 结果：label 顶部 margin 回到默认值，圆框失去相对首行的居中定位；空的绝对定位 `::before` 高度为 auto/0，向左扩展的 44px 区域没有实际命中面积。原始 checkbox 仍可点击，但契约要求的正文左侧触控扩展丢失。
- 兼容证据：本轮只读获取 [MDN browser-compat-data 的 length.json](https://raw.githubusercontent.com/mdn/browser-compat-data/main/css/types/length.json)，`css.types.length.lh.__compat.support` 显示 Chrome 从 **109**、Safari 从 **16.4** 开始支持；Android WebView 对应 Chrome 镜像。此结论为源码/兼容数据推导，未冒充设备实测。
- 修复方向：作者为首行行高提供当前支持引擎可计算的值（如继承的无单位行高变量与 em），或者先声明有效 fallback，再渐进增强为 `lh`；同时维持“高度限定首行行盒、仅向左至 44px、紧凑行距”的澄清规则。这里不要求 44px 正方形。
- 现有检查漏检：`scripts/check-appearance117.mjs:151` 起只解析选定三个 CSS 文件的字面声明，甚至明确断言 `min(44px, 1lh)`；不检查引擎支持和 fallback，故专用脚本通过不能消除此 finding。
- 已尝试及时通知主代理：发送到主 chat 的工具拒绝向 native ancestor 发送，且当前会话没有可调用的 native collaboration messaging；本报告和最终回复提供完整回传信息。

## 已核查通过

| 项目 | 结果与证据 |
| --- | --- |
| 全局 label min-height 级联 | `src/main.tsx:9` 起依次导入 style、desktop、design-controls。`src/style.css:697` 的 `.tiptap ul[data-type="taskList"] > li > label` specificity 为 `(0,2,3)`，其 `min-height:0` 胜过后加载的 `src/design-controls.css:17` 全局 label `:has()` 规则 `(0,2,2)`，没有被工具栏命中下限重新撑高。 |
| 桌面/移动任务 p | `src/style.css:741` 仅将任务内容的直接段落 margin/min-height 清零、line-height 继承；移动专门规则 `:2296` 胜过普通移动段落。桌面普通正文的高 specificity 规则限定 `.tiptap > p`，不匹配任务内 p；普通正文原规则保留。 |
| 嵌套与首行 | 任务 li 使用直接子选择器、flex-start；圆框 label 通过首行行高定位，内容 `div` 不再让整个多行项居中。嵌套 taskList 在内容 div 内，缩进由父 label + gap 累积；普通 bullet/ordered list 的 li 不会误套任务 flex。现代引擎源码路径通过，旧引擎问题为 B1。 |
| 移动触控契约 | `src/style.css:2287` 的伪元素 `right:0`、44px 宽，向左扩展、不跨入右侧正文；高度意图限制为 `min(44px,1lh)`，不额外增加任务段距。未要求正文 44px 正方形；旧引擎失效为 B1。 |
| checkbox 勾选/焦点 | 圆形 border-radius 50%，边框改用 secondary；勾选使用 accent 背景与 accent-ink 勾线，对比度矩阵通过。全局 `input:focus-visible` specificity 胜过普通 input 的 outline:none，保留 2px focus 外环。Tiptap 实际 node view 仍是 label/input/change → setNodeMarkup；实现 diff 没有改 schema/交互/保存路径。真实 ProseMirror 历史撤销重做及 nested 结构检查通过。 |
| 八主题正常四列 | `src/Preferences.tsx:36` 为八选项添加 `.preferences-theme-choices`；`src/Preferences.css:207` 后置四列覆盖原三列，容器宽小于 30em/16em 才降列。纳入 `design-controls.css` 的侧栏宽与真实 padding 后，正常 medium 字号 14px 下，窗口 800/920/1280px 的主题容器分别约 **526/578/626px**，均大于 420px（30em），因此保持四列；大字/窄宽可合理降列。这是 CSS 几何核算，不是渲染实测。手机 select 含完整八选项。 |
| HC 普通线 | palette 的 line/content-rule 变为浅色 `#d4d4d4` / 深色 `#343434`；未新增普通分隔线加粗；主题卡高对比专属 2px border 已移除。保留焦点 2px 是键盘焦点语义。 |
| Paper 顶底 | 两个 scheme 中 paper、desktop-toolbar、glass 相等（light `#faf7ef` / dark `#24221d`）；Web 正文/底层表面消费 paper，原生 root 消费同一 palette 的 desktop-toolbar，window.backgroundColor 消费 paper，不再另有硬编码灰色顶部。其他工作区表面保留暖纸层次。 |
| 真正同源原生配色 | `palettes.json` → `generate-theme-tokens.mjs` → `tokens.css` + `macos/theme-palettes.h`；16 行 × 9 个 native role 与源数据逐值一致。guest ToolbarState 的八 ID union → `native-toolbar-state.ts:283` → Rust enum ThemeId（缺省 Classic，非法值反序列化拒绝）→ 序列化字典 → `toolbar.m` 动态 NSColor 查表。build.rs 监听新 header。生成器 --check、TS 检查和实际 ObjC syntax-only 编译通过。 |
| 系统 scheme 与 toolbar 更新 | App effect 按 themeId/schemePreference 安装并清理 applyAppearance；独立无 DOM 引擎测试实际调用全部八主题的系统 change listener，scheme 从 light 切 dark、themeId 不丢。NativePlatform 每次 layout effect reconcile，controller hash 包含完整 state（含 themeId）；独立测试在相同 key/searchScope 下切八主题，只 bind 一次并产生 7 次 update。AppKit appearanceChanged 同时比较 policy/theme；system 设 window.appearance=nil，dynamicProvider 按 appearance 解析，root/search surface 的 viewDidChangeEffectiveAppearance 触发重绘；没有静态 CGColor 快照。AppKit 实际系统切换绘制仍属用户 UI 验收。 |
| owner 稳定性 | 改动没有重建 EditorSession / SaveQueue / 录音 owner 的路径；主题投影仅属性更新。专用测试能证明 applyAppearance 不操作持有的 ProseMirror state；完整 App owner 身份本轮只做源码追踪，未把孤立状态对象测试冒称真实 App 身份实测。 |
| Archive 与历史测试 diff | 白名单扩为八 ID，严格完整对象检查保留；新增 archive 真实单测通过。三个历史 UI 脚本改为从 palette 枚举 ID/检查具体卡 class 或最后一个主题，没有减少主题覆盖；依约未执行它们。 |

## 本轮命令结果

- **PASS** `node scripts/generate-theme-tokens.mjs --check`：生成 CSS 与 AppKit header 均无漂移。
- **PASS** `pnpm typecheck`。
- **PASS** `node scripts/check-appearance117.mjs`：741 checks，720 contrast pairs。结果为 `artifacts/appearance117/result.json`（忽略的测试产物）。
- **PASS** `node scripts/check-editor-schema.mjs`：实际生产 schema 与 manifest 一致，96 个文档 case；更新了本树忽略的 schema transpile 产物，没有改 manifest。
- **PASS** 独立 inline Node 测试：八主题实际 applyAppearance 系统 change/清理；实际 NativeToolbar controller 在同 owner/key 下仅一个绑定、七次主题更新；正常窗口 800/920/1280px 四列的源码几何核算。
- **PASS** `xcrun clang -fsyntax-only -fobjc-arc -fblocks -mmacosx-version-min=12.0 plugins/tauri-plugin-notes-ui/macos/toolbar.m`。仅编译语法检查，无 AppKit 实例或窗口。
- **PASS** 用户释放 Rust slot 后执行：`CARGO_TARGET_DIR=/Users/water/work/2026/Apple-Notes-Clone/src-tauri/target CARGO_BUILD_JOBS=2 cargo test --locked --offline --manifest-path src-tauri/Cargo.toml --lib appearance_v2_settings_and_archive_are_strict_atomic_and_roundtrip`。结果 **1 passed / 0 failed / 410 filtered**，测试执行 0.95s，编译 2m29s。包含新增主题的真实 Store 导出/导入/重开、legacy migration、拒绝非法配置与原子性。既有未使用代码/ObjC property warnings，无本次编译错误。
- **BLOCKED / 主动中止** 插件 enum 单测：先读插件 Cargo.toml，未声明 default feature，desktop-demo 非默认；macOS target 自动启用 tauri/wry，dev-dependency 启用 tauri/test。按要求使用相同 target/jobs，执行 `cargo test --locked --offline --manifest-path plugins/tauri-plugin-notes-ui/Cargo.toml --lib builtin_theme_ids_are_closed_and_legacy_hosts_default_to_classic`。插件独立 Cargo.lock 选择了不同依赖版本（例如 syn 3.0.9、serde 1.0.229、tauri-utils 2.10.2），引发额外依赖编译。剩余空间从 3.6/3.7GiB → 归档完成 2.6GiB → 插件编译 2.1GiB；主动 SIGINT 停止，exit 130，未执行到测试。最终 df 约 **1.7GiB**。未创建新 target、未清理共享产物、未更换锁文件/features，也未再跑 cargo check 造成更多编译。**不得计为 enum 单测通过。** 后续在可用缓存/磁盘足够时补这一个测试；本轮已经通过的归档窄测试不需重复，除非相关实现 fix。

## Nonblocking 与剩余验收

- N1（测试边界）：`scripts/check-appearance117.mjs:145` 起只解析 style/desktop/Preferences 三张表，不含后置 design-controls；其 declarations helper 不模拟 specificity、媒体/容器命中条件。独立源码复核已确认当前 global label 不构成回归、正常 800px 四列成立；建议作者补兼容 fallback 断言，避免 B1 再次漏检。
- N2（测试前置条件）：`scripts/check-appearance117.mjs:121` 依赖已有 `artifacts/editor-schema/editor-schema.mjs`，该文件不在 git。干净 checkout 需要先运行 `node scripts/check-editor-schema.mjs`；本树有既存产物，之后也已从当前树重新生成验证。建议在调用文档中注明顺序或让脚本自建所需生产模块，当前不单独阻断整合。
- 原生 enum 单测执行空白如上；实际 AppKit 动态绘制、桌面/手机紧凑清单的触摸/键盘与逐像素效果由用户自验。命令与源码通过不能代替 UI 验收。
- 本报告只评审上述 commit 的视觉实现；MCP tester 作者的功能 diff 不在本审查 commit 内。不扩大历史测试范围。主整合在 B1 修复后执行组合编译/命令；仅相关 fix 才需要重跑已通过的窄归档测试。
