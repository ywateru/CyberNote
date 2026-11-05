# 读取恢复67独立复验准备

状态：**PREPARATION ONLY**。独立树 `/private/tmp/apple-notes-mac-recording-media67-independent-01`，基点 `667d8771f1d8693f4f137751ce0949266b6ef454`。与作者基点 `43e16f97` 的差异只有任务67及runtime66两份文档，产品没有差异。尚未接收67产品提交，不运行候选PASS，不修改产品。

## 已知事实与未证部分

Mac19准确源7c1a3e42的C在×收起后首次显示MetadataStale，正常手动重试才恢复1:31卡和播放控件。E活动×后0:21首显正常是另一条有限事实，不能覆盖C失败。F活动主窗关闭后，新进程恢复0:10卡、C1:31和D文字是视觉持久恢复，不证明内部ACK或音频字节质量。旧18 PID8002随后检查已不存在，退出时点和原因未知，不再声称现场仍保全、不重启或假称恢复；Android不操作。

当前代码已证明 bridge.readAttachment 每次由附件owner捕获AccessStamp，发起真正read_attachment并执行accept：access预验→metadata.observe/canPublish→access发布。MetadataStale为实际class。基线hook只读一次，catch后保留failure，且只在id/kind/manual version改变时重跑；实时录音插件通过display:none保留持久NodeView，因此可能暴露先前的失败。哪一个实际metadata事件导致C失败尚无内部trace，不把这一推理写成运行观测。

## 冻结后的独立复验

1. 收到作者精确已提交SHA后，先核tree清洁、提交父与范围，只cherry-pick该产品提交。记录author SHA、独立映射SHA、全部目标源码哈希；baseline evidence保留，候选只在准确源上执行。
2. 独立受控读取链不替换bridge、AccessGate、MetadataGate、hook、MediaView或URL所有权实现。仅替换native IPC/event/受控媒体环境；必要测试getter/trace只用于观察，不能改accept/save/retry判定。受控数据是合成fixture，不触实际录音。
3. 持有read_attachment旧metadata响应，推进真实gate（以真实正文保存ACK/metadata事件形成新sequence），再放旧响应。trace记录read序号、id、expected、实际stamp调用/返回、旧响应sequence、gate observed/applied、拒绝类型、下一完整read及最终首显；不得把普通throw当作真实bridge过门禁。
4. 成功路径至少覆盖stale→成功与stale→stale→成功；三次连续stale应准确停止在总read=3、错误可见且手动按钮可重新开始独立version。首次失败分支按基线预期保留，候选无须用户点击便出现持久播放器。
5. 非MetadataStale不可自动恢复：AccessChanged、锁定/撤权拒绝、缺owner/不可读、普通Error、同message或仅同code假对象；Malformed元数据/错误录音日期/base64造成的不同异常明确保留。预期read计数由真实typed错误决定，不能以字符串宽泛识别。
6. 生命周期矩阵：id变、kind变、unmount、手动version改变时，迟到成功不造URL/不发布；迟到stale不继续旧重试。自动第二次read等待期间同样覆盖；手动新version可与旧响应交错，最终只发布新version。音频URL每次创建只来自被完整接受的响应；替换/卸载先停止已绑定控制器再准确一次revoke，无过期源泄漏。
7. 真实App final交接：使用实际App、NoteEditor/MediaView、SaveQueue、useEditorCommit、RecordingRevisions、DesktopSession和录音实时卡装饰。保持旧read，完成真实final链；trace区分attachment stored、正文ACK、query committed、final/native release、overlay撤除与持久卡加载。确认一张逻辑卡，原A归属及B正文保持；恢复只增加read，不新增store/正文save/版本/插入/ACK，不把隐藏失败误判为通过。
8. 共享手机受控基本回归只在独立浏览器fixture执行：audio/image/video/file正常加载、不可读可见、换kind/ID不串旧资源；不引入桌面布局或修改手机录音流程。实际Android设备、旧包、原13秒现场全部不动。
9. 候选执行typecheck与前端build、必要既有音频源/播放控件回归。所有新runner/运行结果明确记录合成IPC/媒体边界、输入身份、读/写计数与trace。原生编译、签名、包、Computer Use和真实录音验收由root另行串行安排，源码通过不替代这些层次或像素验收。

## 交付门禁

越界修改gate/bridge验收、写入/存储/保存ACK/journal/退出守卫/呈现/权限属于阻塞项。自动恢复超过三次、错误类型扩大、旧生命期继续读或发布、URL泄漏、恢复重写录音或仅用stub代替真实交接都属于阻塞项。最终独立review逐项标注P1/P2/P3与blocking/non-blocking；候选准确源码/受控结果与实际runtime分账。

本准备阶段仅只读源码和文档并写入本目录，没有运行测试、构建、应用、GUI、设备、音频或权限操作。baseline-preparation.json保留准确基点及所读关键输入哈希。
