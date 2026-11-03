# FIX07 candidate02 Android 有限开发实测

2026-11-03，Android 模拟器 emulator-5580，不是实体手机。此次 APK 包含主产品5c46536的新建响应 access 同次采纳修复与已合入的语义文档比较；没有额外产品修改，也未操作 Mac GUI。本报告只覆盖下面实际有限路径，不是手机端、中文输入整体或原版 Notes 像素/交互验收。

## 构建与身份

- 冻结时 HEAD `4d6ae80e7eadaf84452b64046dd119783737dcd4`。90个列明 Android/前端源码、配置与锁输入，包含全部 src、src-tauri/src 文件和新增 document-equality.ts；aggregate `69d6e95156168a3f7eee52b1deacca490f75c3841536ddcc078c4758106310e0`。
- `pnpm android:build --debug` 成功。列明输入及已安装 PM 补丁文件在构建前后、真实测试后均不变。Mac .m/.h 是 Android 不编译的另一任务输入，单列排除，其中 toolbar.m 允许存在 WIP，不声称完整 HEAD 可重现映射或所有平台输入稳定。
- 新包保存 `/private/tmp/notes-fix07-candidate02-5dd6dfc8.apk`，300954834 bytes，SHA-256 `5dd6dfc8d31812c2bafcff5115d9946456ff6d37028f2caed174585c91ca0ca2`。当前设备 base.apk 已读回验证相同，见 installed-apk-identity.json。旧 d5c6f59b 和 e117f929 包均保留，新源码不追认旧失败包。
- 构建日志、源码清单、产物/dist哈希、测试后稳定性分别见 build.log、source-inputs-before.json、build-identity.json、source-inputs-after-tests.json。构建完成即向主任务释放共享 dist，此后只使用保存 APK。

## 实际纸张失败点：有限通过

合成笔记 `FIX07B-1793712769673`，id=`b950be24-4058-4c05-8332-038e607e1927`。所有编辑/选区/纸张动作使用真实 Android 输入与触摸。Runtime 只读完整正文、选择、焦点、键盘、父级 React key，WeakMap只给对象观察编号；无 Debugger断点、伪造输入事件或编辑器命令造正文/选区。

真实新建 → 标题和 Alpha Beta Gamma → 长按选择 Beta → 格式加粗 → X → 系统 Back → 更多/横线与网格 → 取消 → 再打开选择 grid-large → 重开确认选中 → Back → 等待settled。七个纸张边界均保留选区29..33、相同完整加粗正文、Editor/View/DOM=1/2/3、相同内部 EditorContent key 与真正 NoteEditor key（末尾0-0），键盘隐藏；底层编辑区在纸张页冻结，返回恢复可编辑。完整逐态证据见 paper-native/，独立摘要 paper-native/paper-result.json。新fixture标题较旧fixture短，所以选择位置29..33不同于旧33..37；两者都由真实Beta范围得到。

原主纸张脚本在这些检查之后，假设直接长按已保留高亮可以重新进入编辑，但实际 focused=false/IME隐藏，Undo按钮不显示，脚本在查按钮时停止。没有覆盖这份原始记录，也不把该脚本整体记pass。随后在同一笔记实际轻触正文恢复焦点，再长按Beta，未重跑纸张矩阵。

## Undo/Redo：历史保留，单步语义未知

continuation/ 保存显式恢复焦点后的真实长按与第一下 Undo。按钮可用，第一下之后正文仍有bold，历史计数done4/undone1，原脚本“第一次必去掉bold”的断言失败，保留为实际观察。

只再执行一次有界 Undo：Beta准确去掉加粗，完整正文与原加粗前正文相等，选区29..33，history done3/undone2。两次真实 Redo 后完整正文回到原加粗文档，history done5/undone0，Editor/View/DOM始终1/2/3。记录见 undo-diagnosis/{undo-state,second-undo,first-redo,second-redo}.json 与截图/真实动作日志。说明纸张未销毁这份历史，但首个历史事件为何正文无变化仍 **unknown**，不能写成单击Undo行为与原版Notes一致或整个Undo需求通过。没有为此修改产品或继续扩大用例。

## 自身保存、真实外部更新与冷启：有限通过

同一fixture通过原生按键把光标移到行尾，真实输入 ` LOCAL07`。等待后完整Runtime正文与Rust load_workspace中的完整note.document相等，纸张grid-large，Editor/View/DOM及React key未变。真实Home/恢复导致前台同步后正文、光标47..47和相同实例仍保留，IME从可见恢复为隐藏。保存前后具体键盘/焦点状态见 storage-continuation/own-save-native.json 与 own-save-refresh-native.json，不把隐藏键盘称作字段blur。

受控外部更新只针对该合成笔记，使用真实Rust注册保存意图、当前合法access token和当前revision调用workspace_action saveNote，增加独立段落 `EXTERNAL07 real Store update`。这是现有真实Store路径，**不是第二GUI窗口**；没有直接设置renderer文档、伪造hydrate或绕过保存/授权协议。完整请求语义在storage-continuation.mjs，实际原revision/token/保存响应/完整预期文档见 external-store-save.json。

保存响应revision加1、session和note epoch不变；刷新前renderer仍是旧完整正文和原实例1/2/3。随后真实Home/恢复，权威新正文完整进入renderer，Editor/View/DOM变4/5/6，真正NoteEditor key仅externalVersion从0变1（session/epoch部分不变）。这验证真实文档变化仍会生效，没有因保选区屏蔽外部正文。该真实变更后选区回1..1，属于本轮记录，不要求跨外部正文替换保旧选区。

最后强停/启动应用，冷启Runtime完整文档和Rust完整文档均等于包含LOCAL07、bold Beta、EXTERNAL07的预期全文，grid-large仍持久化。冷启新process session使key变化和WeakMap编号重新开始，不误称其跨进程实例相同。结果/完整前后态见 storage-continuation/result.json、external-saved-before-refresh.json、external-refreshed-native.json、cold-restart.json、cold-saved-note.json。三个Runtime连接未记录WebView异常。

## 交接与证据限度

没有更改本轮系统输入法设置；四个原设置逐项读回与FIX06恢复值完全相等，input-settings-check.json的exactMatch=true。Trime此前已通过UI恢复Disable，此轮未进入其设置或切换输入法。调试会话均已停止，无断点残留，当前安装包为5dd6dfc8…，Android交还独立复验。

两个提前停止的原脚本均保留，后续continuation脚本只继续同一fixture；不能把 storage-continuation/result.json 的有限pass外推为前述单步Undo假设也通过。没有重跑长停留IME矩阵、未证明原版Notes纸张视觉一致、实体设备、跨窗口GUI同时编辑或全部授权竞争。主任务仍需独立验证同包的实际选纸/保存路径并分类Undo限度。
