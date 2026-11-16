# evolve115 独立审查

2026-11-17。审查提交 `7e53af80fbc435903d3f3debd43753d939241e8d`，分支 `codex/evolve-115`，父提交/固定基线 `5be79fce343bf1a70b664c5e284cf01d6fea82b9`。审查者未参与实现。本轮仅新增本报告，不修代码或作者脚本，不合并后来的112装配。

**结论：BLOCKED，3项P2 blocking，未发现P1或另列P2 nonblocking；native acceptance：OPEN。** 以下均为本提交可在源码/组件层复现的契约缺口，不以未运行原生包否决模块交付。

## P2 blocking 1：断点切换会关闭已打开的桌面画廊正文

- 代码：[App.tsx:598](../../../src/App.tsx#L598)。`view`来自resolver的当前有效集合视图，`confirmedCollection`却把任何有效视图变化都当成设置改变并执行 `setGalleryEditor(false)`，包括仅因Web跨699/700而改用另一端偏好的情况。
- 契约：[task115](../tasks/evolve-115-presentation.md)要求边界下保留Editor与导航owner；[架构:150](../../architecture/theme-presentation.md#L150)要求手机与桌面集合独立，[UI:37](../../ui/adaptive-presentation.md#L37)要求保持当前正文/位置。
- 实际反例：桌面gallery、手机list，桌面打开note-a正文，再按1280→699→700→1100调整窗口。699时仍可见正文；回700后变成 `desktop gallery-browse page-editor`，正文不可见，1100仍不可见。Editor实例保持同一，但打开正文的路由已被重置。对照仅将手机改为gallery，同一尺寸序列全程保持gallery-edit和正文可见。
- 最小修正：区分用户确认的集合偏好修改与resolver因平台/空间选择另一偏好；不能因为断点变更清除已有galleryEditor导航意图。补“桌面gallery编辑态＋手机list”的真实App往返回归，除实例相同外还应断言正文可见和原路由保持。
- 证据：`/tmp/evolve115-independent-8fNhI4/gallery-boundary.json`、`gallery-boundary-repeat.json`、`gallery-boundary-probe.log`、`failure-1.png`。原始六场景脚本与对照脚本均失败于正文可见断言，未放宽断言或改实现。

## P2 blocking 2：preview保存失败仍会污染下一笔成功设置

- 代码：[bridge.ts:489](../../../src/bridge.ts#L489)先修改 `preview.settings`，到[bridge.ts:496](../../../src/bridge.ts#L496)才调用localStorage持久化。持久化抛错时没有回滚内存候选。
- 契约：[架构:67](../../architecture/theme-presentation.md#L67)要求切换失败保持旧确认值；[架构:69](../../architecture/theme-presentation.md#L69)把preview列为同轮更新边界。失败的未提交Presentation不能在后续无关patch中被当作已存权威值。
- 实际反例：在**无Tauri注入的真实browser-preview App/bridge**中，先保存focus/standard＋mobile list/comfortable。对下一次 `notes-browser-preview` 写入单次注入QuotaExceededError，再尝试改为two-pane/compact＋mobile gallery/standard。失败后UI和localStorage均保持旧对象；随后只保存 `{sort:"created"}`，新成功保存却带入整份先前失败的Presentation，布局、双端密度和手机集合全部跳成失败值。
- 归因边界：底层“先改内存再persist”是原有preview机制；本轮新增Presentation合并沿用了它。本项是115明确要求的preview失败原子性缺口，不指称Rust事务有同样问题，也不把它当作115新引入的所有preview缺陷。真实Rust两项定向检查已通过。
- 最小修正：settings路径先在候选对象上校验/合并，成功写入localStorage后才替换内存preview；或在失败时完整回滚本次settings候选。补失败后 `loadWorkspace`、UI、localStorage及下一笔无关写均保持旧Presentation的回归。
- 证据：`/tmp/evolve115-independent-8fNhI4/preview-v2/preview-quota.json`及 `preview-probes.log`。该路径没有使用FakeBackend的settings合并。第一次探针在预期注入错误处提前退出；该原失败仍保留。修正**探针的预期错误捕获**后，v2完成全流程并真实失败于“下一笔无关保存不能带入失败对象”的断言。

## P2 blocking 3：同文件夹切换搜索来源后抽屉不关闭

- 代码：[App.tsx:4128](../../../src/App.tsx#L4128)只用folderId/tagFilter/noteId构造 `routeKey`；[WorkspaceShell.tsx:15](../../../src/shells/WorkspaceShell.tsx#L15)仅在该key或布局/交互身份改变时关闭抽屉。
- 契约：[架构:149](../../architecture/theme-presentation.md#L149)和[Shell职责](../../../src/shells/README.md)明确路由/来源变化关闭抽屉并恢复触发器焦点。
- 实际反例：two-pane、default文件夹、查询Fixture并打开note-a；打开目录抽屉，再点击当前“备忘录”文件夹。Navigation已从 `page:editor,query:Fixture,searching:true` 变为 `page:notes,query:"",searching:false`，folderId/noteId不变。结果 `data-drawer`仍为open，遮罩和目录仍覆盖新来源，焦点留在抽屉文件夹按钮。
- 最小修正：使用覆盖来源变化的Navigation身份/代次，或将page/query/searching/filter/附件来源等相关字段纳入受控关闭条件；保留内层菜单Escape优先级，避免仅因菜单打开就关闭抽屉。补“当前文件夹相同、搜索/页面来源改变”的真实点击回归。
- 证据：`/tmp/evolve115-independent-8fNhI4/drawer-source.json`、`drawer-source-probe.log`、`drawer-source.png`，断言实际为 `'open' !== 'closed'`。

## 通过范围与实现边界

已对照[任务](../tasks/evolve-115-presentation.md)、theme/adaptive规范、legacy7620原子patch规则、模块/EditorSession所有权，以及[作者报告](../../verification/evolve115-presentation.md)审查完整产品差异。52文件包含实现、定向脚本和证据；未把作者截图或source hash当作实际执行覆盖。

- PresentationV1在TS中严格校验完整顶层/嵌套键与枚举，入队复制/冻结；旧字段迁移只在内存发生。显式完整对象优先并投影旧字段，view-only只更新desktop集合，sidebar-only按true/false退出focus并更新lastNonFocus，两个旧字段独立合并；无关patch不从UI缓存扩成完整对象。
- ConfirmedSettings保留FIFO、ACK后读取确认、旧读票据拒绝、外部adopt与恢复前禁止继续persist；实际App九路径捕获精确匹配提交replay，真实SQLite逐写重开及archive往返通过。一次settings SQL UPDATE保存迁移与兼容投影；临时SQLite trigger失败保留旧状态/重开。独立真实preview非法完整对象拒绝与显式对象优先检查通过，失败持久化另见blocking 2。
- resolver集中交互身份/导航/集合/密度/有效几何；createMobileLayout委托同一身份函数，共享组件消费context。Shell固定子槽，未修改Editor key或以setContent切布局；同一Editor/DOM/View可以保持，但不能据此豁免blocking 1的可见路由丢失。
- 独立实际App通过：临时专注保留搜索来源/查询并回原输入焦点；抽屉内层菜单先处理Escape，第二次Escape关闭抽屉并回触发器；默认focus退出保存失败保留focus，再试恢复lastNonFocus的three-pane。
- 独立宽度检查通过：持久偏好sidebar=350/list=470，经1600/1100/700/699/700/1600有效clamp后仍为350/470；回宽窗有效值恢复。录音面板占空间时暂降两栏，收起后恢复三栏，偏好不变。作者受影响录音/附件/失败保存/access覆盖检查通过。
- 独立受控composition事件及Undo通过：699/700/1100保持同一DOM/Editor/View与composing状态，结束后Undo可用。Android UA＋受控Tauri fixture经699/700/1100横屏及短窗仍mobile，保持同一Editor/View；mobile list/comfortable不改desktop gallery/compact。上述均不是实体IME或原生Android旋转证据。

## 实际命令与结果

全部在115工作树运行，Node `v22.16.0`。未运行376/400大组、未重跑未变的113原90、未执行产品build或Tauri/native启动。

| 命令 | 实际结果 |
| --- | --- |
| `node scripts/check-evolve115-presentation.mjs` | exit 0；108 checks，9条实际App settings replay路径；原始输出 `/tmp/evolve115-independent-author-app.log`，详细产物 `artifacts/evolve115/` |
| `CARGO_TARGET_DIR=/tmp/apple-notes-sync85-target node scripts/check-evolve115-store.mjs` | exit 0；真实生产core harness的 `evolve115_` 两项测试通过，203 filtered out；来源HEAD准确、sourcesUnchanged=true、九路径捕获与提交replay完全一致；约1.64s。原始输出 `/tmp/evolve115-independent-author-store.log`，回执 `artifacts/evolve115-store/receipt.json`；仅两项既有unused-import警告 |
| `npm run typecheck` | exit 0，`tsc --noEmit`通过 |
| `node /tmp/evolve115-independent-8fNhI4/app-probes.mjs` | exit 1；6场景中5 pass、1 fail，失败为blocking 1 |
| `node /tmp/evolve115-independent-8fNhI4/preview-mobile-probes.mjs` | exit 1；真实preview严格拒绝/优先级与Android身份检查通过；quota场景在预期错误处提前结束，原始记录保留 |
| `node /tmp/evolve115-independent-8fNhI4/preview-v2/preview-probes.mjs` | exit 1；严格拒绝/优先级pass，修正预期错误捕获后quota全流程真实fail，见blocking 2 |
| `node /tmp/evolve115-independent-8fNhI4/drawer-source-probe.mjs` | exit 1；真实来源改变后抽屉保持open，见blocking 3 |
| `node /tmp/evolve115-independent-8fNhI4/gallery-boundary-probe.mjs` | exit 1；同为gallery对照pass，独立mobile list反例再次fail，见blocking 1 |
| `git diff --check HEAD^ HEAD`、`git diff --check`、`git diff --cached --check` | exit 0，无空白问题 |
| `git diff HEAD --exit-code -- src src-tauri scripts docs/architecture docs/ui docs/verification` | exit 0；实现、作者脚本及原证据不变 |

独立探针源码、日志、JSON和失败截图均保留在 `/tmp/evolve115-independent-8fNhI4/`；记录不覆盖作者已提交证据。671个tracked source/script文件按路径＋NUL＋内容＋NUL计算SHA-256为 `c87e9d0bcf1081323662ede7774dd6fd3977aee4b086571be3272ea114c34bea`，见 `source-manifest.json`；完成后复核未变。报告相对链接及行号检查通过。

本结论针对115自身提交。主线eca35abb后的112 AgentSettings/host、动态原生窗口与115的组合仍须合入后复验，未复制接线或因此报模块缺陷。本轮没有启动native/真实设备、读写用户库或使用Tauri target；真实IME/Back/FORMAT102、safe-area、系统手势、原生录音、跨WebView/跨窗设置与准确安装包均保持116强制原生门槛OPEN。

## 2026-11-17 增量独审：7a5bb3dc 三项P2闭合

复核修复提交 `7a5bb3dcd1c521799e2d8b624130a9b9845a518e`，父提交为本报告首版 `4c889900affe839d9fa09d12cbc2487b9a2c5c45`。**最新结论：115模块 SOURCE_PASS；原F1/F2/F3全部闭合，未发现新增P1/P2 blocking或nonblocking。native acceptance与主线112组合复验仍OPEN。** 上文BLOCKED、原失败断言和原/tmp证据完整保留，不能将本节源码/组件通过扩张为原生验收。

修复diff和实际路径复核：

- **F1闭合**：[App:600](../../../src/App.tsx#L600)改为观察已确认的 `desktop.collectionView`，不再观察resolver因断点选出的当前view。原独立gallery反例及gallery对照均重新执行，1280→699→700→1100下正文可见、同一Editor保持；新增作者回归还比较DOM/View、全文、选区及路由。手机偏好单独修改不清桌面意图，主动确认修改desktop view仍按原契约清除galleryEditor。
- **F2闭合**：[bridge:491](../../../src/bridge.ts#L491)在独立settings候选上完成严格合并，persist成功后才发布给内存preview，且settings不经过末尾第二次persist。原独立preview反例现在通过；作者九场景中，对sort/view/sidebar各自连续两次Quota失败，再核对loadWorkspace、完整持久工作区、确认UI、后续成功候选与reload，均通过。未改Rust产品保存实现。
- **F3闭合**：[App:4131](../../../src/App.tsx#L4131)的来源key包含page/query/searching/filter、base/search note、附件及画廊路由等，仍排除菜单/模态的单纯开关。原独立同folder/note清搜索反例通过；作者覆盖page-only与内层菜单Escape优先，均通过。独立补验仅attachmentBrowser变化、folder/note/page均不变时，通过实际菜单点击进入附件来源，也关闭抽屉、移除scrim并恢复原触发器焦点。

独立补查真实用户控件路径：无Tauri注入的生产preview App中，用实际设置按钮打开Preferences、点击备忘录页并选择desktop list；注入一次Storage配额失败后，控件、焦点、确认设置、loadWorkspace与localStorage均保持gallery旧值。正常关闭错误提示再退出设置，已打开gallery正文仍可见。随后通过真实排序下拉框保存created，再reload，失败list候选没有进入任何后续成功保存。该检查验证App→Preferences→ConfirmedSettings→真实preview bridge/localStorage，不只检查owner单元。

附加探针首轮有一项操作顺序失败：全局错误条遮挡“关闭设置”按钮，Playwright如实超时；未强制点击或改产品。原脚本、日志、1 pass/1 fail记录保留；v2按可见的“关闭错误”入口先处理错误条，再继续原断言，两项均通过。这不是将失败候选当成已保存的复发，也没有删除该失败记录。

实际执行（Node `v22.16.0`），独立增量证据目录 `/tmp/evolve115-independent-fixes-02l7a2eg/`：

| 命令 | 实际结果 |
| --- | --- |
| `node scripts/check-evolve115-review-fixes.mjs` | exit 0；9场景pass、0 fail；`author-nine.log`及`author-nine/`保存本次原始回执 |
| `node …/gallery-boundary-probe.mjs`、`node …/drawer-source-probe.mjs`、`node …/preview-probes.mjs` | 三份原独立反例仅更换输出目录后复跑，均exit 0；preview包含严格拒绝/优先级和原Quota反例两场景，均pass；见`original-rerun-results.json` |
| `node …/extra-user-paths.mjs` | exit 1；附件来源pass，Preferences路径在错误条遮挡关闭按钮处超时；原记录保留 |
| `node …/extra-user-v2/extra-user-paths.mjs` | exit 0；真实Preferences失败→恢复→后续sort→reload与仅附件来源变化两项均pass |
| `CARGO_TARGET_DIR=/tmp/apple-notes-sync85-target cargo test --locked --offline --manifest-path src-tauri/src/application/harness/Cargo.toml --lib evolve115_presentation_is_strict_atomic_and_roundtrips -- --nocapture` | exit 0；加强后的真实SQLite/core单项pass，204 filtered out，约2.33s；验证trigger拒绝后完整状态、sort-only成功、重开及archive往返；见`core-one.log` |
| `npm run typecheck` | exit 0；见`typecheck.log` |
| `git diff --check 4c889900 7a5bb3dc`、`git diff --check`、`git diff --cached --check` | exit 0 |
| 报告链接/源码差异/历史证据检查 | 相对链接与行号均有效；审查只追加本报告；原/tmp的26份文件SHA-256逐一未变，作者checks中672份source输入及22份evidence摘要匹配 |

Rust产品代码与原108脚本未变，因此未重复108、完整Store两项或既有九路径capture；只执行本次加强的core单项。未跑376/400、未变113原90或build，没有使用Tauri target。作者的108/Store2/build回执作为其自测历史单列，不冒充本次独立执行。

本轮672个tracked source/script文件沿用上文路径＋NUL＋内容＋NUL算法，摘要为 `4caefadd7ba0c28dde0655ddb8aef7610b85319daa26052967f81086dee4e0fd`，见增量目录`source-manifest.json`；完成时复核未变。原失败目录 `/tmp/evolve115-independent-8fNhI4/`未覆盖，新增回执全部分目录保存。

允许本模块交主线组合合并/复验；尚未声称112装配、跨WebView、准确APK、真实IME/FORMAT102或其他116门槛通过。没有启动native/真实设备、读写用户库或更改实现。此前controlled composition/capture只保留原组件范围，Trime系统原生文本框准备也不属于本产品验收。
