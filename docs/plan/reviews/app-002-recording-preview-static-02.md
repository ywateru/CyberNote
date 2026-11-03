# 暂停回放候选 02：独立源码审查

2026-11-04。冻结候选 `e01c90a62bfc758f6d254f590f714da780290572`，前候选 `dc3315208cbfa40049639f7748189376ad2763b6`。独立 detached 审查树 `/private/tmp/apple-notes-recording-preview-review02`，作者没有写入该树。结论：**SOURCE-READY，限源码／受控组件边界；原 P2 已修复，没有新增产品阻塞项。** 原 01 BLOCKED 报告与失败复现、跨变更 headless INVALID 结论均保留。

## P2 修复与实际恢复

产品只在 `src/recording-playback.ts` 的 mediaError 重试分支增加 7 行：在共享 controller 清除媒体错误前，先置 `ready=false`、清理旧 pending seek timer／request。Panel、Session、CSS、共享播放器、App／父 ACK、Editor、bridge、Rust 和依赖均未因此改动；两项检查脚本增加新加载能力场景。

原独审 `retry-readiness.mjs` 从 main 的固定 `93d75e6` 原样复制，字节相同；直接运行原失败断言已 exit0。实际观察 `mediaReadyStateAfterRetry=0`、`adapterReadyAfterRetry=false`、`playCallsBeforeDataEvent=0`，生产源码 SHA 保存在 stdout。不是把旧失败输出重写为通过，也没有把受控媒体当成真实编码音轨。

独立追加 `reload-recovery.mjs` 4 项定向检查：先有已就绪媒体和进行中定位；媒体错误后重载会同时关闭 ready／canSeek、排空原定位等待，toggle 不入场；仅 metadata／readyState1 不恢复能力；新的 loadeddata／readyState2 和实际范围才恢复播放，并重新通过实际 seeked／currentTime 确认定位；dispose 后晚 loadeddata／seeked／canplay 不再发布状态。全部通过，使用生产 adapter 与未改共享 controller，媒体宿主受控。

## 固定树实际组件结果与原失败保留

| 独立检查 | 实际结果 |
| --- | --- |
| 原 P2 最小复现 | exit0；重载未就绪时 ready=false、play0 |
| 新恢复／定位等待／晚事件 4 项 | exit0 |
| `check-recording-preview.mjs` | 16 项，exit0 |
| `pnpm typecheck` | exit0 |
| 窄差异检查／变更文件格式 | exit0 |
| 原样 Panel 检查 attempt01 | 非零：`root.render(null)` 后立即读取 revoked=0，断言1失败，原日志保留 |
| 原样 Panel 检查 attempt02 | 非零：新的媒体 ready 事件后立即读取按钮仍 disabled，断言 enabled 失败，原日志保留 |
| 两处观察等待的独立 Panel 副本 | **25 项通过**；实际 Panel／Session／生产播放 controller，pageErrors／externalRequests 均空，全部六源在检查前后相同 |

没有将原样脚本两次非零写成通过。为辨别这两处，独立副本仅增加两次受 Playwright 默认超时约束的等待：实际 `revoked.length===1`、新媒体事件后的真实按钮 `disabled=false`；随后仍执行原断言，未吞异常、删除断言或放宽预期。副本与精确差异见 `panel-with-observed-waits.mjs`、`panel-observed-waits.diff.patch`。25 项完整通过说明这两次所需 cleanup／React commit 实际发生，未证明产品泄漏或重载门禁失败；它们作为**非阻塞检查稳定性观察**保留，后续应在正式检查中等待实际异步结果。

该 25 项是固定 e01c90a 树的实际 React StrictMode 组件检查，可独立归属本候选，不继承 01 INVALID headless。它使用现有 Chrome headless 156.0.8078.80 和现有 Playwright，无下载；权限、MediaRecorder、时间及播放媒体事件为受控边界。覆盖暂停事件／数据门禁、累计片段、真实播放位置／seek 确认、继续／完成／取消／卸载的代次与资源释放以及新 P2 重载场景。不是实际设备容器可播、可听、父 ACK 或原版像素证据。

## 身份与范围

六项源码逐项 SHA 与冻结 commit／作者候选 02 清单相同，作者源码 aggregate `c65623962353fceb849946c056d155aec5792e47c1f0f51e1953f4baf3723013`。每项运行的 exit JSON 都保存六源 before／after SHA；没有跨源码改动。16 个完整保护文件与前候选逐字相同，含 Panel／CSS／Session、共享 controller、Editor、App／父保存、bridge／SaveQueue、附件 helper、时钟、Rust、依赖；01 作者证据目录全部 15 个文件（14 项＋manifest 自身）原字节不变，见 `boundaries.json`。

原 01 在冻结状态独立通过的 Session26／共享11 没有无依据重跑，保持原有效范围；本次独立复核针对实际改动与新能力生命周期。候选 02 README 已明确更正 01 将普通 AudioPlayer 定位为 App 的非阻塞错误，实际定义为未改 Editor，并未改写旧 README。

## 交接与未覆盖项

证据目录：[`docs/verification/app-002-recording-preview-independent-02`](../../verification/app-002-recording-preview-independent-02/)，manifest 排除自身。审查树与自有临时依赖链接已释放，没有后台测试服务。允许 root 按本候选准确范围合入后续来源；**candidate03 仍不含本预览实现**，本次没有重构建任何包。

MediaRecorder 非终态前缀无标准可播放保证，dataavailable 无请求 ID，timeslice 可能充当下一个响应事件；现有 snapshot 只给出前缀候选，不保证编码排空、尾部完整、真实解码或定位。尚待确切 Mac WK／Android WebView 新包验证首个短暂停、继续后累计前缀、超过15秒定位、完成正文与冷启，以及实际含声音采集／试听。没有原生构建、target、设备、可见 GUI 或笔记数据操作，不以模块／组件结果升级为这些验收通过。
