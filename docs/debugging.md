# 开发命令与布局检查

2026-11-05，任务70。此入口用于日常开发，不替代原版像素校准、真实 Rust Store、系统退出、权限和硬件验收。测试策略以 [testing.md](testing.md) 为准。

## 一条命令运行

```sh
pnpm test:debug --out /private/tmp/notes-debug-result
pnpm debug group notes --mobile --out /private/tmp/notes-debug-mobile
pnpm debug list
pnpm debug group recording --out /private/tmp/notes-debug-recording
```

默认在新建临时目录和独立 headless Chrome context 中启动真实 `/src/main.tsx`、App、Tiptap、保存队列、录音 Panel/Session/RecordingPcm 和附件正文确认流程。默认后端明确为 `isolated-js-protocol-fixture`，**没有证明 Rust Store 持久化**。不启动安装应用、不接触现有手机、不调用真实麦克风、不读取用户录音、不编译 Rust 或安装包。桌面 viewport 为1280×800；`--mobile` 为390×844和触摸/Android UA，是浏览器手机布局检查，不是 Android WebView或IME验收。全九组主回归以桌面为基准；手机执行`notes`小组及自定义script/snapshot，桌面专用录音栏和原生退出场景不扩张为手机通过。

需要本机已安装 Chrome 和 playwright-core。默认寻找 `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` 和 `/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/playwright-core/index.mjs`；其他机器用 `CHROME_PATH`、`PLAYWRIGHT_CORE_PATH` 或 `--chrome`、`--playwright` 指定。runner不自动安装依赖。

`--out DIR` 保留紧凑 summary、分组结果及必要失败快照。临时 Vite缓存、fixture文件和浏览器 context 在同一 tmp根，正常完成清理；`--keep`保留该根。未指定输出目录时失败会保留根并打印路径，便于重放。`--transport EXISTING_BINARY` 显式使用事先存在的协议适配器；文件缺失直接失败，不编译、不退回fake，不默认连现有应用数据。

## 单步与连续脚本

```sh
pnpm debug execute editor.insertText '{"text":"Synthetic example"}'
pnpm debug script /absolute/path/steps.json --out /private/tmp/notes-debug-script
pnpm debug snapshot --selector '.app' --out /private/tmp/notes-debug-layout
pnpm debug compare /absolute/baseline.snapshot.json /absolute/current.snapshot.json
pnpm debug compare-shot /absolute/baseline.png /absolute/current.png
pnpm build
pnpm debug check-production --production dist --out /private/tmp/notes-debug-production
```

每次CLI调用是独立工作区。需要连续操作时使用同一JSON脚本，最多100步、64KiB。例如：

```json
[
  {"command":"note.select","args":{"id":"note-a"}},
  {"command":"editor.insertText","args":{"text":" synthetic text"}},
  {"command":"app.flush"},
  {"waitForIdle":{"timeoutMs":1000}},
  {"snapshot":{"selector":".tiptap","maxChars":4000,"maxNodes":40}},
  {"screenshot":"editor.png"}
]
```

文件注入只替换系统文件选择边界，示例 `attachment.submit {"files":[{"name":"synthetic.txt","mime":"text/plain","text":"fixture"}]}`。也支持`base64`，两种内容只选一种。最多8文件，单文件1MB、总1.5MB；不会读取路径。提交复用原`capturePickerTarget → fileSelected → AttachmentSubmission → 保存正文ACK`，保留原目标、授权、版本和书签校验。

脚本平台步骤示例 `{"platform":{"advanceMs":2000,"mediaFail":{"decode":1},"fail":{"store":1},"delay":{"settings":200}}}`。时间推进只改变录音使用的performance时钟并触发已有interval，浏览器渲染、Promise和IPC仍真实调度；不能把时间推进当保存完成。媒体是固定440Hz、24kHz PCM/WAV，真实AudioContext解码、累计编码和产品保存路径不替换。原生IPC、文件对话框、OCR识别、剪贴板和退出事件是显式模拟。

## 浏览器接口与错误

接口协议在 `src/debug/protocol.ts`，实现和catalog在 `src/debug/`。只有`import.meta.env.DEV && VITE_NOTES_DEBUG === "1"` 才动态加载并注册`window.__NOTES_DEBUG__`。生产构建消除该分支；URL参数不能启用接口。App卸载移除注册，已持有的API也拒绝继续执行。手动启用开发服务只应连接独立合成数据：普通原生开发仍沿真实bridge，不会自动替用户隔离其应用数据。

```ts
window.__NOTES_DEBUG__.list();
await window.__NOTES_DEBUG__.execute("editor.insertText", {text:"sample"});
await window.__NOTES_DEBUG__.waitForIdle({timeoutMs:8000});
window.__NOTES_DEBUG__.snapshot({selector:".app",maxChars:16000,maxNodes:160});
```

版本为1。未知命令`UNKNOWN_COMMAND`、无效或未知字段`INVALID_ARGUMENT`、未注册/当前不可用`UNAVAILABLE`、产品原有禁用项`UNSUPPORTED`、保存或应用handler错误`APP_ERROR`、等待超时`TIMEOUT`。命令复用真实handler内部捕获的错误也会被报告；`waitForIdle`检查正在执行的命令、加载/同步/设置请求、实际pending正文、保存失败与录音finalizing/saving/requesting，要求连续三帧稳定，最长30秒。失败不会清掉未保存内容；应按实际错误恢复/重试，再`app.dismissError`清除提示。录音处于recording/paused可idle，表示没有在途保存，不表示会话已经结束。

`list()`的`available`表示当前运行时已注册的入口，动态可操作条件由真实handler校验，不代表当前UI允许任何动作。`mode`区分semantic、DOM和unsupported。DOM原语要求恰好一个可见、可用、非inert控件；fill只支持input/textarea，编辑器文字应走真实事务。`dom.key`只派发键盘事件，不伪造浏览器默认文字输入或可信系统事件。

## 功能入口矩阵

此表列实现入口；自动实测范围由每次`suite.json`逐组checks记录，不能把catalog存在当作全功能通过。

| 功能 | 命令或真实DOM入口 | 边界/限制 |
| --- | --- | --- |
| 导航/返回/所有文件夹/标签 | `folder.select`、`note.select`、`tag.select`、`app.back` | 使用原导航及筛选投影 |
| 创建/保存/置顶/移动/纸张 | `note.create`、`app.flush`、`note.patch` | 真实队列；纸张七种产品枚举 |
| 删除/恢复/彻底删除 | `note.delete`、`note.restore`、`note.purge`→`modal.submit` | purge保留确认步骤 |
| 普通与智能文件夹 | `folder.open/updateDraft/draft/submit/cancel/refresh`、`folder.rename/delete` | 普通改名为真实modal；smart编辑保留definition revision；creationDate规则仍为产品未实现项 |
| 正文/选区/撤销重做 | `editor.insertText/setContent/select/undo/redo` | Tiptap真实事务；setContent经产品schema验证 |
| 格式/标题/列表/颜色/核对清单 | `editor.format`与格式控件DOM | 原nativeHandler/真实editor chain；条目以catalog enum为准 |
| 表格插入/行列/合并拆分/转文本 | `editor.table`、表格菜单DOM | 表格当前位置不满足时明确拒绝 |
| 搜索/笔记内查找/标签提交 | `search.set/find`、标签mark文档及DOM输入 | 搜索建议及实际IME提交用DOM/原生另验 |
| 锁定/解锁/移除锁 | `modal.open`→`dom.fill`→`modal.submit`；更多菜单DOM移除锁 | 仍受原授权/含标签/附件限制；fake不证明Rust加密 |
| 设置/主题/列表与画廊/排序/分组/侧栏 | `settings.update`、`sidebar.toggle`、设置与view菜单DOM | 设置请求在idle内追踪；拖拽宽度仍需实际pointer动作 |
| 菜单/对话框 | `menu.open`、`modal.open/submit/cancel`、`dom.click/fill/key` | 控件真实接线；排序在view菜单，folder须普通/智能文件夹，table须实际表格选区；paper/settings/move为即时控件，不提供假submit |
| 文件/图片/视频/相机 | `attachment.choose/submit/retry/discard`、正文附件DOM | 只模拟File/系统边界，目标/权限/ACK不绕过；实际相机另验 |
| OCR | `ocr.open/select/insert/retry/cancel` | 实际OcrHost，识别器/系统取图显式fake |
| 录音/暂停继续/累计checkpoint/保存/重试/播放/定位 | `recording.open`、`recording.action` | 真实Session/PCM/attachment/body ACK，设备边界合成；动作检查canX和seekable；累计revision替换当前正文单卡，旧committed媒体按原契约保留以支持Undo，不用附件总数判断重复卡 |
| 已保存附件预览/音频控制/菜单 | 正文卡片、预览面板、AudioPlayer真实DOM | 使用同一合成附件，真实硬件与可听性另验 |
| 绘画/橡皮/笔色/完成取消 | `drawing.open`及DrawingPanel SVG pointer/DOM | 现有网页绘画；原生addSketch仍disabled |
| 分享/独立窗口 | `note.share/separate` | 系统剪贴板/分享/原生窗口是fixture边界，不证明多窗OS行为 |
| 归档导入导出 | `archive.import/export` | 原handler与屏障；默认fake文件/后端，完整Rust归档校验另验 |
| 关闭/退出 | `app.close/quit` | 实际App保存barrier，系统事件显式模拟，不宣称OS终止通过 |
| 原有禁用功能 | `native.viewAttachments/takePhoto/scanDocument/addSketch/recentNotes/mathInsert/mathSuggest/mathOff/attachmentsSmall/attachmentsLarge` | `UNSUPPORTED`；不把web相机/绘画误记为全局不可用 |

## 快照与对比

快照含原始HTML、UUID按出现顺序一对一替换的normalizedHTML、文本、每个节点的角色/标签/可见性/rect/必要computed style、editorJSON及viewport。rect四舍五入到0.01px；不删除文字、顺序、样式或布局差异。默认16K字符、160节点，最大100K/1000，超限显式truncated。截图使用PNG；比较同时提供文本/HTML/几何差异或实际RGBA像素差异，正反例场景必须证明差异会被发现。

Apple Notes没有HTML。原版只能通过已保全录屏、原生截图和标注作为参考；此套件不自动宣称原版像素一致。原始移动录屏继续保存在`references/mobile/original/07aca5e6d2ae4aa6e7ea09260c09d118.mp4`。
