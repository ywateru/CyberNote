# Sync86 前端 quiet 窗口开发证据

2026-11-06。源码候选 `5950bd30`，基线 `d8ff33362cb2bc9adfac9cbd205b90ae3bbead73`，分支 `codex/sync86-frontend`，唯一工作树 `/private/tmp/apple-notes-sync86-frontend`。这是 frontend develop 证据，等待另一作者独立审查；不代表 86 adapter 或完整同步目标通过。

源码实现固定 `notes-sync` probe/prepare/release 与带 `expected` 的 `sync_window_reply` 收据。真实 App 收集 PM composing、TagComposition.pending、picker、附件在途、完整录音 ticket owner、创建/退出/既有 access 屏障；prepare 在目标 editor 安装 PM 写事务门并暂时 park，然后等待目标保存队列与失败状态。导航、创建、原生 intent、退出等需要取消时等待本机 terminal receipt/release；5.5 秒 watchdog 只请求后端终态，不自行解冻。commit 收据仍等待可信正文刷新和真实 React host commit。释放时重新检查 session/noteEpoch/editor owner、锁定和删除。其他 editor 可继续正常正文保存。

attachment/recording 的 global epoch 允许可信 snapshot 下前进重绑，保留原 Session、noteEpoch、owner、editor、document、trusted document、documentVersion、externalVersion、可用性和 bookmark 校验。普通 metadata/revision 且正文不变不重挂。真实远端正文目标仍使用现有 hydrate/externalVersion 路径更新；probe/prepare/abort 本身和无关 editor 保留 DOM 与 Undo。

## 最终验证

所有命令 cwd 都是上述唯一工作树。冻结源码的六个文件 SHA256 与准确命令/自然退出码见 [frozen-source.json](develop/frozen-source.json)。

| 命令 | 自然退出 | 证据 |
| --- | --- | --- |
| `node scripts/debug/sync-window.mjs docs/verification/sync86-frontend/develop/final` | 0；34 项，16.903 秒 | [report.json](develop/final/report.json)、[run.log](develop/final/run.log)、[HTML](develop/final/final.html)、[snapshot](develop/final/snapshot.json) |
| `pnpm build` | 0；TypeScript 和 Vite；保留原有 chunk size 提示 | [build.log](develop/final/build.log) |
| `node scripts/debug/cli.mjs group notes --out docs/verification/sync86-frontend/develop/final/notes` | 0；9 项 | [summary.json](develop/final/notes/summary.json)、[log](develop/final/notes.log) |
| `node scripts/debug/cli.mjs check-production --production dist --out docs/verification/sync86-frontend/develop/final/production` | 0 | [summary.json](develop/final/production/summary.json)、[log](develop/final/production.log) |
| `git diff --check` | 0 | 观察退出结果记入 frozen-source.json |

最终定向 fixture 的 before/after 源码指纹完全相同：`f516189f46a71e8a1bbeb76722ca1a278e2b97953ac855068804c9abffc1c209`，`sourceChanged=false`，`pageErrors=[]`。notes 与 production 的源码指纹也相同且未在运行中变化。报告 sourceHead 是运行时尚未提交的基线 d8ff3336；该源码字节随后提交为 5950bd30，不把报告旧 HEAD 冒充已提交检查。

34 项定向检查包括 probe 无副作用、已有保存队列 ACK 后 ready、abort 同 DOM/Undo、独立 A 编辑、真实 Chromium CDP IME composing 与 TagComposition.pending 以及自然最终 transaction、导航待终态、native/debug guard 和实际 PM 程序化写事务拒绝、旧 release、迟到 ready、取消收据丢失后的同 operation 重试、真实 5.5 秒 watchdog 不提前解冻、非当前 Session 事件拒绝、picker 和附件 storage/document ACK、暂停录音至最终 release ACK、B 锁定/global epoch 变化后 A 继续 checkpoint、创建中和既有 access 屏障 blocked、正文相等 metadata 不重挂、commit 等可信投影进入 host、授权撤销不恢复 editable，以及 dispose/StrictMode/session 替换时取消或 flush 挂起的有界清理。

生产 attachment-target helper 另在相同浏览器脚本直接运行：可信 global epoch 前进可重绑，原 target stamp 不被 helper 隐式修改；14 项 Session/noteEpoch/editor/owner/document/version/availability/epoch 回退或缺失变更全部拒绝。coordinator 有界清理的补充检查直接运行生产 class，以明确的 host port fixture 检查挂起的 IPC/flush；没有把该补充端口检查记为真实 DOM 或 Rust。

## 原始失败与恢复

所有原件保留，没有覆盖失败日志或重写旧报告。

| 目录 | 结果 | 实际原因及后续 |
| --- | --- | --- |
| [attempt01](develop/attempt01/report.json) | 自然 1，已过 13 项 | 测试未接 Playwright filechooser，headless 浏览器自然取消 picker；真实 App 已释放 picker，保护断言因此失败。脚本改用真实 filechooser 事件持有 chooser；保留 [failure HTML](develop/attempt01/failure.html)。 |
| [attempt02](develop/attempt02/report.json) | 自然 1，已过 15 项 | 脚本使用了不存在的 recording `start` 动作；真实录音契约是 `toggle`。修正脚本参数；保留原始失败。 |
| [attempt03](develop/attempt03/report.json) | 自然 0，23 项 | 初步定向边界通过；后来继续补充 commit/cleanup 和后续检查，不作为最终源码验证。 |
| [attempt04](develop/attempt04/report.json) | 自然 1，已过 22 项 | 脚本主动发送旧 notes-access abort，该 handler 按既有契约显示“锁定未执行”；脚本在清除预期错误前调用 idle，idle 正确拒绝。改为明确 dismiss 后 idle。 |
| [attempt05](develop/attempt05/report.json) | 自然 0，30 项 | 新增创建/access/metadata/commit/授权/cleanup 通过；后续继续加强 timeout 与附件 ACK。 |
| [attempt06](develop/attempt06/report.json) | 自然 0，34 项 | timeout 与附件 ACK 通过；随后补充 dispose 时挂起 flush/取消及 trusted Session 替换的等待终止，最终重跑见 final。 |

旧 `node scripts/check-attachment-submission.mjs` 另自然退出 1，原始 [attachment-submission.log](develop/attempt01/attachment-submission.log) 保留。其 data-URL 转译 loader 不能解析当前 bridge 的相对 `./data-management` import，尚未运行到业务断言；不把它记为通过，也未扩大范围修复旧 harness。该脚本的旧 global epoch 拒绝期望已随新契约调整，实际 helper 新契约由上述最终浏览器定向脚本验证。

## 证据边界

脚本挂载实际 React App、Tiptap、TagComposition、保存队列、原生/toolbar handler、录音控制器与真实 HTML。IME 使用 Chromium CDP `Input.imeSetComposition` 和 `Input.insertText` 产生浏览器原生组字与提交，未伪造 compositionend。录音只使用既有固定合成 PCM/WAV 设备边界，未访问真实麦克风。

`notes-sync`、`sync_window_reply`、metadata/access、文件/录音本机 IPC、临时库与 chooser 都是明确 fixture 边界。最终报告不证明生产 Rust coordinator、SQLite merge、真实 socket/Noise、双页面独立 transport 或 Android。锁定 B 的 global epoch 场景是 fixture 后端发布可信 workspace 的本机边界测试，不是对端网络合并结果。

没有修改 Rust/lib/Session/网络/身份或 Rust runner，没有创建/删除工作树、合并或 push。没有访问、安装、启停、读取或备份原 Android/旧 AVD，原约 13 秒未保存录音现场未操作。root 后续整合两个真实 App DOM 各接独立生产 Rust transport，并安排独立源码审查；本开发证据不替代这些步骤。
