---
id: app-002-recording-submit-01
scope: recording-parent-operation-document-ack-and-cancellation
status: pending
depends-on: [app-002-attachment-store-01, app-002-recording-state-01]
---

## objective

将真实录音面板的完成操作接入已独立通过的附件提交边界。打开时固定原笔记、Editor、书签和会话票据；同一最终 File 的失败重试复用同一 operation。只有真实正文保存 ACK 后，父 onDone 才 resolve 并关闭录音。ACK 后的刷新失败单独提示并保留成功身份，不再次存储或插入。

这是完整媒体闭环的接入任务，不把局部录音状态测试或文件存在当作正文持久成功。用户已授权完整本地 Mac/Android 实现；本任务不增加云服务或改动原版数据。

## context

阅读 docs/INDEX.md、docs/architecture.md 的媒体生命周期/附件提交/授权契约、docs/research/mobile-recording-next-01/analysis.md、docs/ui/recording-mobile.md，以及两个依赖任务最终独立报告。必须从依赖已合入且附件前端已独立SOURCE-READY并合入的主 HEAD 建立隔离分支，读取真实 AttachmentSubmission/helper 接口后接线，不根据尚未冻结的接口猜测实现。前端源d81dd575已独立通过并主c793166/01aada6合入；真实文件选择器E2E不是录音父接线实施的前置门槛，两条完整路径在同一新包各自实际验证，不能互相替代。

## path

主要 src/App.tsx 的普通/原生录音入口、父完成与取消/Back/授权销毁接线；只在确需复用时修改已冻结附件 helper 和 bridge 的对应窄接口，补齐同一个生产提交边界检查。RecordingPanel 的 onDone(File): Promise<void> 可保持不变；如必需变更 props，先在本任务同步明确所有调用点与局部状态影响并独立审查。

不重写 RecordingSession、局部活动时钟、录音控件几何、通用 audio player、绘画、Rust Store、依赖或共享 CSS。不占用零结果 UI 的 App 编辑阶段，两个 App owner 串行实施。

## contract and connections

```text
普通菜单 / 原生顶部录音
  → 打开前固定原目标与活性票据
  → RecordingPanel → 真实采集收尾 → 最终同一 File
  → 复用 AttachmentSubmission / bridge operation
  → stored → 一次插入 → 真实 SaveQueue / Rust 正文 ACK
  → 关闭面板 → 刷新
```

录音面板保存期间自身 overlay 仍需打开。现有 picker availability 正确地拒绝 record=true，不能直接复用到录音而让自身永久失败，也不能放宽所有 picker/nativeAssert。允许为当前唯一活动录音票据提供窄的 availability 适配，仅豁免该票据对应的录音自身 overlay；原scope/note/Editor/完整文档/书签/会话、loading/sync/访问屏障及其他overlay门禁全部保留。底层原目标重绑定与同一个 AttachmentSubmission 实现继续复用。检查必须证明普通picker在录音打开时仍拒绝、过期录音票据和其他overlay不取得插入权限。

所有入口都必须捕获有效原目标，不以 null 回落到稍后当前笔记。每次 await 后核查该会话仍活跃和原目标合法。父保存失败必须 reject 给面板，保留最终 File 与已取得的 operation/附件/插入阶段；缺 Editor、insert false/throw、ACK 失败不能静默 resolve。

取消、Back、关闭窗口与授权失效先同步关闭这次提交的入场，防止晚存储响应插入节点。只允许已有 Rust cancel 核本操作安全新文件；当 renderer pending 文档仍引用附件时，保留附件与可恢复状态，不因数据库暂未引用就删除。已 committed 的附件永不按失败新文件清理。不能确定结果时保留真实 deferred/错误，不伪称取消成功。

同一最终 File 重试沿原 operation 恢复：尚未插入才插入；已经插入仅继续对应正文保存；已 ACK 只继续刷新。不得借重新调用父回调创建第二个 operation、第二个附件或第二个节点。无效旧目标明确失败，不转存其他笔记。

## verification

开发与独立审查均穿过实际 App 接线与生产 helper/SaveQueue；受控的失败注入必须披露。检查普通/原生入口、有效原目标/切笔记/旧 Editor/授权代次、存储返回失效后的 query、insert false/throw、正文 ACK 失败后同 File 重试、ACK 后刷新失败、重复 Done、取消/Back 后晚结果和 pending 引用保全。类型检查和必要的附件/录音生命周期回归必须通过。

新统一默认包记录精确源码输入、产物与安装身份后，Mac/Android 分别实际录制→暂停直接完成→正文卡片→正常退出/冷启动→播放，核完整正文、revision、附件元数据和原文件 SHA；记录真实资源释放及错误。音轨可听性必须用实际含声音采集验证，已有 429547B 静音原文件不算通过。无法取得硬件音源时明确 unknown，不能用生成音轨或非空 Blob 替代。

原版暂停回放/转写、全页像素及未测状态仍由后续任务负责。本任务只在源审与明确的新包实际证据范围内关闭对应缺口，不追认 candidate02 已包含新接线。
