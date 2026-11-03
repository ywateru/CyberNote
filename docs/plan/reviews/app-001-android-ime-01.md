# Android IME independent finite review — 20c3014

日期：2026-11-03；设备 emulator-5580（Android 11 / WebView Chrome 91）；只操作 Android。

结论：**不通过完整中文组合输入要求。存在实际 P1：候选停留后内联拼音与候选汉字双写且可持久化。** 真 marked composition → 可见候选 → 原生触摸选词的快速轮次通过。实际选择/粗体/Undo/Redo 和冷启动 JSON 保留在本次有限操作上通过。这些通过不能覆盖长停留失败，也不能升级 whole FIX01/AND08、全平台或像素验收。

## 冻结身份与测试工具

- 主应用 source `20c3014` 默认 APK，设备实际 base.apk SHA256 `44b6b16d8b6afdb19f08d1a7eafb733a760deba61870339090e6da598f9082d5`；不重建、不替换、不清数据。
- 官方固定 Trime 3.3.13（versionCode 20261101），实际安装 APK SHA256 `e7535ea421a25962eb2ea37c46ff867838e69d33ba6d935876ab84d108de5020`。使用 app-specific 内部存储、随包内置 `luna_pinyin_simp`，首次部署，没有下载新字典。
- 工具初始 `General → Inline preedit mode = Disable`。这时真实 nihao 候选点选能提交“你好”，但编辑器不接收 marked text，因此不算 marked-composition 通过。随后通过工具真实设置 UI 选 `Composing text`。

## P1：长停留后拼音残留

真实点五个键 nihao 的动作始于 10:28:22.538 UTC，约 2.6 秒结束；候选触摸于 10:29:00.257 UTC，约 35 秒候选停留（按工具动作边界估计，不是精确事件超时）。编辑器实际显示 `ni hao‸`，键盘可见“你好”候选。10:28:33.346 UTC 只读查看时 compositionNode=`ni hao‸`，view.composing=false；DOM/PM 都已包含拼音。10:29:00 实际点选候选后正文成 `ni hao‸你好`，没有替换拼音。候选与失败后的截图及完整 doc 均保留。

这次失败发生在加入被动事件监听器以前；该轮没有 composition 事件全时序、save/hydrate 函数钩子或存储事务证据。不能推断精确阈值，不能归因为某一个保存/重载实现。没有用内部写入、合成 composition 事件、中文直接注入来“验证”。

## 下一轮快速选择的有限通过

给实际 `.tiptap` 元素添加被动 compositionstart/update/end、beforeinput/input 监听，仅记录事件和当时只读状态，不派发事件/写编辑器。原生按键 n/i/h/a/o 后，在 10:29:54.323 UTC 读到 view.composing=true，compositionNode 和 DOM 含本轮 `ni hao‸`，PM anchor/head=21，DOM anchor offset=16；截图有中文候选。本轮 composition 输入约 2.8 秒，随后立刻原生点候选。真实事件包含 insertCompositionText / isComposing=true，以及 compositionend data=`你好`。本轮拼音被正确替换为一份“你好”。最终正文是先前失败残留加两份已提交中文 `ni hao‸你好你好`，没有删除或遮盖上一轮失败。

## 格式、撤销重做、冷启动

真实长按正文得到 PM 非空选区 13..14，对应一个“好”。打开格式面板后选区保留，粗体只加到这一字符；真实顶部 Undo 去掉粗体，Redo 恢复精确文档。点击完成，实际 force-stop；pidof exit 1 / 无进程，再 start 返回 LaunchState COLD。实际从文件夹打开全部备忘录，再点同一标题“你好”的合成行。可见 editor 文档与冷启动前 JSON 完全一致，保留粗体，也保留失败的拼音残留。该结果只证明已生成文档的持久化，不代表失败文本正确。

## 恢复与交接

通过真实设置 UI 将 Trime 内联模式恢复 Disable。将系统 default_input_method、enabled_input_methods、selected_input_method_subtype、show_ime_with_hard_keyboard 四项恢复，逐项与最初记录完全相等；默认 LatinIME，Trime 不再启用。安装工具可以保留。再次核对主应用和 Trime 实际设备端 APK 哈希均匹配。冷启动已销毁本轮被动监听器。

证据：`docs/verification/qa-android-ime/run-20c3014/README.md`、`finite-assertions.json`、`SHA256SUMS.txt`。本轮不修主源码。Mac GUI 仍由 develop_app 使用。后续 FIX02 Android 新版本需重建后的独立回归。
