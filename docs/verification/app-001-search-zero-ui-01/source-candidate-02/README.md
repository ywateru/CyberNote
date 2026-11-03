# APP-001-SEARCH-ZERO-UI-01：开发源码候选 02

2026-11-04，隔离工作树 `/private/tmp/apple-notes-search-zero-ui-01`。父候选 `e7a2b8c8831b0ff48686970f4f985210f3d8e765`，任务基线 `7ef7975c26021051dd1041b40eb8af570b88bd84`。本候选只修独审01的启动P2；等待第二轮独立源码审查。

## P2与窄修

独审实际执行App启动effect复现：`subscribeAccess`拒绝→仅fail(error)→finally令loading=false；同步调用数0，初始工作区仍空，旧零态谓词却返回true。原独审脚本与结果在 `docs/verification/app-001-search-zero-ui-independent-01/startup-subscription-failure.mjs` 与 `startup-subscription-failure.stdout.json`，正式审查报告为 `docs/plan/reviews/app-001-search-zero-ui-static-01.md`（由独审owner在主树交付）。

App增加正向事实 `workspaceLoaded`，初值false，仅实际同步成功publish完成后设true。已确认桌面列表零态额外要求该事实。没有用全局error否定零态：成功加载后一次无关动作失败仍可呈现“搜索 / 无结果”。后续同步中/失败、访问遮挡/operation继续由原门禁阻止。初次订阅拒绝、初次加载拒绝均不能取得该事实。

```text
subscribeAccess成功 → 实际loadWorkspace成功 → hydrate/成功publish完成
                                                    workspaceLoaded=true
                                                          │
桌面主窗＋非空查询＋list＋其余原门禁＋listed=0 ───────────────┤
                                                          ▼
                                                 搜索 / 无结果
                                                 备忘录＋横线
```

相对候选01，产品仅App三行新增：state、展示门禁、成功publish setter。CSS与ObjC保持候选01字节，native消息协议、焦点、F07、访问/同步类、Editor、保存、附件、录音、依赖保持原样。完整产品差异见 [product.diff.patch](product.diff.patch)，P2窄修差异见 [p2-fix.diff.patch](p2-fix.diff.patch)。

## 定向证据

| 检查 | 结果 | 实际边界 |
| --- | --- | --- |
| `pnpm typecheck` | exit0 | 最终源码 |
| `node scripts/check-search-zero-startup.mjs` | 5组通过 | AST抽取并执行真实App初始effect、React state初始化、fail/hydrate回调、synchronizeRef赋值、展示声明；实际生产TrustedSynchronization；只控制订阅/工作区I/O与React setter |
| `node scripts/check-search-zero-ui.mjs` | 16组通过 | 实际App header/list JSX和toolbar投影；新增尚未成功加载与成功后无关error两组 |
| 原搜索选择检查 | 7组通过 | 生产投影/gate、真实Tiptap文档及Undo/Redo |
| 原顶部状态检查 | 12组通过 | 生产controller ACK/合并/窗口/绑定/revision/组字/生命周期与状态投影 |
| 格式与差异检查 | exit0 | App和两项检查脚本 |

[app-startup.json](app-startup.json)记录订阅失败`syncCalls=0/loadCalls=0/loading=false/workspaceLoaded=false`且零态false；工作区加载失败零态false；成功实际发布`trusted=true/workspaceLoaded=true`且零态true；成功后无关error保持true；成功后第二次加载失败由原门禁阻断。没有仅向零态谓词注入一个布尔值来冒充启动回归。

新启动检查不挂载React，不执行实际Tauri订阅，空工作区fixture不覆盖非空note hydration分支。展示检查的非零行仍是受控渲染边界。以上均是源码检查，不是实际桌面/手机或像素通过。没有本轮原生构建、target、GUI或设备操作。

[boundaries-manifest.json](boundaries-manifest.json)重验24整文件与任务基线相同。[protected-bodies.json](protected-bodies.json)重验12个App声明和RecordingPanel JSX；原生focus片段通过整个toolbar.m与候选01完全相同保持。合计15个片段保持原保护哈希。

[previous-candidate-preserved.json](previous-candidate-preserved.json)重验候选01目录12项文件均与`e7a2b8c` blob逐字相同，旧候选未覆盖。旧报告的“待独审”属于旧冻结时点，本任务历史已记独审01 P2和本次修复，不改写旧证据。

## 冻结

[source-manifest.json](source-manifest.json)记录3产品与2检查脚本，aggregate `3b1e23c8ec0eb87ef594759644a7e2ac02436615e206402607e6767e9465e86b`，算法为保持path顺序、对象键排序的紧凑UTF-8 JSON的SHA256。App SHA256 `60df9da2d3c452b5439999b089d264c73f8a0ce50b5f19b88b6ff5e61d8a3658`。evidence manifest排除自身，覆盖本候选其余证据。

等待独立源码审查及主合入后由root安排统一新包、实际唯一→零→clear及同窗口几何/主题/焦点的像素复采。旧pixel FAIL、顶部焦点颜色与快捷键立即粘贴异常、全页像素一致性均未关闭。
