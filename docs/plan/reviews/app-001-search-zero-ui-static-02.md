# Mac 搜索零结果 UI：独立源码审查 02

2026-11-04，native_ui_research 独审。冻结候选 `f992b90781d190c35be4cc059c64b9f9bb484d71`，前候选 `e7a2b8c8831b0ff48686970f4f985210f3d8e765`，任务基线 `7ef7975c26021051dd1041b40eb8af570b88bd84`，隔离目录 `/private/tmp/apple-notes-search-zero-ui-01`。

**结论：本候选在有界源码与受控模块检查范围内 SOURCE-READY，原P2在新候选中修复，未发现新增阻断。** 原独审01的BLOCKED和初次订阅失败证据仍对应e7，全部保持原字节；本报告不追改旧结论。发现一项非阻断原始检查日志格式问题，按实际exit保留记录。没有统一包、GUI、原生渲染或像素通过声明。

证据：[app-001-search-zero-ui-independent-02](../../verification/app-001-search-zero-ui-independent-02/)，包含精确输入、独立旧失败重放、生命周期补充、全部实际检查stdout/stderr及清理。5项候选源码/脚本SHA与字节数独立重算逐项相同，aggregate `3b1e23c8ec0eb87ef594759644a7e2ac02436615e206402607e6767e9465e86b`。见 [identity.json](../../verification/app-001-search-zero-ui-independent-02/identity.json)。

## P2修复与成功事实的生命周期

相较e7，产品只在App新增三行：`workspaceLoaded` 初值false；`desktopSearchZero`额外要求该正向事实；既有实际可信同步的publish回调在hydrate、初始选择和访问屏障状态发布完成后调用 `setWorkspaceLoaded(true)`。它不在effect的finally、订阅成功、load派发、队列排空或失败回调中设true，也没有以全局error为空来代替可信加载。

该标记表示曾有成功发布；后续同步开始不把它清false，但原 `synchronizing`、`syncError`、accessSuspended和access operation仍参与零态门禁。实际失败同步保持遮挡/错误，故旧成功不能让新失败宣告确认零态。新组件实例重新从false开始；本轮没有改变effect依赖、工作区切换或窗口生命周期协议。

独立运行新增startup脚本5组，执行真实App state initializer、启动effect、fail/hydrate回调、synchronizeRef赋值与展示声明，使用生产TrustedSynchronization，只控制订阅/加载I/O与React宿主setter：

- 首次订阅拒绝：syncCalls0/loadCalls0，loading最终false但workspaceLoaded仍false，零态false。
- 订阅成功而第一次load拒绝：workspaceLoaded=false，协调器非trusted，零态false。
- 实际空工作区成功hydrate/publish：workspaceLoaded=true，协调器current/trusted为true，零态true。
- 成功后无关动作报错：不取消已有成功事实，零态仍true。
- 成功后下一次同步失败：历史workspaceLoaded仍true，但协调器非trusted、原同步/错误门禁令零态false。

完整结果：[startup.stdout.json](../../verification/app-001-search-zero-ui-independent-02/startup.stdout.json)。这些是实际生产函数和协调器的受控检查，不是React挂载、Tauri事件订阅或原生App运行。

## 独立重放原失败和补充生命周期

本轮复制并窄调整原独审01复现为 [startup-subscription-replay.mjs](../../verification/app-001-search-zero-ui-independent-02/startup-subscription-replay.mjs)，没有改原脚本：从新App抽取实际workspaceLoaded state初始化器，仍执行原启动effect并让subscribeAccess拒绝。原来syncCalls0便宣告零态的路径，现在实际false初值令 `desktopSearchZero=false`，显示保留旧“搜索结果/0个备忘录”，不进入新已确认“搜索/无结果”分支。实际结果为 [subscription-replay.stdout.json](../../verification/app-001-search-zero-ui-independent-02/subscription-replay.stdout.json) 的 `FIXED_IN_CONTROLLED_REPLAY`。

另外 [startup-lifecycle.mjs](../../verification/app-001-search-zero-ui-independent-02/startup-lifecycle.mjs) 明确复用候选02的实际App AST/生产协调器fixture，独立添加两组断言，不冒充全新独立基础设施：

1. 初次load失败后，经真实synchronizeRef成功重试：loadCalls2，原error还保留，但workspaceLoaded=true、current/trusted=true，确认零态恢复。这同时确认修复没有依赖全局error否定条件。
2. 持有真实第一次load Promise：中间态loadCalls1、loading=true、synchronizing=true而workspaceLoaded=false；释放I/O后实际发布才取得true与trusted。没有仅向展示谓词注入true来冒充加载成功。

两组均通过，结果见 [lifecycle.stdout.json](../../verification/app-001-search-zero-ui-independent-02/lifecycle.stdout.json)。fixture为空工作区，未覆盖非空note的完整hydrate分支或所有并发同步时序；本报告不扩大为任意生命周期证明。

## 展示及共享边界

App纯展示predicate仍限非空桌面主窗查询、list、成功加载且原门禁允许的实际0结果；手机、独立窗、gallery、loading、syncerror、访问遮挡/operation、同名“搜索”普通空folder、clear/filter及非零结果分别运行实际展示16组通过。原生header仅复用既有folderTitle/count/search.value字段，ObjC与CSS相对e7完全相同；原生无额外schema/协议、搜索ACK/组字或focus修改。初次失败不会再发送触发native“无结果”辅助文字的标题信号。

独立复跑原PM/Tiptap7组、controller12组，保留既有结果投影、停放/恢复、文档/Undo/Redo、绑定/revision/ACK/组字与生命周期模块契约。独立重新抽取16项App声明/RecordingPanel与SearchEditorHost JSX/native focus body，与基线逐字相同；输出 [protected.stdout.json](../../verification/app-001-search-zero-ui-independent-02/protected.stdout.json)。EditorHost key/active/blocked、挂载集合、选择和保存路径没有新增写入或remount入口。以上不当作本轮mounted App的Editor身份实证。

24项完整保护文件也与任务基线同字节。该冻结基线中的focus插件不是主线后续focus候选，整合时须保留已审主线focus两源码；不能以此候选旧blob覆盖。录音父层ACK将另候选实现、独审后进入统一包，不由这次展示检查追认。

## 实际执行、格式观察与清理

| 检查 | 结果 |
|---|---|
| `pnpm typecheck` | exit0 |
| `node scripts/check-search-zero-startup.mjs` | exit0，实际App startup5组 |
| `node scripts/check-search-zero-ui.mjs` | exit0，实际展示16组 |
| `node scripts/check-search-selection.mjs` | exit0，原7组 |
| `node scripts/check-native-toolbar.mjs` | exit0，原12组 |
| 独立原失败重放 | exit0，要求修复行为成立 |
| 独立补充生命周期 | exit0，2组 |
| 独审01保护脚本在新候选执行 | exit0，16片段 |
| `git diff --check 7ef7975..f992b907` | **exit2**，仅原始typecheck输出文件末尾空行 |
| 对5项source-manifest产品/脚本范围的 `git diff --check` | exit0 |

全范围差异检查实际报 `docs/verification/app-001-search-zero-ui-01/source-candidate-02/typecheck.txt:4: new blank line at EOF.`。这是已保存原始stdout的非阻断文档格式观察；保留文件原字节，未为通过检查而改写日志，也不隐瞒exit2。产品/脚本范围单独检查为0，stdout/stderr为空并保存。完整命令及实际结果见 [completion.json](../../verification/app-001-search-zero-ui-independent-02/completion.json)。

开工与结束worktree均clean，HEAD仍f992b907，5输入哈希未变；临时node_modules链接已移除，没有安装或网络。本轮前后重算旧独审01目录及报告18项hash全部相同，没有覆盖其失败。没有修改产品、主Git、Rust target、执行原生编译、应用构建、GUI、设备或真实数据。

可交root按精确候选整合。零结果文案/分组/中央提示、实际唯一→零→clear、同几何原图/叠图/未改原值差异与Editor身份须在最终统一新包独立验证。旧pixel FAIL、强调色与快捷键立即粘贴异常、媒体/保存ACK分别保留其运行门槛，本次不关闭。
