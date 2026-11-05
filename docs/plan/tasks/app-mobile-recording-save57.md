---
id: app-mobile-recording-save57
scope: mobile recording trusted synchronization and actual editor commit boundary
status: developing
depends-on: [app-recording-presentation55, app-recording-playback56]
---

## objective

修复准确 Android10 / 9167db9 实际录音完成与一次重试均被原附件目标校验拒绝的问题。保留原目标完整保护与同一 File/operation，不能以绕过校验换取保存。设备事实见 docs/verification/recording-presentation55-runtime/android/android-report.md，13 秒真实录音仍停在失败界面，禁止关闭、升级或清空该现场。

## diagnosis

准确源 validatePickerTarget 等待可信 synchronizeRef，但同步 Promise 返回可早于 SearchEditorHost 的恢复布局提交；同步中的 blocked 使 gate.park 将真实 editor.isEditable 置 false，available 据此可错误拒绝未变正文。现有闭包夹具没有挂实际 React Host/Gate，未覆盖该提交边界。此源码可达缺陷可解释设备错误；没有设备字段 trace，不称设备唯一根因已经证明。

## contract

仅手机录音保存：成功且仍当前的可信同步后，等原 SearchEditorHost 的实际恢复提交，再重新取实时快照并执行原 rebindAttachmentTarget 全量校验。首次 store 前和 store 后第二次校验同样遵守。保留 available/isEditable、原 note/owner/editor/scope、raw/normalized 正文、版本与授权 epoch 保护。等待中取消、销毁、失权、目标/owner/正文改变必须结束或拒绝，不悬挂、不重绑到另一笔记。重试保持已有 operation/File/附件身份，ACK 前不关闭。

不得改桌面唯一 Session、主窗双模式和 A/B 保存规则、麦克风权限/TCC、DB schema、通用保存安全策略。必要扩大范围先报告具体原因。

## verification

固定源码后分人独验。实际挂 App + NoteEditor + SearchEditorHost/Gate，通过延迟可信读取令 blocked 冻结真正提交，再验未变稿保存仅一次 store/insert/ACK；同步前后和等待中 scope/owner/raw/normalized 正文/stamp epoch/失权/销毁拒绝无副作用；store 后边界、ACK 失败重试无重复；桌面 A/B 同时编辑回归。用可达旧源失败、新源通过的同一真实组件情形证明修复，不镜像实现。

作者与独审通过后主线整合并精确构建 Android，现有 Android10 失败现场保留。优先在独立模拟器验新包，不能升级而丢失内存 File；如无法隔离须先提出具体保全方案。新包实际录制/暂停/试听/继续/完成/冷启/播放作为最终设备验收，源码通过不能替代。
