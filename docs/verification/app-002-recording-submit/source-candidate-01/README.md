# 录音父保存：源码候选 01

2026-11-04。隔离工作树 `/private/tmp/apple-notes-recording-submit-01`，基线 `ab728ad487c0c9b397fca3f67e57460bbe520e22`。产品仅修改 App；新增一项穿过真实父回调的检查。等待独立源码审查，没有原生构建、GUI、设备、麦克风、Rust target 或像素验收。

普通媒体菜单和原生顶部均在打开面板前固定同一个 PickerBatch：原 note、Editor、完整文档、PM 书签、授权/外部版本、operation。面板按 operation 加 key，回调闭包固定票据，不读取稍后的当前笔记。最终 File 绑定一次；重复 Done 合并，同文件重试保留同一个 AttachmentSubmission。普通 picker 仍由 `!record` 阻止；录音验证仅当前票据及它自己的 target 可使用 `recordingAvailable`，其他 modal/menu/draw、授权、scope、Editor、文档/书签与可信同步门禁保留。全局 nativeAssert 未改。

```text
固定原目标/operation → 同一最终File → 同一生产AttachmentSubmission
   → stored → 一次实际插入 → 原saveDoc/SaveQueue正文ACK
                                  │
                         ACK前失败：reject给Panel
                         ACK后：关闭Panel → refresh
                         refresh失败：保留已保存身份，只重刷
```

父 Done 复用实际附件提交链，检查插入 boolean/throw，并等真实 `saveDoc` 对返回正文的匹配 ACK。已插入但 ACK 失败时，面板的同 File 重试先重试原 note 的 pending 正文，再恢复同一操作，避免通用 flush 被失败队列永久挡住。既有 awaitDocumentAck 端口抽为 App 内同一个窄函数供两处使用，生产 helper、bridge 与 SaveQueue 文件未改。

取消/Back 先同步封住 submit 入场并卸载已被局部 live=false 封住的 Panel。未插入才失效操作并等待实际 run settle（包含 FileReader/IPC），保留同票据的原目标验证权限，随后通过 Rust 的窄 cancel 核定 aborted/notPersisted 才释放身份。deferred/失败保留 batch/op 和全局错误/重试入口；不伪称取消完成。Editor 或 pending 正文有引用时不发 cancel，保留原附件和待保存文档；全局重试沿原保存队列取得 ACK。ACK 成功关闭不执行 cancel/invalidate。

访问 prepare/销毁和目标切换接入同一票据封口。卸载只封口并保留可能已写入的身份，不把晚返回当取消成功。现有唯一 onCloseRequested 通过 lifecycle ref 等安全取消或原 pending 正文 ACK；没有新增窗口监听、run→cancel→run 自等待链。无待保存/录音票据时不阻止普通关闭。

## 必要检查

| 检查 | 结果 |
| --- | --- |
| 实际父接线 `check-recording-submit.mjs` | 20组通过 |
| 原 AttachmentSubmission | 23组通过 |
| 原实际 App 附件取消 | 8组通过 |
| 原 RecordingSession | 26组通过 |
| typecheck、格式、差异检查 | exit0 |

[recording-parent.json](recording-parent.json) 保存20组原始结果和生产源码 SHA。执行真实 App AST 的普通/原生入口、Panel onDone/onCancel、原 hydrate/validate/saveDoc、submit/retry/cancel、Back、唯一 close effect 和卸载清理；使用生产 AttachmentSubmission、bridge、AccessGate、TrustedSynchronization、SaveQueue 和真实 PM 文档/书签。覆盖 ACK 前保持面板与 pending Promise、重复 Done、同 File 保存失败重试、ACK 后仅重刷、insert false/前后 throw、实际 bridge 失效响应后的 query、其他 overlay/旧票据、切笔记/旧 Editor/授权代次、FileReader 与 IPC 等待中取消、deferred 反馈、pending 引用、访问遮挡、关闭等待正文 ACK/进行中的 store，以及空闲窗口不拦截。

受控边界是 React setter、Editor 命令宿主、FileReader、invoke/后端响应和窗口宿主；没有 mounted App、真实 Rust DB 或设备。测试的 File-shaped fixture 和音频 payload 不证明有效编码、可听音轨或播放。Panel/Session 未在这项父检查中挂载，原26组是平台边界受控的资源生命周期回归。成功组数不能替代新包实际录制、冷启和播放。

[source-manifest.json](source-manifest.json) 记录 App 与新脚本的 SHA，aggregate `941e9f7c3e287d8aeb606078354cb11e65b2f0ece5af4c30c6ceaa9239b330b2`。[protected-boundaries.json](protected-boundaries.json) 核21个未改文件与7个 App 函数/谓词：Panel/Session/clock/player/CSS/Rust/依赖等保持基线字节，saveDoc/flush/hydrate/refresh、搜索过滤/选择及 nativeAssert 逐字不变，Rust/plugin diff 为空。完整 App 差异在 [product.diff.patch](product.diff.patch)。

后续由独审接棒，root 整合新包后分别实际验证 Mac/Android 录制→暂停直接完成→正文卡片→正常退出/冷启→可听播放，核完整正文、revision、附件与原文件 SHA。当前不关闭旧静音文件、原版回放/转写或像素差异。
