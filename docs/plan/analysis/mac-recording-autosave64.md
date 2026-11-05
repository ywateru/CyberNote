# Mac 录音暂停与关闭自动保存

2026-11-05。用户明确反馈 Mac 录音中关闭后无法保存，要求整体梳理逻辑，暂停或关闭录音窗口自动保存。此要求授权修改旧暂停契约，不需要再次确认。手机原模拟器与未保存录音继续保持，不安装、不导出、不停止或操作。

## 现状与目标

ac628b58 中暂停只有 MediaRecorder.pause 和非终结 requestData 前缀试听，没有持久化；进行中卡是 Decoration，不能重开恢复。关闭已有 final File→owner→附件 journal→正文 ACK→destroy 链，但没有本次真实失败的分阶段证据，不预断唯一原因。Window/Owner/Ticket/通用附件 operation 都只支持一个不可变 File，不能把暂停直接接到 onDone；旧 saved 还会终结 registry 与 child。

目标为同一逻辑录音暂停落盘、继续累计、关闭自动完成；只保存到最初 A，仍可编辑 A、切 B、搜索和切换浮窗/右栏。暂停成功必须有合法完整音频及 A 正文真实ACK，重开可见一张音频卡。失败不隐藏窗口或清音频，最终确认前不能关闭。

## 模块与连接

```text
真实 stream → 桌面分段 recorder → stop/dataavailable 完整分段
                               ↓ 解码/累计合法 WAV
Panel pause/close → revision N + checkpoint/final → child transport
                               ↓ 身份/版本/同字节重试
原 owner → 原 A 当前编辑器 + 保存队列 → immutable attachment operation
                               ↓ 首插 / 原位替换上一已确认卡
                         A 正文真实 ACK
                               ↓ query确认committed
                               ↓ checkpoint ACK（保留会话）
                               ↓ final ACK（唯一 destroy）
```

每次发布使用新的不可变文件/operation，后续替换前一已确认附件节点，用户只有一张逻辑卡。旧版本必须在仍受正文引用时 query 确认 committed，之后才允许被新版替换；JS正文ACK本身不会更新旧journal。保留旧文件以免破坏Undo、历史引用及不确定保存，不改通用不可变协议、不覆盖旧文件、不新增DB迁移。内部多版本有磁盘与归档空间代价，报告须明示；不能静默删除、截断或把界面一张卡说成只有一个物理文件。

## 交付边界

64一次覆盖分段媒体、版本传输、原A正文更新及安全关闭。独立开发与核验，覆盖生产组件控制链和实际SQLite/附件恢复。受控媒体不等于本机麦克风验收，新Mac包与真实运行分账。无听写、原版删除测试、TCC重置、签名放宽或手机设备动作。63诊断保持默认关闭；授权问题不由autosave源码通过追认修复。
