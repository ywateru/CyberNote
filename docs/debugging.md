# 开发命令与布局检查

2026-11-06，任务70/71/73/75/77/78/79/80/81。此入口用于日常开发，不替代原版像素校准、真实 Rust Store、系统退出、权限和硬件验收。测试策略以 [testing.md](testing.md) 为准。

[77历史整合](verification/mac-feedback77/integration/README.md)为桌面十组148项、手机笔记9/录音43/附件43，构建/生产排除通过。`pnpm debug group mac-feedback --out FRESH_DIR`单独运行该批47项真实事件/HTML/字符Range/位置回归；完整组另含45项contract，真实deadline允许首次transport尚未返回时没有lastState，不伪造状态。

78新增`recording-indicator`组49项，并入桌面全组197项；真实按钮、状态和故障恢复说明见本文末“桌面录音状态与真实完成按钮78”。[独立48项检查及静态布局对照](verification/recording-indicator78-independent/README.md)通过，主线整合和准确包身份单独记录。

79新增`data-management`组33项，已并入桌面全组230项；手机attachments组合75项含该批业务检查。完整主线六项自然通过及真实Rust验证见[交付](verification/data-management79/README.md)。正常附件用逐帧轨迹验证，无数据变更时不因trusted校验遮住整窗；陌生authority/强同步仍保护。

80/81新增 `image-preview` 和 `storage-overview` 组，纳入桌面全组及手机 attachments 组合。图片保存入口以预览内部为准；数据管理默认总览，通过 `data.navigate {"view":"image"}` 进入类型详情，`{"view":"overview"}` 返回，枚举还含 all/audio/video/attachments/database/logs/other。旧 `data.filter` 保留并自动进入对应详情。独立 AppKit 与浏览器结果分别记录于本轮交付，不将原生 fixture 当作完整实包运行。

[73历史验收](verification/mobile-recording-primary73/integration/README.md)该批为桌面100/手机录音43/手机笔记9项。手机新增600ms延迟读取后，等待同一卡片真实blob音源/metadata就绪再单次展开和后段回放，避免源更新重挂载丢失控件。程序化视觉对照可运行`node scripts/check-mobile-recording-primary73.mjs /private/tmp/notes-primary73`，它固定baseline3534acaf、真实共享View和同尺寸投影，仅适合该控件校准；输入变化必须显式审查基线。脚本限定真实依赖扫描，生产API规则不变。报告耗时须包括最终清理至进程退出，不能只引用CLI summary计时。

## 一条命令运行

```sh
pnpm test:debug --out /private/tmp/notes-debug-result
pnpm debug group notes --mobile --out /private/tmp/notes-debug-mobile
pnpm debug list
pnpm debug group recording --out /private/tmp/notes-debug-recording
pnpm debug group recording-indicator --out /private/tmp/notes-debug-recording-indicator
pnpm debug group recording --mobile --out /private/tmp/notes-debug-mobile-recording
pnpm debug group data-management --out /private/tmp/notes-debug-data
pnpm debug group data-management --mobile --out /private/tmp/notes-debug-mobile-data
pnpm debug group image-preview --out /private/tmp/notes-debug-image-preview
pnpm debug group storage-overview --out /private/tmp/notes-debug-storage-overview
```

默认在新建临时目录和独立 headless Chrome context 中启动真实 `/src/main.tsx`、App、Tiptap、保存队列、录音 Panel/Session/RecordingPcm 和附件正文确认流程。默认后端明确为 `isolated-js-protocol-fixture`，**没有证明 Rust Store 持久化**。不启动安装应用、不接触现有手机、不调用真实麦克风、不读取用户录音、不编译 Rust 或安装包。桌面 viewport 为1280×800；`--mobile` 为390×844和触摸/Android UA，是浏览器手机布局检查，不是 Android WebView或IME验收。桌面全组主回归（原九组、`mac-feedback`及`recording-indicator`）以桌面为基准；手机执行`notes`、独立`recording`与`attachments`小组及自定义script/snapshot，桌面专用录音栏和原生退出场景不扩张为手机通过。

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

脚本平台步骤示例 `{"platform":{"advanceMs":2000,"mediaFail":{"decode":1},"fail":{"store":1},"delay":{"settings":200}}}`。时间推进只改变录音使用的performance时钟并触发已有interval，浏览器渲染、Promise和IPC仍真实调度；不能把时间推进当保存完成。媒体是固定440Hz、24kHz PCM/WAV。合成MediaRecorder仅首块带未知长度RIFF/data头，之后每个requestData/stop只提供增量PCM，避免拼接多份完整WAV导致最终回放只解首段。真实AudioContext解码、桌面累计编码及手机Session最终File/产品保存路径不替换；手机多次暂停不写桌面checkpoint。可用`mediaFail.play`让真实HTMLMediaElement.play边界拒绝。原生IPC、文件对话框、OCR识别、剪贴板和退出事件是显式模拟。

## 浏览器接口与错误

接口协议在 `src/debug/protocol.ts`，实现和catalog在 `src/debug/`。只有`import.meta.env.DEV && VITE_NOTES_DEBUG === "1"` 才动态加载并注册`window.__NOTES_DEBUG__`。生产构建消除该分支；URL参数不能启用接口。App卸载移除注册，已持有的API也拒绝继续执行。手动启用开发服务只应连接独立合成数据：普通原生开发仍沿真实bridge，不会自动替用户隔离其应用数据。

```ts
window.__NOTES_DEBUG__.list();
await window.__NOTES_DEBUG__.execute("editor.insertText", {text:"sample"});
await window.__NOTES_DEBUG__.waitForIdle({timeoutMs:8000});
window.__NOTES_DEBUG__.snapshot({selector:".app",maxChars:16000,maxNodes:160});
```

版本为1。未知命令`UNKNOWN_COMMAND`、无效或未知字段`INVALID_ARGUMENT`、未注册/当前不可用`UNAVAILABLE`、产品原有禁用项`UNSUPPORTED`、保存或应用handler错误`APP_ERROR`、等待超时`TIMEOUT`。命令复用真实handler内部捕获的错误也会被报告；`waitForIdle`检查正在执行的命令、加载/同步/设置请求、实际pending正文、保存失败与录音finalizing/saving/requesting，要求连续三帧稳定，最长30秒。失败不会清掉未保存内容；应使用真实重试操作恢复并核对保存ACK，不能用`app.dismissError`冒充恢复。CLI的execute和显式waitForIdle均以JSON字符串传输并保留原API错误code/未知own字段；own __proto__也交原API严格拒绝。idle先等待真实在途retry/保存工作，再判断残留failed/error，未重试的失败仍立即APP_ERROR。录音state轮询使用runner的`waitForState`真正await条件，全局真实deadline覆盖state读取和predicate等待，迟到true或永不settle均TIMEOUT；不把async函数传给本机Playwright的同步truthiness轮询。录音处于recording/paused可idle，表示没有在途保存，不表示会话已经结束。

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
| 数据管理/真实磁盘统计/筛选分页 | `data.open/refresh/filter/navigate` | 实际管理页handler；默认fixture统计不是磁盘证据，真实Rust独审单列 |
| 图片保存/原图预览/附件导出 | `image.save/preview`、`data.exportAttachment`、图片卡和预览DOM | 同一原owner导出链；系统文件选择器与provider运行另验 |
| 关闭/退出 | `app.close/quit` | 实际App保存barrier，系统事件显式模拟，不宣称OS终止通过 |
| 原有禁用功能 | `native.viewAttachments/takePhoto/scanDocument/addSketch/recentNotes/mathInsert/mathSuggest/mathOff/attachmentsSmall/attachmentsLarge` | `UNSUPPORTED`；不把web相机/绘画误记为全局不可用 |

## 快照与对比

快照含原始HTML、UUID按出现顺序一对一替换的normalizedHTML、文本、每个节点的角色/标签/可见性/rect/必要computed style、editorJSON及viewport。rect四舍五入到0.01px；不删除文字、顺序、样式或布局差异。默认16K字符、160节点，最大100K/1000，超限显式truncated。截图使用PNG；比较同时提供文本/HTML/几何差异或实际RGBA像素差异，正反例场景必须证明差异会被发现。

Apple Notes没有HTML。原版只能通过已保全录屏、原生截图和标注作为参考；此套件不自动宣称原版像素一致。原始移动录屏继续保存在`references/mobile/original/07aca5e6d2ae4aa6e7ea09260c09d118.mp4`。


## 手机录音专用组（71）

`pnpm debug group recording --mobile --out DIR`运行真实手机面板，覆盖初始禁用态、空会话关闭、录制/暂停继续、暂停期间不计时且不存checkpoint、实际预览播放暂停/seek/skip、预览失败与重试、存储累计音频字节解码和后段播放、正文ACK、重开已保存卡、采集中关闭、设备拒绝、延迟附件与正文失败及真实重试去重。每次保留初始、录制、暂停、失败和保存后HTML/rect/computed style及PNG。桌面九组保持独立，空会话关闭也按真实关闭按钮可用性测试。

手机`finish`仅在paused/retry可用，采集中完成返回UNAVAILABLE；`close`在空会话可取消，在采集中按真实关闭流程保存，saving/finalizing/submitted关闭禁用。桌面侧栏关闭沿其真实handle处理，不以canFinish错误限制空会话取消。手机采集中仍为原模态呈现，不把桌面A录音/B编辑规则搬进手机。

[开发证据](verification/mobile-debug-recording71/development/README.md)保留失败历史与准确源码指纹。浏览器390×844只证明合成设备/JS协议fixture上的真实前端路径，不证明Android WebView、系统权限、硬件音质或原版像素一致。

2026-11-06任务71已通过[独立最终复审](plan/reviews/app-mobile-debug-recording71-recheck.md)及[主工作区整合](verification/mobile-debug-recording71/integration/README.md)：桌面100项、手机录音42项、手机笔记9项，构建和生产入口排除通过。初审失败保留于历史证据。日常使用以上命令；catalog可用性与各次实际覆盖分别读取，不能据此授予原生设备或原版像素通过。


## 手机附件与真实 Rust（75）

```sh
pnpm debug group attachments --mobile --out /private/tmp/notes-attachments-result
node scripts/debug/check-rust-backend.mjs
CARGO_TARGET_DIR=/absolute/exclusively-assigned-cache node scripts/debug/build-rust-attachments.mjs /private/tmp/notes-current-rust-build
node scripts/debug/check-mobile-attachments-rust.mjs /private/tmp/notes-current-rust-build /private/tmp/notes-current-rust-result
```

以上输出目录必须不存在。Rust构建是单独显式opt-in：复制当前完整`store.rs/store/**/session.rs/session/**`到fresh harness，复用已存在的小Cargo.lock，`cargo build --locked --offline`，不安装依赖或构建Mac/APK。build.json记录全部递归源码、wrapper、manifest/lock、registry实际文件汇总hash、依赖图与二进制SHA；runner检查这些身份，不接受已改变的wrapper/源码或旧binary，不fallback Fake。Cargo缓存由任务执行者独占分配且不删除。

手机附件组通过真实菜单或`attachment.choose`保留原picker目标，再以Playwright FileChooser或FileList边界输入合成File；实际hidden input change、FileReader、AttachmentSubmission、保存队列和正文ACK全部保留。`attachment.submit`在调用时重建target，适合直接边界注入，但不能证明系统选择器往返。新增组包括空笔记多选、连续选择、显式旧卡替换和Undo/Redo，单图/PDF/普通文件、同名重选、取消后重选、blur/visible/focus、延迟/abort/error、正文失败重试、丢响应query、ACK后refresh-only、多文件第二项失败、晚到取消、原目标改变、媒体stale有界重读与撤权、390/320浅深色长文件卡HTML/几何/PNG。默认桌面九组100项保持原范围，新增手机附件计数单列。

真实Rust runner使用fresh合成目录，手机PNG和普通文件走`Session.register_save/Session.save`与Session附件方法；read先由Store查owner再`sensitive/tagged`。核实际文件字节/正文引用及同目录新PID/新Session恢复，旧op不能被新Session接管、旧token不能读。lock/delete/import屏障返回明确unsupported，不空ACK。外部transport严格拒绝启动/JSON/未知或重复ID/超长/EOF/超时异常，close等待owned child真实退出才允许删除或重开目录；故障不切换后端。

此边界仍不是Android系统chooser/URI/WebView/IME或原用户设备故障验收，也不证明Apple Notes PDF预览像素一致。原Android及其未保存录音保持现场。准确失败历史与源码/运行身份见[75证据](verification/android-attachments75/README.md)。

## Mac截图修正77命令回归

`pnpm debug group mac-feedback --out /private/tmp/notes-mac-feedback` 使用实际列表右键事件、真实App handler与HTML/rect/PNG检验底部入口、上下文菜单和全局搜索高亮，也并入 `pnpm test:debug`。普通中部、滚动、画廊使用浏览器鼠标右键；极端右下坐标使用明确构造的MouseEvent走同一React事件handler，记录为合成边界坐标；不是系统可信点击。检查菜单实际尺寸约束、打开期间窗口缩小、不同target置顶、工具栏/命令/键盘fallback、搜索重复/大小写/中文/字面量标点/HTML文本/Unicode扩长/清空/远处正文上下文/锁定及独立正文查找。

参考橙黄色由用户原版PNG的Display ICC转换至sRGB后取局部主体色 `#fcb828`；截图缩放、字体、系统色彩管理与整体原生像素仍须单独比较，不由这个浏览器组宣称通过。手机入口/高亮保持现有行为，手机notes、recording和attachments仍单独回归。

修正77独审后的摘要回归另测Range逐字位置：命中前后无额外flex gap；实际copy宽不足时缩短首命中前缀，220→280→220恢复/裁短上下文，保留ellipsis与重复匹配。`contract-deadlines.json`区分真实App的异步false轮询/已观察lastState，与受控200ms首transport在50ms截止前尚无lastState；后者正确TIMEOUT，不制造占位state。late true/never谓词用立即可达的受控state保证确实调用谓词，原实时deadline算法不变。


## 桌面录音状态与真实完成按钮78

`pnpm debug group recording-indicator --out /private/tmp/notes-recording-indicator` 使用真实侧栏录制、暂停、继续、✓与×的DOM按钮，检查原始owner列表“录音中”红点、仅当前live卡动效、220px长标题/高亮/画廊与reduced-motion。并入桌面全组；手机仍保留原✓策略并单独回归。Synthetic 440Hz输入保留真实RecordingPcm累计、附件/正文ACK及浏览器独立WAV解码；不接触现有手机录音、不证明原生Rust/硬件。

界面按钮必须用实际DOM点击验证：语义`recording.action finish`会绕过界面disabled属性，不能单独证明按钮可用。桌面✓遵循controller的`canFinish`；手机维持仅paused/retry完成。列表和实时卡的录音指示只随真实phase=recording运动，减少动态效果时静止；状态装饰不写正文或Undo历史。

Runner在测试浏览器中从React fiber保留真实`onState` callback，模拟完成后与新B会话时旧A回调晚到，验证不会复活或覆盖活动owner；产品没有新增调试后门。正文双次保存失败沿用已有两步恢复：先点实际全局错误栏“重试”提交pending正文，再点实际侧栏✓结束session；只点侧栏✓虽可结束但原全局错误栏状态未清，此既有错误展示行为仍在范围外。原始失败记录保留于[78证据](verification/recording-indicator78/README.md)。
