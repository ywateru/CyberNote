# APP002 附件取消竞态 · 前端源码候选 02

2026-11-04，隔离工作树 `/private/tmp/apple-notes-attachment-submit-01`。上一候选 `607950a57b1a1f01eb59b2e4db5738b66e890c40`，原产品基线 `72c93b1b34bcfd3a95c331d1da93e187ff5fda14`。**本次只修独立审查发现的1项P1，开发侧检查通过，等待新一轮独立复核；没有新包或设备、系统选择器、冷启、像素验收。**

## 保留原失败

上一候选独审结论为 **BLOCKED / NOT SOURCE-READY**，见 `docs/plan/reviews/app-002-attachment-submit-static-01.md`，原复现位于 `docs/verification/app-002-attachment-submit-independent-01/cancel-before-read.{mjs,json}`。实际生产 App 取消函数在 bridge 等 FileReader 时就向后端取消未知op，得到notPersisted后清前端identity；随后 FileReader 完成仍派发store。原受控结果为 `cancel → store`，后端stored1、前端batch0/submission0。它是实际App函数和生产模块边界的受控复现，不是本次真实Rust DB或系统点击。

原候选01报告和9个证据文件保持逐字节不变，不能把其23组helper通过覆盖这项实际App失败；本目录是后续修复证据。原56d7运行失败/孤儿仍保留原结论。

## 本次15行产品修复

仅现有 `src/App.tsx` 与 `src/attachment-submission.ts` 各增加5行和10行：

1. `discardUninsertedAttachments` 沿用原目标可信复核、本地已插入拒绝和同步封住batch/op的入场。
2. 新生产方法 `settleForCancellation` 先invalidate，再等待该op实际running promise settle，包含FileReader和已发IPC。提交错误在此只表示该请求已经结束，不被解释为后端没有副作用。
3. App等待本批已存在op全部settle，仍保留batch/submission，随后重新进行原目标可信复核。
4. 只有此后才调用既有Rust窄cancel；在没有尚可派发的同op store后，接受的aborted/notPersisted才允许释放对应identity。deferred、响应被拒或原目标权限无法核定仍保留，不能继续插入或被当作取消成功。

```text
取消初始可信复核 → 拒绝本地已插入
    → 同步封批次/op（保留identity）
    → 等实际FileReader / 在途IPC / 提交promise结束
    → 再次原目标可信复核
    → cancel同operationId
       aborted / notPersisted → 释放该op；全部核定后释放batch
       deferred / 失效响应 / 无法核权 → 保留identity与明确错误
```

没有改Rust未知op语义、增加tombstone、放宽AccessGate、改变bridge或录音保存路径，也没有改搜索focus、Editor、CSS、依赖。`scope-integrity.json`核本次既有产品文件变更只有上述两条；01原证据manifest及9个文件均保持。

## 真实App函数回归

新增 `scripts/check-attachment-cancellation.mjs`，基于独审原失败的测试边界，使用TypeScript AST读取当前生产 App 的 `validatePickerTarget`、`submitAttachmentBatch`、`discardUninsertedAttachments` 原函数，不复制取消实现。执行生产 AttachmentSubmission、bridge、TrustedSynchronization、原目标guard、AccessGate与真实ProseMirror bookmark，FileReader/invoke及宿主refs受控。

新增8组均通过：

| 场景 | 实际受控结果 |
| --- | --- |
| FileReader等待时取消 | 封入场后仍batch1/submission1且尚无cancel；读完后store→cancel，最终后端0/前端0 |
| 已派发IPC在途时取消 | 原请求结束前只见store调用，前端identity继续保留；IPC结束后才cancel，最终0/0 |
| 已落盘但store响应丢失 | 等实际拒绝结束，仍以原op取消，最终0/0 |
| FileReader失败 | 先等读取失败结束，无未来store，随后notPersisted允许释放 |
| cancel返回deferred/save_pending | 后端1/前端1/1保留；再次取消核定后才释放 |
| 后端已删而cancel响应被AccessGate拒绝 | 后端0但前端仍1/1；新可信终态响应后才释放 |
| 等待期间真实原目标失效 | 不借其他目标权限取消，后端1/前端1/1明确保留 |
| 已知本地插入 | 在封入场与后端清理前拒绝，保留待保存身份 |

这些结果验证真实App删除identity路径，仍不冒称实际Rust DB、真实Tauri IPC、mounted Tiptap DOM或用户文件选择器验收。用受控平台延迟定序，不给原快操作加延时来刷通过。

## 检查与冻结

| 命令 | 结果 | 证据 |
| --- | --- | --- |
| `pnpm typecheck` | exit0 | `typecheck-result.json` |
| `node scripts/check-attachment-submission.mjs` | 原23组通过 | `attachment-submission-result.json` |
| `node scripts/check-attachment-cancellation.mjs` | 新8组通过 | `attachment-cancellation-result.json` |
| `git diff --check` | exit0 | `diffcheck-result.json` |

本次没有编译Rust或应用包，没使用共享target、GUI、REA、设备或实际用户数据。搜索focus独立工作树仍在原基线且没有产品修改。本次没有重跑无关存储/原生工具栏矩阵；它们的旧通过结果只属于原候选记录。

`source-manifest.json`记录8个累计候选源码，aggregate SHA256 `fbc609e2d777e81dd33b6b84350c40e5598e583772366745db897cac9f3794e1`，方法为按路径排序的 `path + NUL + sha256 + LF`。证据文件清单另见 `manifest.json`。需要独立新复核通过后才能纳入统一包及实际系统选择器验证，原候选失败不被改写。
