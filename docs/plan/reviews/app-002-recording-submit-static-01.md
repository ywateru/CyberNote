# 录音父保存候选 01：独立源码审查

2026-11-04。候选 `8ee0111811c698304b9d7942eba0289a0ad5e968`，基线 `ab728ad487c0c9b397fca3f67e57460bbe520e22`，工作树 `/private/tmp/apple-notes-recording-submit-01`。结论：**SOURCE-READY，限源码与受控边界；未发现本任务阻塞项。** 不表示真实录音、Rust DB 保存、原生窗口关闭、安装包、冷启、可听音轨或像素验收通过。

产品差异仅 `src/App.tsx`；新增 `scripts/check-recording-submit.mjs`。独立重算两项源码身份与作者清单一致，aggregate `941e9f7c3e287d8aeb606078354cb11e65b2f0ece5af4c30c6ceaa9239b330b2`。未改产品、Git、Rust target 或构建产物，未读取后续暂停回放工作树。

## 审查结论与实际路径

- 普通与原生入口均通过实际 `openRecording`／`capturePickerTarget` 捕获原 note、Editor、完整文档、PM 书签、授权及 operation。Panel 的 key、onDone、onCancel 均闭包绑定同一 ticket；不同最终 File 被拒绝，同一 File 的重复 Done 合并为同一 running Promise。
- 录音豁免只进入 `validatePickerTarget(target, recording, allowSealed)`：当前 ref、同一 target、未 detached 是必需条件，submit 还要求 accepting。普通 picker 仍由 `!record` 拒绝；录音只绕过自己的 record overlay，modal/menu/draw/loading、访问屏障、可信同步以及生产 `rebindAttachmentTarget` 的原目标／全量文档／Editor／书签／后端身份检查仍在。全局 `nativeAssert` 整体未变。
- Done 实际调用生产 `AttachmentSubmission.run` 和 bridge operation，检查真实 insert 返回值及抛错后的本地引用；`saveDoc`／生产 SaveQueue 的返回正文经 `acknowledge` 确认后才进入 refresh 端口。ACK 前错误 reject 回 Panel；同 File 已插入重试先重试原 pending 正文，再恢复原 helper，避免 `flush` 被失败 pending 自锁。ACK 后进入 refresh 端口时先关闭 Panel，再刷新；刷新失败保留已 ACK 操作，全局重试只刷新，不再 store／insert／save。
- `sealRecording` 在等待前同步封 submit 入场；未插入且无引用才 invalidate 与标记取消。真实 Panel.cancel 先置 `live=false`、停止局部资源，父 onCancel 同步 `setRecord(false)`，避免保留一个已死的可见 Panel。取消保留当前 ticket 的 owned 验证权，允许自己执行窄清理；operation 的实际 run（含 FileReader／IPC）settle 前不会发 Rust cancel 或释放身份。只有后端 aborted／notPersisted 才释放已尝试存储的操作；deferred／失效目标保留身份与错误。
- 已插入／Editor 或 pending 文档仍引用时不 cancel 文件；保留本地节点、同一 pending 文档与 operation，后续全局重试取得正文 ACK。已 ACK 不进入失败补偿。访问遮挡／目标变化／卸载均先封入场，晚存储不能插入其他目标。
- 现有唯一 close listener 通过 lifecycle ref 处理本次录音，先封口，再等待安全取消或原 pending 正文 ACK，然后执行原 flush；没有第二监听，也未发现 run→cancel→run 自等待。持久保存持续失败时不 destroy，原 pending／operation 保留；空闲窗口沿原行为不拦截。

## 独立执行与证据

证据目录：[`docs/verification/app-002-recording-submit-independent-01`](../../verification/app-002-recording-submit-independent-01/)。

| 检查 | 结果与边界 |
| --- | --- |
| `pnpm typecheck` | exit0 |
| 实际父接线 `check-recording-submit.mjs` | 20 组，exit0；实际 App AST 与生产 helper／bridge／同步／SaveQueue／PM，平台宿主受控 |
| 原 `check-attachment-submission.mjs` | 23 组，exit0 |
| 原 `check-attachment-cancellation.mjs` | 8 组，exit0；实际 App 取消边界 |
| 原 `check-recording-session.mjs` | 26 组，exit0；采集环境替身，不是设备音轨 |
| 独立 `independent-lifecycle.mjs` | 新增 5 组，exit0；复用冻结作者 fixture 前缀，新增用例由独审编写；执行实际 Panel.cancel AST、实际 App 回调和生产 helper |
| 完整候选 `git diff --check baseline..candidate` | exit0，原始 stdout／stderr 均空 |
| 两项源码 Prettier | exit0 |
| 独立边界检查 | 21 个完整文件、7 个完整 App AST 声明／赋值与基线相同；Rust／plugins diff 空；两项源码与作者 12 项证据身份重算一致 |

独立 5 组具体覆盖：真实 Panel.cancel→live=false→父 UI 释放→held IPC 结束后一次 cancel（含重复 cancel Promise 合并）；idle 无存储取消；已插入且正文 ACK 挂起时关闭等待原 running、ACK 后仅 destroy 一次；持续 ACK 失败的 close 保留 pending／op 后全局重试成功；已插入、ACK 挂起期间取消保留同一 pending 文档，失败后原操作重试一次存储／一次节点。

独立边界脚本首次误把作者 manifest 的相对文件名按仓库根解析，读取根 README 后 bytes 校验失败，已保留 `boundaries.*` 原始日志；修正为作者证据目录后 `boundaries-02.*` 全过。这是独审工具路径错误，不是产品发现。没有覆盖失败日志或作者证据。

## 验收限制与交接

独立新增检查仍使用作者已冻结的 AST fixture 前缀；React setter、Editor 命令宿主、FileReader、invoke／后端响应和窗口为受控边界。不是 mounted App，不存在真实 Rust DB、原生窗口、麦克风、有效编码或可听证明。Panel 只额外执行实际 cancel 回调，未把父用例当成真实组件全程挂载。

允许 root 按精确候选合入，并在最终统一 HEAD 冻结后构建 candidate03。后续新包分别实际验证 Mac／Android 的真实录制→暂停直接完成→正文 ACK→正常退出／冷启→可听播放，核正文、revision、附件元数据和原字节；原版暂停回放／转写及像素缺口继续另账。主构建输入仍须保留最新 focus／zero 等已合入来源，不能用本分支旧基线覆盖主产品。
