# FIX06 有限平台输入对照

日期：2026-11-03。设备为 Android 模拟器 `emulator-5580`，不是实体手机。本轮只做输入平台诊断，没有产品源码修改、构建或重新安装，也未操作 macOS Notes。

## 结果与边界

同一 Trime `luna_pinyin_simp`、Inline preedit mode = **Composing text**，通过真实键盘触摸输入 `n i h a o`，不触摸候选。两个有效对照均保留了输入法传给输入框的 `ni hao‸`：

| 对照 | 真实动作 | 结果 | 限度 |
| --- | --- | --- | --- |
| 同安装包 WebView 中独立普通 contenteditable | 触摸普通按钮，默认焦点转移先于 click handler | compositionend 后 blur；文本仍为 `ni hao‸` | 不经过 PM/Tiptap 编辑器，不证明产品所有边界同因 |
| Android Settings SearchActivity 的原生 EditText | 系统 Back 隐藏键盘 | 文本仍为 `ni hao‸`，字段仍 focused=true | 是键盘隐藏边界，不能写成 EditText blur |

这说明“隐藏键盘或 blur 后出现原始装饰 preedit”可以在普通平台输入框复现，不能仅由该现象认定 PM 组字保护丢失，也不能仅凭 `compositionend.isTrusted=false` 认定应用伪造事件。当前证据不支持为格式入口或隐藏键盘实现应用内 preedit 字符串剥离、猜候选或回滚。后续由主任务根据实际 commit/cancel 保全语义更新契约并独立复核；旧安装包的真实观察继续保留。

本轮不是 Apple Notes 对照，不证明原版 Notes 在这些边界的行为，不构成中文输入整体、手机端交互或像素一致性验收。

## 普通 WebView 对照

诊断源是 `plain-webview-diagnostic.js`：临时 section 直接挂在 document.body，独立 contenteditable 不绑定 React、PM 或 Tiptap；监听真实事件，只读 text/html/焦点/选区。不向产品笔记输入或调用产品保存，不构造输入事件，也没有 Debugger 断点。现有 WebView 实际版本为 Chrome/91.0.4472.114；使用该已安装应用作为相同 WebView 宿主。

真实触摸编辑区后依次按五个键，最后触摸诊断按钮。按钮 click handler 调用 blur 和 NotesKeyboard.hide，但事件时间显示默认焦点转移已先完成，不能把后续 hide 调用称为 compositionend 的直接原因。完整事件见 `plain-webview-after-blur.json`，原始流见 `trace.jsonl`，动作见 `native-actions.jsonl`。

| performance.now (ms) | 事件/快照 | 文本与焦点 |
| --- | --- | --- |
| 877373 | compositionstart，trusted=true | 空文本，focused=true |
| 879551.6 / 879552 | 最后 compositionupdate / input，trusted=true | `ni hao‸`，focused=true |
| 879971.6 | marked 快照 | `ni hao‸`，选区 7..7 |
| 880212.2 | compositionend，data=`ni hao‸`，trusted=false | 文本未变 |
| 880212.5 | blur，trusted=true | focused=false，文本未变 |
| 880212.9 | click handler 的 before 记录 | 已 focused=false |
| 880314.7 | click handler 后 100ms | 文本未变，键盘隐藏后高度回到 751 CSS px |
| 880680.9 | 最终快照 | `ni hao‸`，focused=false |

`plain-webview-before/marked/after-blur.png` 与相应 JSON 对应。临时层已移除，`diagnostic-removal.json` 的 removed=true 可确认 DOM 清理。该文件的 visibleHostNoteDocumentUnchanged 布尔通过 DOM 元素的可选 editor 属性读取前后 JSON；若属性缺失，两个 undefined 也会相等，因此**它不能作为宿主笔记 JSON 或本地存储无变化审计证据**。独立 DOM 结构、真实输入与事件对照仍有其上述有限效力。

## 原生输入框对照

目标 `com.android.settings.intelligence/.search.SearchActivity`，字段 `android.widget.EditText` / `android:id/search_src_text`，不是产品应用或网络搜索页面。

首轮输入后按 Home，再以 reorder flag 启动，启动结果 WARM，输入框重置为 `Search…`。Activity 重建/查询重置使该轮无法归因 commit 或 cancel，**invalid，不计入有效结果**。原始 `native-nihao-marked.png`、`native-marked.xml`、`native-after-window-blur.png`、`native-after.xml` 保留。

第二轮启动结果 HOT，`native-second-before.png/xml` 显示空字段、focused=true、键盘可见。五次真实键触摸后，`native-second-marked.png/xml` 显示候选“你好”、文本 `ni hao‸`、focused=true。系统 Back 后 `native-second-after-back.png/xml` 显示键盘隐藏，字段仍为 `ni hao‸`、focused=true。各 XML 的摘要在同名 summary.json 中。没有选择候选，不将该结果称为取消，也未捕获原生 InputConnection 方法调用栈。

## 恢复与安装身份

已通过 Trime 实际设置界面把 Inline preedit mode 从 Composing text 恢复为原来的 **Disable**，见 `trime-restore-dialog.png`、`trime-restored-disable.png`。四个原系统输入设置逐项恢复并 targeted read 验证，`restoration.json` 的 exactMatch=true，原值见 `original-input-settings.json`。未卸载输入法、清除数据或导出用户资料；诊断会话已经停止，Android 设备交还主任务。

`installed-apk-identity.json` 核对设备 base.apk SHA-256 仍为 `d5c6f59b79031d1e103f418450e6cbd9d7fa8e8fc085263fab3d23d6b3e04d21`，与本轮开始时 FIX04 candidate01 相同。当前工作区可能已有其他任务源码更新，不能把这份安装包归属到当前 HEAD 或 FIX07。

本轮只提交此目录的诊断与证据；不更改产品、PM 补丁、契约或原失败记录。
