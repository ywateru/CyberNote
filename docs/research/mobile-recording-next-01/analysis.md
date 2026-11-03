# 移动录音下一步：局部状态与父保存边界

2026-11-04。只读主源码 `fabafcf9723e400c67fd842f870dad9d4ae79d19` 与已保全录屏证据；未操作 GUI、设备、麦克风、target 或构建，未修改产品或主 Git。本文是下一最小任务的输入，不是 candidate02 或任何安装包的验收。

**可以把录音面板状态修复与附件提交接线拆开，但必须先建立真实组件接缝。** 当前 `RecordingPanel` 内嵌于 App，直接同时修改会与 attachment-submit 重叠。先由一个明确 owner 纯抽取、独立复核并合入；随后局部任务只改独立组件、采集/计时 helper 和录音 CSS，保留现有 props。父保存再复用已审附件提交边界，单独验收正文 ACK；不能把面板完成动作或 Promise resolve 当作当前保存已成功。

## 1. 新补证能支持什么

依据 [原录屏逐帧报告](../mobile-recording-sequence-01/README.md)，无需再次宽泛取帧：

| 原视频实际时间 | 已观察事实 | 不能推导 |
| --- | --- | --- |
| 26.767–27.933 秒 | 稳定 00:00.00、红圆、灰完成；没有红暂停胶囊 | 录制开始的实际触点、单/双击规则、底层是否已请求/准备麦克风 |
| 27.967–28.067 秒及后续 | 红圆变为暂停胶囊，随后非零计时递增；录制中完成灰色 | 按钮的物理输入来源、有效音轨、真实编码起始时刻 |
| 30.767–34.900 秒 | 暂停固定 00:02.60；红“继续”、金完成、黑播放/±15；可切转写空态 | 本段未实际继续，未观察回放推进、±15 或 seek；转写空态不是已实现转写的证据 |
| 35.100–35.500 秒 | 从该暂停界面直接下收，正文出现“新录音 / 音频·2秒 / 播放”卡 | 内部 stop、最后编码数据、正文持久 ACK、冷启、音轨可听性 |

因此，初始红圆与暂停直接完成已经有 UI 依据，不能再全部记为 unknown。物理触发仍 unknown；若选择点击红圆后才调用实际 start，这是可理解的实现选择，须在任务中明示，不能写成录屏已证明某次 tap。面板 2.60 与卡片 2秒只是可见格式，不能用于硬编码媒体时长或决定舍入算法。

原视频仍为 8,452,211B，SHA-256 `2bed50027479becf059cc32b68c361107a0c3f840f027f79933a4b99bc4e394d`。本次只核该字节身份，未转码/另存。224×480 有损参考不足以单独验收原生尺寸/DPR、字形、颜色和动画像素。

## 2. fabafcf 的实际状态差距

| 主源码位置 | 当前行为 | 最小差距/应保留内容 |
| --- | --- | --- |
| `src/App.tsx:3933–3968` | 初始 status=starting；挂载 effect 创建 RecordingSession 后立即 `capture.start()`。onRecording 直接切 recording。 | 没有稳定可操作的初始红圆状态。局部修复可将 start 从 mount 移到显式开始动作；不据此声称原版物理手势已知。 |
| `src/recording-session.ts:131–173` | start 一次请求真实 audio-only stream，选择实际支持 MIME，`recorder.start(250)`；之后建立真实 analyser。 | 应继续复用该真实链，不引入假录音或新原生替代。既有清理/晚权限门禁已合入，不能沿用旧审计说“失败没有统一清理”。 |
| `src/App.tsx:3976–3981` | recording 时每 100ms 将 seconds 加 0.1；暂停停止这个 interval。 | 区分了暂停，但依赖计时器回调次数且显示两位小数，可能调度漂移；不是实际媒体时长。最小修复为单调时钟累计实际活动区间，interval 仅重绘；不能用它给保存音频填假 duration。 |
| `src/App.tsx:4050–4079` | 两个独立按钮：暂停/Play 图标继续、StopCircle 结束。 | 初始红圆/单一红暂停/暂停红“继续”状态未接入。当前要求用户额外结束，和暂停直接完成的可见序列不同。 |
| `src/App.tsx:4009–4024` | 完成仅 `blob && !busy` 可用；File 扩展名按 MIME 包含 mp4 与否选择。 | paused 没有 blob，不能直接完成；不应直接拿尚未收尾 chunks 保存。应由 paused 完成触发 stop，等待最终回调后继续一次提交。 |
| `src/recording-session.ts:151–170,222–239` | 正常 stop 保留最终 dataavailable/onstop，立即释放采集资源，onstop 拼最终 Blob；dispose 先关闭活性，丢弃并释放。 | 这条安全收尾要保留。当前仍会发布零大小 Blob；最终非空/实际 MIME 校验是面板完成边界的必要失败条件，非空本身不证明有效/可听音轨。 |
| `src/App.tsx:3970–3975,4080` | 仅取得最终 Blob 后创建有生命周期的预览 URL，显示浏览器原生 audio controls。 | 暂停中的黑播放/±15及转写页没有真实接线。首个状态任务不应填无功能按钮或假转写；完整暂停预览/转写/像素另列缺口。 |
| `src/App.tsx:3990–3998,1158` | busy 时取消仍可点；Android Back 仍直接卸载录音。 | 局部组件能禁止重复 Done、保留失败 Blob、清理自身晚回调；不能取消已进入父 onDone 的存储操作，父必须拥有相同会话活性。 |

已合入的 `RecordingSession.releaseCapture/dispose/fail` 与 preview URL 清理仍为真实实现。旧 [资源清理独立报告](../../plan/reviews/app-002-recording-cleanup-static-01.md) 的有限结论保留；本文不重复运行其 26 项环境替身检查，也不将那些检查变成设备证明。旧受控录音采用“显式结束→完成”，不能改写为暂停直接完成通过。

## 3. 当前父保存的真实调用链

```text
普通菜单 App:1750                 Mac native App:2268
captureSearchAttachmentTarget()   nativeSelection(context)
  desktopSearch 才捕获目标         固定 context → nativeAttachmentTarget
  手机/普通桌面为 null
                ↓ setRecord(true)
内嵌 RecordingPanel → 自动 start → pause / 显式 stop
                ↓ onStopped(blob) → 完成 → onDone(File)
App:3433 → 可选 nativeAssert → bridge.storeAttachment
                ↓ 旧 invoke(store_attachment)；不是 operation 命令
Rust sensitive → Store.store_attachment → tagged attachment
                ↓ bridge.accept(stamp)；写入已可能发生
App:3443 可选重验/恢复书签 → 清 target → insertContent(...).run()
                ↓ 未检查 boolean；未等待本次正文 ACK
setRecord(false) → refresh() → flush() → loadWorkspace/hydrate
                ↓
Editor onChange → saveDoc → registerSaveIntent → 按 note 队列 saveNote
             → Rust ACK → revisions.confirmed / 清 pendingDocs
```

关键责任与当前静态风险（均非本次设备复现）：

- **目标不是所有入口固定。** `App.tsx:1564` 只在 desktopSearch 保存 NativeContext，普通移动菜单是 null；原生入口 `:2268` 有捕获。父 `:3434` 缺 current/editor 直接 resolve，`:3439` 使用 `target?.noteId || current.id`，组件没有固定原 note/Editor/文档书签/operationId。`nativeAssert :2116` 对已有 context 有严格 scope、access stamp、Editor owner/版本检查，应复用语义；不要把全局 stamp 放宽或 null 当作已失效目标的降级。
- **文件成功不等于响应成功。** `bridge.ts:284–308` 先读文件，native 只调旧 store_attachment，await 后 accept 可能拒绝；`lib.rs:178` 仍能已经写入受管文件和 metadata。父无操作 ID 可核查该副作用。录音入口未调用已合入的三个 operation 命令。
- **父没有传回真实失败。** `App.tsx:3433–3463` catch 只调用全局 fail，吞掉 rejection。面板自己的 catch 因此不能辨别父保存失败。若 store 成功而后重验失败，面板可能仍保留 blob，下一次 Done 又新建附件；若 `.run()` 返回 false，仍会关面板。缺目标直接 return 同样不是明确失败。
- **关闭早于正文确认。** `setRecord(false)` 在 `await refresh()` 前。refresh 虽会等待 flush（`:594–604`），但面板/Blob 已卸载。`saveDoc :626–690` 的队列会捕获并保留失败，flush 才通过 pendingDocs/saveFailures 抛错；既有权威 ACK 路径存在，缺的是父保存使用它来决定本次录音成功。
- **取消尚不能撤销父异步提交。** 组件 dispose 只管采集；onDone 已 await store 后，关闭面板并不使父 closure 的 target/Editor 失效。仅按取消清 ref、不改变 captured context 时，已有 nativeAssert 也不表示这次录音还活着。需要父会话票据/明确阶段，跨每个 await 复核；不能由局部 `live=false` 假称已取消 Rust 写入。

## 4. 可复用的 operation/ACK 边界及串行接入

主 Rust 已有 `store_attachment_operation / query_attachment_operation / cancel_attachment_operation`（`lib.rs:211,249,265`，注册 `:433–435`）；Session 实际窗口 incarnation/授权/SaveIntents 在 `session.rs:145–195`。参数为 **operationId**，成功状态 `notPersisted | stored | committed | aborted | deferred`，并带现有 access；不是旧 storeAttachment 自动获得这些语义。主 bridge 当前尚无上述三个 wrapper。准确契约以 [Store 源码报告](../../verification/app-002-attachment-store/source-candidate-01.md) 为准，不另造第二协议。

attachment-submit 当前负责普通/原生文件入口的固定目标、可信 focus 同步、generation 单独变化时的窄重绑定、写入后查询、插入返回值、正文 ACK、刷新及取消。录音父保存应在该候选独立审查/合入后复用同一个边界，不在录音局部状态任务另写一套桥接、生成/放宽 stamp 或补偿代码。

录音父接线需要按以下阶段表达真实结果：

```text
打开时固定 capture ticket / 原目标 / Editor / 书签 / 后端身份
    → 最终 File 就绪（同一录音重试保留它）
    → 首次 store IPC 前固定同一 operationId
    → stored（响应失效时先 query 核真实结果）
    → inserted（检查实际 .run；只插一次）
    → documentAck（本次真实保存确认；失败保留本地节点/Blob/op）
    → refreshed（ACK后失败只重试刷新，不再 store/插入）
```

取消只清本操作安全新文件，且只调用已授权 Rust cancel。若本地 pendingDocs 仍引用附件而 ACK 失败，Rust看不到尚未登记的 renderer pending，不能因数据库暂未引用就 cancel；保留身份继续保存，或先确定性回滚并排空队列再取消。committed 永不当作新建未引用文件删除；deferred/权限不确定显式保留。此处也是 attachment-submit 的同一责任，不新增“客户端自报安全”开关。

## 5. 建议的三个最小交付边界

root 已确认先纯抽取、独立审查，再局部状态；本文不实施抽取。

### A. 纯抽取接缝（先串行，行为不变）

由唯一 App owner 在独立分支移动 `App.tsx:3933` 到 **`src/RecordingPanel.tsx`**，以默认 export 维持同名组件；App 只删除原定义、增加 import，移除只被该组件使用的 RecordingSession/createRecordingPreview、Pause/Play/StopCircle imports，保留其他 import。局部 `errText` 可随组件复制为私有函数或使用现有通用 helper，不改其错误文案/语义。保留：

```ts
type RecordingPanelProps = {
  onCancel: () => void;
  onDone: (file: File) => Promise<void>;
};
```

组件不接 noteId、access、Editor、store 或正文保存。既有 CSS 不移动/改写；父 JSX props/保存回调保持字节不变。抽取后真实 App 必须 import 新组件；单独新增未接线组件不能算交付。最小检查为 typecheck、原组件主体/父回调/样式字节对照和一次真实 React mount/unmount/props 接线检查，不需要设备、打包或重新跑全存储矩阵。

### B. 局部录音状态（A 合入后，可与 App/bridge 实施分离）

只允许新 `src/RecordingPanel.tsx`、必要的 `src/recording-session.ts` / 单调计时 helper、录音专用 CSS 段、对应定向检查；**不改 App、bridge、Rust/store、依赖、通用 audio-card 或绘画 CSS**。继续上述 props。

```text
idle 00:00.00 / 红圆 / 完成disabled
  → requesting（显式开始动作；物理原版触发仍unknown）
  → recording / 红暂停 / 完成disabled
  ↔ paused / 红继续 / 完成enabled
  → finalizing（真实stop，等待最终data/onstop；禁止重复提交）
  → saving（调用既有onDone一次）
  → Promise reject：保留最终File + 可见错误 + 同一File重试
  → Promise resolve：局部只能记录父已resolve，是否ACK由父负责
```

单调时钟累计 recording 活动区间，暂停冻结、继续接续，重绘 tick 不累计“真时长”；stop/error/dispose 关闭活性并复用既有真实释放链。空结果、最终事件失败必须明确失败，不能提交假卡片。paused Done 不需要额外用户 stop 页，但内部必须真实 stop；删除/替换原显式结束 UI 只能在这个局部任务进行。保存时组件可禁重复按钮并处理自身卸载晚回调，不能对父已发 IPC 声称取消成功。

首个 B 仅修已证初始/录制/暂停完成/继续和时钟。原版暂停回放、±15、时间轴、转写入口及材料/动画的完整一致仍需后续真实能力与参考；不为凑图放可点击却无效的控制。Mac共用采集生命周期必须保持，Mac录音面板原版几何未获本段视频证明。

最小验证穿过**实际新组件 + production RecordingSession**：idle 不开始采集；一次明确开始；pause/continue；暂停 Done→最终末块→恰好一次父调用；暂停期间单调累计不增长、重绘延迟不失真；reject 保留 File/重试不重录；零 Blob 拒绝；取消/卸载/晚权限/晚 onstop/重复 Done；既有释放检查只对受影响边界回归。受控媒体环境用于失败/时钟注入应披露，不能冒充设备录音或正文 ACK。独立审查通过后再在明确新包上有限原生操作/资源验证，保持保存验收另账。

### C. 录音父保存接入（attachment-submit 合入后串行）

仅在同一附件提交 helper 已真实接线且接口冻结后，由 App/bridge owner 接录音 capture ticket、同一 op、插入/ACK/刷新分账、失败 reject 与取消晚结果；不重写 B 的计时/控件/采集。onDone props 可以保持 Promise<void>：**resolve 约定为真实正文 ACK 已确认；reject 保留可重试录音**，刷新失败单独表达或保留已成功身份，不能返回“失败”促使重新插入。

该约定在 fabafcf 还没有成立，B 的组件测试只能验证 Promise 处理，不能给当前父实现背书。若父需要展示 ACK 后刷新告警，可内部/现有全局反馈表达，不为了传技术阶段给面板新增存储细节 UI。真实相同目标/失效目标、响应丢失、插入false/throw、ACK失败重试、ACK后刷新失败、取消/Back的文件/metadata/全文/revision/冷启结果由 C 验收。一个可信新包的有限实测仍不覆盖原版像素、可听音轨和未测平台。

## 6. 本次输入身份与交接

关键只读输入 SHA-256：

| 输入 | SHA-256 |
| --- | --- |
| `src/App.tsx` | `fec03860e81af5745b7c2f2eefa1f5544d5abec0302918d56dc2fdb13392df2c` |
| `src/recording-session.ts` | `38a83851b3ee0234e7662f32cf9fed8e7019492b42e7c32bfd74af707eae11c0` |
| `src/bridge.ts` | `4a5c33170e9cce8eac9000b1f5b169ed332a6def7da80fa33258c48bdb8b240f` |
| `src/style.css` | `1621f32bbe01ae18726f899f639df8bfaa856a8f3c7a517436e78811af9bca19` |
| 逐帧 `mobile-recording-sequence-01/README.md` | `2e009f274d9b7c9b441cabae8b17c0fbf665cd80bd9e6b68ad0963b4edc2250d` |

本次未读取/修改尚未冻结的 attachment-submit 工作区实现，不推测其新 helper 名称或最终接口；这里只依据主 Rust 实际契约与父任务约定。candidate02 构建/设备由 develop、独立实际由 verify 负责，本文不升级其进度。下一项建议先建 A 的纯抽取任务；A 独立通过后，B 与 App/bridge owner 可按上述文件边界分别开展，最终在 C 汇合。

## 7. 暂停时真实回放／±15 的最小接缝准备

2026-11-04 补充。只读主 `ab728ad487c0c9b397fca3f67e57460bbe520e22` 的 `RecordingSession`、`RecordingPanel`、`AudioPlayer`／`audio-playback.ts` 及上述既存录屏报告；未读录音父接线 WIP，未新增取帧、GUI、麦克风、设备、构建或产品改动。第 1–6 节保留各自历史基线；本节不重写已合入的三态规格。

**`pause()`＋`requestData()`＋累计 Blob 只能作为待验证的暂停快照，不能保证它是完整可播放、可定位的文件。** [W3C 2026-03-16 工作草案 §2.3](https://www.w3.org/TR/2026/WD-mediastream-recording-20260316/#dom-mediarecorder-pause) 的 pause 保留当前收集数据以便继续；requestData 发布当前数据并换新 Blob，不是结束编码。草案明确只对“完成录制后的全部 Blob 组合”给出可播放保证，单块没有保证；因而“从起点累计到暂停的非终态前缀也必定可播放”不是该契约的推论。`size>0`、支持 MIME、收到 dataavailable 和有限 UI 活动计时都不足以解除这个边界。

浏览器原始材料支持同样的谨慎结论，但不等于本机版本运行证据：

| 目标 | 已核原始材料 | 对这条接缝的含义 |
| --- | --- | --- |
| WKWebView／MP4 | [WebKit 2020-11-23 官方说明](https://webkit.org/blog/11353/mediarecorder-api/) 当时列出 MP4／AAC；示例虽持续收小块，实际在 `onstop` 才组合并 preview。 | 此示例不能作为暂停前缀可播的承诺，也不能断言当前 WK 仍只支持这些格式。实际 OS／WebKit build 的首个极短暂停、后续暂停及前缀尾部完整性仍未知。 |
| Chromium／WebView 91 的 WebM 路线 | [91.0.4472.77 MediaRecorder 源码](https://raw.githubusercontent.com/chromium/chromium/91.0.4472.77/third_party/blink/renderer/modules/mediarecorder/media_recorder.cc) 中 `requestData` 只使当前 Blob 切片；没有调用 muxer flush。[同版本 WebmMuxer](https://raw.githubusercontent.com/chromium/chromium/91.0.4472.77/media/muxers/webm_muxer.cc) 使用 live 模式、关闭 cues，`Pause` 只记暂停时间，`Seekable()` 为 false。 | requestData 不能强制把编码／muxer 队列全部变成一个独立完整文件。源码中的 writer 不可回写不等于 HTML 元素永远不能 seek；也不能把“有前缀可播放”升级为任意位置 seek 或尾部完整。所查标签未与目标设备每个 patch／vendor build 等同。 |

最小候选仍应先复用现有采集与播放链，而不是暂停时调用当前 `stop()`：主 `RecordingSession.stop()` 会释放 tracks、AudioContext 并终止该实例，无法再以其 `resume()` 继续。可另做一个独立的、可失败的 `snapshot()` 接缝：

1. 每次暂停生成独立代次，等待实际 pause 事件后请求数据；串行接收已排队的 timeslice／requestData 数据并复制截至该次的累计 chunks，使用 recorder 实际 MIME 建快照。**不清空主 chunks，不把快照送给 onStopped／父 onDone，不覆盖最终 File。** snapshot 的响应只表示收到这一前缀；尤其在 91 中仍不表示 encoder 已排空。继续／完成／取消即使先到，也必须让过期快照被忽略。
2. 面板为本代次快照创建一个 `createRecordingPreview` URL；使用已有 `createAudioPlayback` 控制器和独立 `<audio>`，为原版暂停布局接播放、真实 media 时间和 `skip(±15)`。不直接嵌入 `AudioPlayer` 的正文卡片外观；后续若抽取共享 hook／控制器皮肤，只复用生产播放逻辑，不把整套 Editor／Tiptap 依赖带入录音面板。
3. 快照加载失败、duration 未知／探测失败、play 拒绝分别显示真实结果；不能把 RecordingClock 值填作播放器 duration。已有控制器可处理这些结果，但它在写入 currentTime 后会乐观发布目标 time，且只按有限 duration 放开 seek；若将其用于非终态快照，需加快照范围内的能力门禁与 seeked／实际 currentTime 确认，不能单靠按钮变黑或 React time 值宣称 ±15 成功。[HTML 媒体规范的 seek 算法](https://html.spec.whatwg.org/multipage/media.html#seeking) 允许按可定位范围调整目标；有限 duration、loadedmetadata 或 canplay 均不证明整段内容已可听或已成功 seek。
4. 继续前先停播放并 dispose 控制器／时长探测，再 revoke 该代次 URL；替换、完成、取消、卸载也采用相同顺序且幂等。沿用现有控制器对晚 play Promise／media 事件的活性门禁；快照失败只使回放不可用，不销毁仍可继续／最终完成的主录音。保存仍只经原 onstop 收到最终末块后的 File 与父 ACK 链。

这条方案是**最小可验证候选，不是已保证跨端等同原版的交付方案**。若目标 WK MP4 或 WebView91 实际不能可靠播放／定位累计前缀，原 API 没有一个“加 requestData 即可”的标准修复；必须另立范围评估可产出完整快照的录制层（例如保留采集流、暂停时结束片段，再通过真实解码／重封装形成统一可播放资源），不能直接拼多个已结束 MP4／WebM 文件冒充一段录音。本次不选择或实施该较大路线。

后续仅需先解开这几个确实未知项：目标精确 OS／WebView build 与实际 MIME；首个短暂停能否从起点播到快照尾部；继续后再次暂停的累计内容是否完整、暂停间隙是否排除；超过 15 秒的真实前后定位是否落到可定位范围并继续推进；取消／继续／完成交错时是否有旧音频或 URL 泄漏。原录屏只证明暂停控件可见，未观察这些操作；同样，媒体事件推进不证明音轨可听，需要实际试听或音轨检查。未运行任何该能力验证，不增加 candidate03 验收声明。
