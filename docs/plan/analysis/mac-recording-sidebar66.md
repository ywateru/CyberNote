# Mac录音统一右栏66分析

2026-11-05。用户直接授权彻底重构，统一主窗侧边录音，取消浮窗。无需再次请求设计确认。当前Mac18真实首次暂停失败，65修复Host布局等待及合法状态投影；66保留其修复和64累计版本保存链，改变会话持有者及native退出登记。旧现场与所有历史证据保留，手机不动。

## 模块与交付边界

| 模块 | 输入/输出与职责 | 依赖 |
| --- | --- | --- |
| App录音owner/ticket | 固定原A/Editor/bookmark/授权及本地owner身份，稳定右栏创建、final完成后清理 | EditorHost/Gate、SaveQueue、Revisions、native登记 |
| DesktopRecordingPanel/controller | 唯一Session、累计PCM、immutable File；发布状态、checkpoint、awaitable final及cleanup重试 | DesktopSession/PCM、Playback、App直接保存 |
| RecordingView/布局 | 右侧非模态280px起点，真实波形/时钟/播放与关闭，无浮窗菜单 | 稳定controller；不依赖当前note key |
| Rust本地会话registry | 采集前登记owner/window incarnation/session/operation，final真实结果后注销；退出时保留所有document参与者屏障 | 现有quit协议和window lifecycle |
| 历史浮窗路径 | 移除活动child创建、renderer入口、relay/presentation协议及无用capability；保留历史证据 | 审核所有引用与权限，不放宽现有存储/麦克风授权 |

这些模块共同形成一个不可拆交付：仅替换视图会留下child依赖；仅删child会使退出绕过保存；仅Panel成功会留下主窗关闭void结果。统一任务同时实现与验证。

## 创建、调用及注入链

1. toolbar/native menu/inline入口 → capturePickerTarget(A) → native local registration → App稳定desktop sidebar → Session真实采集。登记失败不能采集，已有会话入口恢复同栏不重建。
2. navigation/search/current B → Host停放EditorA → 稳定Panel不卸载；A/B真实事务经原SaveQueue，A书签映射保持。
3. pause → stop完整分段 → 累计WAV → immutable revision/File/operation → App实际validator（trusted sync→真实Host commit→再核权限/版本）→ Revisions store→唯一节点插入/替换→saveDoc ACK→query committed → 显示已保存，可继续。
4. resume → 原stream新完整segment，不重置recordedAt/归属；next checkpoint替换同一逻辑卡。先前节点删除/Undo/重复/权限变化拒绝，无fallback插入。
5. sidebar ×/Done/context Escape → 同一awaitable final；busy关闭排队，重复关闭同Promise；final已存后native cleanup失败仅重试cleanup；成功才撤live card、注销和卸载。
6. main close/CmdW → seal admission/await lifecycle.close → OCR与正文/偏好flush → destroy。失败取消关闭并保留音频/可重试UI；无ensureFloating/hide。
7. CmdQ/OS exit → native local registry → document participants seal→实际final close→flush→精确quit ACK→退出；失败/超时恢复合法编辑。注销本地会话不能绕过正在进行的全参与者退出事务。
8. access suspend/true revoke/detach → 原A失效和pending Host wait abort，保留音频/错误，不能转换到B或授权新owner。普通blur/minimize不触发。

## 验证边界

必须使用实际挂载App/Host/Editor/SaveQueue及直接Panel/Session，另测Rust登记身份和quit参与者路径。合成媒体可覆盖故障注入，不能当真实麦克风或像素结论。新准确Mac包需后续Computer Use验证，不关闭现有Mac18内存音频；手机设备不操作。源码、构建、实际设备与像素分别记账。
