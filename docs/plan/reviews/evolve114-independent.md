# evolve114 主题独立审查

2026-11-17。结论：**BLOCKED，5 项 P2 blocking；未发现 P1。** 作者的 247 项检查和 2 项 Store 回归可以复现通过，但新增独立探针发现已提交外观被无关写入覆盖、智能文件夹表面透明、矩形表格选区遮字，以及两个未采样表面的文字对比度退化。修复并复核前不建议合入 114。

## 对象与范围

- 工作树 `/Users/water/work/2026/Apple-Notes-Clone-evolve114`，分支 `codex/evolve-114`；被审提交 `b6040ea1bf9d4ecee12fbecf59ca2c15b4381f28`，父提交 `89dc171b90a74d8ddc183f9ec90486a2b16c0387`。开始时干净。
- 阅读全部提交 diff、任务 114、主题/呈现架构、adaptive presentation、design rules、设置与启动文档、作者 verification/receipt；结合 frontend-design skill 检查既定视觉方向、可读性、状态与几何。没有开发此功能，也没有修改作者实现或脚本。
- 运行真实 React App/Preferences/Tiptap/录音控制器、隔离 JS IPC/capture，以及复制生产模块的真实 SQLite Store/archive。不是整套原生 App、真实 IPC、实际输入法、麦克风或 Android 验收；这些仍留给 116。
- 114 基线没有新 AgentSettings。本审查不把别的树组件复制进来，不声称 actual Agent 页/授权对话框视觉通过；合入后的真实页面仍需验证。

## Blocking

### 1. [P2] ACK 后确认读取失败，后续无关设置写入覆盖已经提交的主题

位置：`src/confirmed-settings.ts:37`、`:45`，`src/themes/appearance.ts:38`，生产接线 `src/App.tsx:1197`。

`persist` 已成功而 `read` 失败时，owner 保持旧确认值是合理的显示行为；问题是下一笔写入仍以该旧值调用 `appearancePatch`，即使调用者只改 `sort`，也补上完整旧 appearance/theme。Store 收到的是合法的显式新对象，因而会把已经成功提交的主题覆盖回旧值。队列未等待恢复权威状态，也未保留“不涉及外观”的部分更新语义。

独立 owner 探针：Classic/light → 第一笔 Paper/light 已持久化、确认读取抛错 → 已排队的 `{sort:"updated"}`。第二笔实际 patch 为 `{sort:"updated",appearance:{version:2,themeId:"classic",schemePreference:"light"},theme:"light"}`，最终变回 Classic。

真实 App 路径也复现：给隔离 IPC 的下一次 `load_workspace` 注入失败，执行 Paper/dark 更新。backend 已为 Paper/dark，实际 App 仍显示 Classic/light；关闭错误后只改排序，backend 与 App 都变回 Classic/light。不是仅凭模拟 owner 推断持久结果：把实际 owner 捕获的两笔 patch 交给生产 Store，关闭重开后“应保留 paper”的独立 Rust 断言失败，实际为 `classic`。

修复要求：ACK 后确认失败必须有明确的权威恢复/部分更新处理；后续无关设置和旧 theme-only 写入不得补入失真的旧皮肤。保留失败期间旧确认 UI、串行队列、晚到票据保护，以及 V2/旧投影单次原子保存。回归至少包含这两种后续写入，并检查真实 Store 重开。

### 2. [P2] 移除 fallback 后引用未定义 token，智能文件夹对话框与控件失去背景

位置：`src/smart-folders.css:10`、`:47`、`:88`、`:149`、`:190`、`:258`，普通创建的 checkbox 为 `:549`。

本次删除 `--text/--panel/--surface` 的 fallback，但六份 palette 和其他源码没有定义这些别名。普通创建的特化背景暂时掩盖问题；勾选“制作智能文件夹”后，该特化消失，真实 `.smart-form` 在六种配色中全部计算为 `rgba(0, 0, 0, 0)`。主工作区的分栏线与内容直接穿过表单，截图已确认。警告面板和标签弹层还有相同未定义背景引用。浅色普通创建中，去掉原生 appearance、同时没有 border 的未选 checkbox 又依赖仅在 `.dark` 中定义的 `--ordinary-checkbox`，因此失去可见填充。

复现：实际 App `folder.open` → 勾选真实 checkbox；读取 computed background 与 `--panel/--surface`，六次背景均透明且 token 为空。例图 `/tmp/evolve114-folder-paper-light.png`。需映射到注册表中的真实语义角色，并覆盖普通/智能/警告/标签及浅色 checkbox，不能只给当前一种表单补色。

### 3. [P2] 普通 CellSelection 的不透明覆盖层遮住已选正文

位置：`src/style.css:750`，尤其 `:756`；行列特化见 `:790`。

原先半透明的选区 `rgba(255,204,0,.17)` 被换成不透明 `var(--accent)`。该 `::after` 有正 z-index 且铺满单元格，普通矩形 CellSelection 的内容被整块盖住。行/列按钮路径存在 `.table-selection-outline` 时会另行设为透明，不能据其通过证明普通选区可读。

独立探针在真实 Editor 建立两格表格，用实际 `setCellSelection` 产生非 axis 选区：两个 cell 的位置为 11/24，选区建立成功，没有 axis outline；覆盖层 computed background 为 `rgb(217,147,0)`、opacity=1、z-index=1。原尺寸截图 `/tmp/evolve114-selected-cell-opaque.png` 中两个单元格文字均消失，文档 JSON 未被删除。需恢复可见正文的主题化透明高亮或等价的正确绘制层次，并覆盖鼠标/矩形与行列两类选区。

### 4. [P2] 附件画廊选中分类的文字使用了错误的前景角色

位置：`src/AttachmentGallery.css:56`、`:60`。

选中分类背景使用 `accent`，标题却用 `ink`，计数用 `action-ink`。这些角色只在普通表面有保证，无法作为 accent 上的文字。真实 App 打开“显示选项 → 查看附件”，默认选中“全部附件”，六种配色都有不合格的小字：

| 配色 | 标题对比度（如失败） | 计数对比度 |
| --- | --- | --- |
| Classic light | 标题通过 | 2.487 |
| Classic dark | 1.724 | 1.035 |
| Paper light | 2.577 | 1.193 |
| Paper dark | 1.453 | 1.000 |
| High Contrast light | 2.501 | 1.004 |
| High Contrast dark | 1.779 | 1.001 |

采样包含真实选中反馈叠层，均为可见且非 disabled 的普通文字。不是用户自定义正文色。原图 `/tmp/evolve114-attachments-<theme>-<scheme>.png`，完整数值在 surfaces results。需选择经过配对验证的前景/背景，包含计数、hover/focus/选中反馈状态，补实际 AttachmentGallery 的回归。

### 5. [P2] Toast 使用 scrim + accent-ink，暗色提示可变成黑底黑字

位置：`src/style.css:1331`，尤其 `:1340`、`:1341`。

原先深色半透明背景配白字，本次改成遮罩 scrim 配“强调色上的文字”。这两个 token 没有可读性关系。独立探针点击实际笔记日期触发生产 `.toast`；Classic light 为 9.848，通过；Classic dark 1.074、Paper light 1.900、Paper dark 1.085、High Contrast light 1.781、High Contrast dark **1.000**。最后一种实际为黑字叠黑底，截图 `/tmp/evolve114-toast-high-contrast-dark.png` 看不到提示文字。

该消息通道也用于复制/备份/操作反馈。应使用专用、经验证的 notice 表面与前景配对，不能把仅适合 accent 的文字直接放在 scrim 上。补六种配色的实际 toast 测试。

## 命令、独立探针与结果

以下均在被审工作树运行；没有使用主 Tauri target、没有原生 GUI/手机/用户资料库访问。临时测试不进入提交。

| 检查 | 实际结果 |
| --- | --- |
| `npm run typecheck` | 通过，tsc 无诊断 |
| `node scripts/generate-theme-tokens.mjs --check` | 通过，提交 tokens 与色板/几何生成源一致 |
| `node scripts/check-evolve114-themes.mjs` | exit 0，**247 项通过**；162 静态配对、48 个 DOM 状态/1617 对，原采样失败 0；三主题最低值分别 4.7453/4.7266/5.2169 |
| `node scripts/check-evolve114-store.mjs` | exit 0，**2 passed / 0 failed**；旧 interfaceDetails 与 AppearanceV2 真实 Store/archive 回归 |
| `/tmp/evolve114-independent.mjs` | exit 1，8 个契约检查均失败：两个“保留已提交皮肤”路径与六种智能表单背景；失败即实际缺陷，不是“exit 0 表示复现”式反向断言 |
| `/tmp/evolve114-independent-surfaces.mjs` | exit 1；独立 20 个 schema 非法值全部拒绝、空旧设置默认、确认读取期间外部采纳后重读、9 种非法启动缓存恢复、axis 选区覆盖均通过；六种附件画廊对比度契约失败 |
| `/tmp/evolve114-independent-table-toast.mjs` | 最终 exit 1；非 axis 选区可读性失败，六种真实日期 toast 中 1 通过/5 失败 |
| 临时 Rust harness，过滤 `independent_` | exit 101，**5 passed / 1 failed**。本轮新增 3 项：SQL 错误原子性/重启、空旧设置与只读导出均通过；实际 owner patches 的 Store 重开保留皮肤断言失败。另 3 项为原生产测试已有 independent 命名用例，通过 |
| `/tmp/evolve114-independent-baseline.mjs` | exit 0，从父提交导出的只读临时源码运行，重新捕获桌面/移动 × 明暗四状态 |
| `git diff --check` | 通过 |

浏览器环境与作者文档一致：

```sh
PLAYWRIGHT_CORE_PATH=/Users/water/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.mjs \
CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
node scripts/check-evolve114-themes.mjs
```

将最后一行脚本换为上表 `/tmp/` 独立脚本即可复跑。独立 Store 命令：

```sh
CARGO_TARGET_DIR=/Users/water/work/2026/Apple-Notes-Clone-evolve114/artifacts/evolve114-store/target \
CARGO_BUILD_JOBS=2 cargo test --locked --offline --features rusqlite/hooks \
  --manifest-path /tmp/evolve114-independent-store-root/harness/Cargo.toml \
  independent_ -- --nocapture
```

独立 Store 仅在临时副本的 `src/store/archive/tests.rs` 末尾追加测试；实现源未改。原脚本复制的 **35 个 Store/Session/sync model `.rs` 文件逐字节与生产一致**，receipt 的 3 个源码 SHA256 也与当前 HEAD 一致；存储依赖为真实 rusqlite/SQLite，不是 fake persistence。临时 harness 的 fixture 相对路径已补齐。其第一次缺 fixture 的编译准备失败不计为产品失败。

原始独立脚本、结果及 Rust 日志已另存 `/tmp/evolve114-independent-original-evidence/`，附 `sha256.json`；便于开发者复用准确探针并保留修复前证据。常用结果：

- `/tmp/evolve114-independent-results.json`
- `/tmp/evolve114-independent-surfaces-results.json`
- `/tmp/evolve114-independent-table-toast-results.json`
- `/tmp/evolve114-independent-store.log`
- `/tmp/evolve114-independent-store-root/harness/src/store/archive/tests.rs`（新增 3 个 `independent_` 测试在末尾）

一个早期可选 share-toast 探针在分享边界等待，已结束其自有隔离 Chrome；没有把等待记为产品缺陷或测试通过。最终 toast 证据来自有界的实际日期点击路径。父提交快照准备时的路径/依赖问题已修正后重跑；仅成功的四状态捕获计入基线证据。

## 已核对的通过范围与限制

**Schema/持久化。** TS parser 使用精确自有三键，拒绝未知 ID、额外/缺失/null/类型错误；Rust 对三字段、版本及枚举严格校验，作者还验证 2.0 的 archive 数值表示拒绝。旧配置读取不落盘迁移，新对象优先；合法旧 API 保留皮肤只改 scheme。生产单次 settings UPDATE 保存 V2/旧投影，导入先验后发布，导出纠正投影但不回写设置；9 种 theme×scheme 真实归档往返、重开及扩展字段保留通过。此范围不消除 blocking 1 的前端陈旧 patch 问题。

**队列/失败/晚到。** 正常 FIFO 基于最后确认值、嵌套对象入队复制、失败不发布、过期 ticket 拒绝，以及确认读取期间外部采纳后重读通过。额外独立竞态探针观察到两次 read，外部 Paper/system 未被第一次迟到读覆盖。ACK 已成功但确认失败后的继续写入是本轮独立发现的缺口。

**真实表面。** 247 脚本实际运行了六种主页面、设置、portal 菜单、图片预览/信息、访问 prepare 覆盖、桌面 active/paused 与移动 paused 录音、启动入口失败恢复。根 palette 被确认设置驱动；独立 `?note=` 初始从权威设置校正缓存。非法缓存的独立 9 例回到 Classic/system，恢复入口可见且 root inert。没有新跨窗实时同步通道，不推断真实原生独立窗已通过。

**Classic 基线。** 独立导出父提交而非管理/切换工作树，重捕四张 baseline。与作者 before 图：桌面浅、移动浅/暗的 RGB 差为 0；桌面暗平均每通道差小于 0.00005。与新图同尺寸/状态比较，确有次级字、反馈背景、圆角及移动暗底变化，不能称逐像素不变。作者文档明确列出了提高小字/动作对比度、边线/实色背景、统一移动语义和组件基础半径的理由；这些取舍与既定 brief 一致。联系图 `/tmp/evolve114-independent-classic-comparison.jpg` 已实际查看，主三栏、字体、白正文/灰导航/黄强调方向保留；移动暗色变动最大已有说明。以上不豁免新增的表面/选区/toast 问题。

**Editor/录音/几何。** diff 没有修改 Editor 的 key、setContent、Undo/保存/录音 owner；App 的主题 effect 仅根属性、media 订阅与已确认启动缓存。真实组件复跑中同 Tiptap 实例、view、DOM、JSON、selection、编辑后换肤再 Undo、合成 composition 连续性通过；实际 recording panel/phase 在换肤中持续。capture 和 composition 输入是合成边界，不是 native IME/TCC/录音文件证据。组件 radius token 在 recording-layout/示例作用域重新求值，各基础值保持独立；真实移动 gallery 的 0/150（上限24px）与语义圆按钮通过。正文 marks/图片/速绘内容不重写。

**原生投影。** `src/native-toolbar-state.ts:282` 仅投影 `schemePreference`；Rust `plugins/tauri-plugin-notes-ui/src/model.rs:163` 的 enum 仍只接受 System/Light/Dark，没有假设 AppKit 能消费 Web palette/圆角。实际系统菜单、原生首屏闪变、独立原生窗口、真实输入法/设备验收留 116。本轮没有占主 target，也没有以 native-free harness 冒充完整 Tauri cargo check。

最终仅提交本 review。结论保持 **114 source/component 阶段 BLOCKED**；作者通过项与本轮新增失败证据同时成立，不能据 247/2 或原有静态/DOM 计数宣称主题整体完成。
