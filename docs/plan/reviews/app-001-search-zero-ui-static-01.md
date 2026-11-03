# Mac 搜索零结果 UI：独立源码审查 01

2026-11-04，native_ui_research 独审。冻结候选 `e7a2b8c8831b0ff48686970f4f985210f3d8e765`，基线 `7ef7975c26021051dd1041b40eb8af570b88bd84`，隔离目录 `/private/tmp/apple-notes-search-zero-ui-01`，任务 `app-001-search-zero-ui-01`。

**结论：BLOCKED / NOT SOURCE-READY，发现1项 P2 契约阻断。** 首次授权事件订阅失败、从未执行可信数据加载时，新展示谓词仍可能宣告已确认“无结果”。其余有界展示/保护边界及既有检查通过，未发现第二项阻断。该结论仅对应本候选；修复须另存下一候选，保留本报告和复现。

证据：[app-001-search-zero-ui-independent-01](../../verification/app-001-search-zero-ui-independent-01/)。4项候选源码/检查文件独立重算 SHA与字节数逐项相同，aggregate `2881c002bb9e0e7d8e15ad1e910847184f398a46e65ab2fdeeaab415729af8fa` 与开发清单吻合。输入身份和24项完整保护文件见 [identity.json](../../verification/app-001-search-zero-ui-independent-01/identity.json)。本次没有 Rust/ObjC 全编译、target、应用构建、GUI、设备或像素结果。

## P2：没有正向成功加载事实，初次订阅失败被当成已确认零结果

新 `desktopSearchZero`（App504起）要求 desktopSearch、list、loading=false、synchronizing=false、syncError空、无accessSuspended/operation以及listed为空。**这些否定条件不能证明已经发生过一次成功的可信加载。** 实际启动effect（App600起）先 `await subscribeAccess(...)`，然后才调用 `synchronizeRef.current()`。subscribeAccess 在 native 分支实际返回Tauri `listen` Promise，可能拒绝；它失败时未进入synchronize，catch只调用 `fail`，finally仍 `setLoading(false)`。

确定受控复现顺序：

1. 真实 App 启动effect执行；订阅边界拒绝，可信同步根本没有被调用。
2. effect记录错误并结束loading；初始synchronizing=false、syncError为空、accessSuspended=[]、AccessGate.state=null保持，初始workspace为空。
3. 后续非空query进入实际新展示声明，得到 `desktopSearchZero=true`、`listTitle=搜索`、`listSubtitle=无结果`。该分支还会在列表显示“备忘录”并去掉中央提示。
4. 因为没有成功加载事实，这不符合任务“可信加载完且实际结果为零才使用已证状态”的边界。已有错误banner不能把未加载的数据认证为零结果；无需据此改变既有订阅/权限协议或泛化所有错误。

实际结果：[startup-subscription-failure.stdout.json](../../verification/app-001-search-zero-ui-independent-01/startup-subscription-failure.stdout.json)：`syncCalls=0`、`loading=false`、`synchronizing=false`、`syncError=""`，但新确认零态为true。脚本 [startup-subscription-failure.mjs](../../verification/app-001-search-zero-ui-independent-01/startup-subscription-failure.mjs) AST抽取并执行未改的真实启动useEffect和新desktopSearch/desktopSearchZero/listTitle/listSubtitle；仅subscription拒绝及React宿主setter受控，没有复制谓词。没有实际Tauri订阅失败、用户输入、DOM或AppKit运行声明。

最小修复要求：展示以已有或新增的**正向可信加载成功事实**为前提，首次订阅/加载未完成或失败时不得使用该确认零态；真正成功加载为空以后仍应进入本次展示。保留loading/syncerror/barrier/operation原门禁和真实选择/Editor协议，不能仅通过全局error为空来代替成功加载。补上“从未同步、初次订阅失败”检查，原失败证据保持，本报告不提前接受新候选。

## 其余有界核对

- **展示与归属**：desktopSearch原定义仍排除mobile/独立窗，新谓词只加view=list与确认状态门禁。gallery、唯一/多结果、query clear、filter-only和普通空folder继续原分支。真实文件夹名为“搜索”且query为空时，回退header保持普通folder；native表达式还要求非空search.value，不误把同名空folder判为搜索零结果。
- **错误/遮挡状态**：显式loading、正在同步、syncError、accessSuspended和access operation均排除新分支，实际App14覆盖这些输入。但它们未覆盖上述“subscribe先失败、尚未开始sync”的可达初态，不能由这些通过推出可信加载条件充分。
- **原生表达式**：仅ObjC `apply` 的计数字符串多一条件：folderTitle精确“搜索”、数字count0、hasSearch与非空value；其他状态继续数字计数。现有Rust模型字段和校验提供string、u64和SearchState.value，hasSearch仍先排除NSNull，未引入字段/schema。title/count accessibility label来自实际呈现字符串。原生search ACK/marked text门禁在修改前执行，native focus body与C入口逐字未变。该段为静态审查，未编译或执行新ObjC。
- **CSS**：仅增加独立 `.search-zero-section`，在新分支渲染；未改日期组、其他空态或录音样式。40px高度、padding、0.5px边线等只是源实现，不因参考图墨迹测量而视为实际像素匹配。既有不同窗口尺寸的pixel FAIL不变。
- **正文/选择/保存**：新声明只读取状态生成展示字符串/分支，不写query、noteId、选择、revision或Editor。独立从源码抽取12项完整App声明、RecordingPanel JSX、SearchEditorHost JSX及两项native focus body，与基线逐字相同，共16片段；保护脚本及输出见 [check-protected.mjs](../../verification/app-001-search-zero-ui-independent-01/check-protected.mjs)、[protected.stdout.json](../../verification/app-001-search-zero-ui-independent-01/protected.stdout.json)。真实EditorHost key/active/blocked/gate和挂载集合无改动，未发现新remount入口；这不是本次mounted App生命周期实证。
- **共享文件**：24项完整保护文件独立与基线Git blob比对，涵盖Editor、bridge、附件helper/保存队列/同步、授权、F07投影/gate、controller/state、录音Panel/CSS/Session/clock、宿主、插件Rust、依赖/锁。基线中的focus插件尚非后续主线focus候选；该清单只描述本候选，整合时仍需保留主线已核focus源，不能用旧插件blob覆盖它。

## 实际执行和交接

| 检查 | 结果 |
|---|---|
| `pnpm typecheck` | exit0 |
| `node scripts/check-search-zero-ui.mjs` | exit0，实际App展示AST/React静态渲染14组 |
| `node scripts/check-search-selection.mjs` | exit0，生产F07/真实Tiptap与PM7组 |
| `node scripts/check-native-toolbar.mjs` | exit0，生产controller12组 |
| 独立check-protected | exit0，16片段同基线 |
| 独立startup-subscription-failure | exit0，断言要求上述P2确实复现，非功能通过 |
| `git diff --check 7ef7975..e7a2b8c` | exit0 |

stdout/stderr已完整保存在证据目录，各stderr为空；命令与边界见 [completion.json](../../verification/app-001-search-zero-ui-independent-01/completion.json)。App14真实执行展示声明/header/空列表与production toolbar投影，非零note行是受控边界，没有运行AppKit。PM7保留原文档/Undo/Redo与停放语义的模块检查，controller12是受控transport，不能代替整包真实搜索/焦点/像素。

开工与向作者释放时worktree均clean、HEAD为e7a2b8c；临时node_modules链接已删除，无下载。已向root和作者交付P2复现，作者之后会在原隔离目录修下一候选；本报告输入继续以固定Git blob为准，不把后续可变工作树当e7。未改产品、主Git、旧候选/证据或真实数据。

新候选须先独立确认正向加载门禁和原失败转为正确保全，再由root合入最终统一候选。真实Mac唯一→零→clear、同几何截图与未改原值差异、正文身份以及父ACK/媒体/快速粘贴分别进入新包验证，本次不关闭这些运行门槛。
