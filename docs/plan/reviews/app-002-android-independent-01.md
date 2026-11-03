# Android dba83641：独立媒体与纸张有限验证 01

2026-11-03 实测，2026-11-04（Asia/Shanghai）完成证据整理，verify。结果：**有限实际录音取消、既有媒体保存身份、纸张七态与短屏滚动通过；已保存录音仍有 duration Infinity / 0:00 缺陷，不能整体验收媒体或像素一致**。本报告只对应 APK SHA256 `dba83641b95b028f36cb92c80b901c68b5cccf3b1d0b56d653c3e527fae370e4`，301,364,922 bytes；后续 F07 / AudioPlayer 合并统一包不得沿用为其运行通过。

证据目录 `docs/verification/app-002-media/android-independent-dba83641-01/`。运行设备 emulator-5580，Android 11 / API 30，WebView 91.0.4472.114，应用 PID 7137。未安装新包、卸载、清数据、重置权限或重启模拟器。host microphone 始终 OFF；本轮只创建一篇明确的 QA-PAPER 测试笔记，原有 MEDIA02 两篇完整保存记录保持不变。

## 身份和证据层次

- 独立读取已安装 base.apk 的 SHA/size，等于保留的 `/private/tmp/notes-media-permission-candidate01-dba83641.apk`。
- 独立重算开发证据 manifest 的 89 个文件，全部匹配；143 个源码输入和聚合 `c3fc543fcfe8686b0f9906305c1dae8c9fcf441ba0f4d4bc9716c4889de12259` 与该冻结包记录一致。身份对应开发 freeze fc2706c98faa826a3b8bf88596ef3e3c2d2b3881。
- **独立实际设备动作**是既已授权、无 API wrappers 的录音进入→等待 12 秒→取消，以及纸张原生输入/触控/滚动。既有音频实际 bytes、完整测试笔记和 Rust attachment metadata 是独立只读复核。
- **开发首次系统 Deny、Allow、暂停/恢复、结束、保存及冷启**仅独立核其原始 XML、actions、JSON、媒体、manifest 并重做文件/对象比较，没有重复实施成第二次独立首次权限测试；未撤销权限来伪造首次提示。

前一次错误调用系统 PATH 的另一 adb 因 daemon 权限失败，在接触设备之前终止；后续均使用 SDK `/Users/water/Library/Android/sdk/platform-tools/adb`。最初本地 SHA 汇总脚本误用本机 Python 不支持的 file_digest，已改为流式 digest；均不是产品失败，没有靠重试录音取得通过。

## 独立实际录音取消

从已保存 MEDIA02-PERMISSION-20261103B 原生点添加附件→录音，持续 12 秒再原生取消。全程 `window.__mediaBaseline` 不存在，没有包装 getUserMedia/MediaRecorder/AudioContext，没有合成 stream、调用 session 方法、写 editor/ref 或 DOM click。通过有限 React Fiber 查找真实 RecordingSession，只持有 CDP remote handle 读取原对象，结尾释放该 objectGroup。

| 资源 | 进入后及 12 秒 | 取消后 |
| --- | --- | --- |
| 实际原 MediaRecorder | recording；audio/webm;codecs=opus | inactive |
| 实际原 AudioContext | running | closed |
| 实际原 audio track | live，enabled=true | ended |
| session timer | 有效 timer 11 | null |
| session recorder / context / tracks | 对象存在，1 条 track | null / null / 0 |
| 录音面板 | 存在 | 消失 |

同一 PID 7137 存活；取消前后**整个过滤出的 Rust 测试状态**（完整 notes、document、revision、附件元数据、总附件数）相等。证据 04–09 和 unwrapped-cancel-independent.mjs。没有额外录一次停止/保存来扩大矩阵。

这证明此固定设备版本上的实际 JS 媒体对象释放；host microphone OFF，未验收可辨识声音、宿主物理麦克风或系统指示灯。

## 既有保存媒体与已确认缺陷

测试笔记 id `a9d1bbe7-a0ee-4f46-ba3e-e0889085cac3`，revision 30；attachment id `cb3fa001-9d73-4580-b959-38481fbba90b`，MIME audio/webm;codecs=opus。独立实际从应用管理目录 `attachments/cb3fa001-9d73-4580-b959-38481fbba90b.webm` 拉取 bytes，大小 429,547，SHA256 `cd7ee9692361fb3502775e8b7efc87ba0957ee22835f10e6d7335b09980fdf4f`，与开发保存/冷启后的文件相同。完整 runtime document、Rust note/attachment 及开发 final 状态相等。没有复制完整私人数据库。

本轮本地 ffprobe 对独立拉取的实际文件读取到 1101 个 Opus packets，末 PTS 66.004 + duration 0.060 = 66.064 秒时间线。但实际 app 音频对象 duration 为 Infinity，readyState 4 / networkState 1 / mediaError=null / seekable [0,Infinity]，保存卡仍显示 **录音 · 0:00**。这是可见缺陷；有效 packets 不能替代有限时长、完整播放、结束和 seek 行为验收。仅观察当前 MediaError 属性，没有完整历史媒体错误事件采集。

## 开发原始权限与保存证据的独立复核

独立读取的真实系统 permission XML 包名为 com.google.android.permissioncontroller，Deny 按钮和 While using the app 均存在，actions 坐标对应按钮。首次 Deny 的 entry 与等待后 JSON observer 都为空，UI 显示 Permission denied；等待后 PID6564，permission granted=false，before/after 两篇完整 Rust 测试对象相等、revision29不变，无附件文件。该原始失败拒绝路径并非 wrappers 下结果。

后续 Allow 确实装有转发 wrappers：原始脚本通过 Reflect 调用真实 API，同时记录返回对象/事件。原始日志 constraints audio:true，实际创建 MediaRecorder 和 AudioContext；停止后 inactive / tracks ended / context closed，最终 dataavailable 在 stop 事件前，完成后有 preview revoke。after-complete / final / cold-start 的整个 Rust 测试对象逐项相等，新增且只有一个 attachment。开发短 Play/Pause 的时间进展只是其原始证据，不是本轮独立播放验收。

`36-developer-original-evidence-review.json` 保存本次核对结果。系统首次 Deny、Allow 和保存链的原始结果可作为开发证据；与本轮独立 actual unwrapped cancel 的证明范围分开。

## 纸张七态、选区和短屏

通过原生新建笔记、输入 `QA-PAPER-INDEPENDENT-20261103C`、真实 IME Enter、输入 Alpha Beta Gamma、长按 Beta，打开格式并加粗，X 关闭，Android Back，再 More→横线与网格。未使用 editor command 写入测试正文。

正常 393×751 CSS viewport 先 Cancel，再七态逐个实际选择→Rust 保存→重新打开确认选中→原生 Back：grid-large、lines-small、grid-small、lines-medium、grid-medium、lines-large、plain；revision49–55。每一步完整正文 JSON、ProseMirror selection anchor39/head43、真正 NoteEditor 父 key 均相等。使用仅 CDP held 对象做严格 ===：Editor / View / DOM 全程同实例。面板中 editor=false、未 focus、无 IME，返回 editor=true 且选区正文不变。没有只比较显示文本或把外层 wrapper key 当真实父 key。

正常屏幕截图 19 和短屏截图 27 已人工查看：空白首行，随后横线/网格成对，六个独立 SVG alpha mask 均实际渲染、密度递减清晰。computed WebKit mask 为各自 data SVG，mask-size contain；不把 computed CSS 单独算成可见验证。没有宣称原版像素一致。

短屏只临时设为 1080×1600，同宽393 CSS、不跨 mobile breakpoint。初始 sheet clientHeight484 / scrollHeight726、末卡在可视区外；真实 native swipe 后 scrollTop0→241.818，末卡 y374.824 + h105.290 < viewport504，位于系统导航栏上方；原生点击 grid-large 并在 Rust 保存成功。Android 底部 padding 实测24px。本用例明确允许内容滚动，不再使用旧的“七卡必须首屏全可见”断言。未测试 iOS 非零 safe-area。

最后恢复 physical1080×2280 / density440，无 override。短屏恢复后完整 document、selection 和父 keys 仍与之前相等，最终纸张 grid-large。MEDIA02 两篇及唯一旧媒体 attachment 的整个 Rust 记录经过纸张全部操作仍与阶段初始相等。

## 清理与未验收范围

停在该 QA-PAPER 测试笔记；纸张/录音/菜单已关，无 observer。释放 CDP remote handles、连接和自有 tcp9227 转发。hostmicoff 返回 OK。保留 emulator PID3197 和原 parent session73263，未停止、wipe、uninstall、clear data 或重置权限；应用仍 PID7137。相关恢复及阶段检查点 31–35。后续 root 要求先进入 F07 源码复核，因此没有再操作设备或重复冷启扩大范围。

受控不可信 frame/source 运行拒绝没有执行：当前固定可信 bundle 的静态 CSP / kind-only callback 接线结论仍见 permission-static-01；本轮没有一个可靠且必要的安全本地 frame probe，不用注入不可信可执行脚本或替换主 bundle 伪造结论。此项明确 unknown。

还未验收物理声音、系统麦克风指示灯、暂停直接完成、失败补偿/重试、完整播放/seek、Mac 捕获、iOS safe-area、像素统一及后续统一包。纸张正常七态/短屏和实际资源取消是此次有限正向结论；已知 audio duration 缺陷仍待单独修正及新包验证。
