# 附件缩略图与按需媒体

2026-11-09。实施规格。MEDIA99A受管文件/租约/cache、99B生产IPC与生命周期、99C平台派生器和99UI前端已独立审查并整合。列表/画廊/正文使用缩略图租约，可见性控制资源，激活音视频/预览才申请原件。99M正式生产测量和FINAL101双端实包仍待完成，不以源码阶段代替。

## 所有权与调用链

```text
列表 / 画廊 / 正文可见媒体
       │ purpose: thumbnail / original
前端资源生命周期（可见性、激活、引用、撤权）
       │ 带原 Session、note epoch、元数据验收
Rust 签发媒体租约 → 验证受管 File → 原文件或缩略图缓存
       │
127.0.0.1 随机端口、随机 capability URL
       │ 带背压的有界文件块
浏览器 img / audio / video → 原生解码
```

原文件、正文引用、保存 ACK、附件操作记录和同步仍归既有 Store/Session/AttachmentSubmission 所有。派生缩略图不属于附件，不写入正文、不参加同步与备份。授权仍逐笔记核验；缓存不能绕过源附件授权。

## 受管文件边界

新增内部受管文件入口，接收附件 ID 和用途，不接受 WebView 自报路径。通过主键查询原登记行，确认普通附件（排除内部导入记录）、owner、可读 Session、非 preparing、合法受管目录、非符号链接、普通文件和登记大小一致。打开后的 File metadata 仍须匹配验证结果。原件保持现有 100MiB 限制。IO 不在 Session mutex 内执行。

租约签发由 Tauri 注入的真实窗口身份核验，绑定窗口 incarnation、session、note epoch、附件身份/版本和用途。URL 不含路径、笔记 ID 或文件名；不持久化、不写入日志。关闭窗口、release、锁定 prepare、删除与同步替换使租约和在途读取失效。签发后前端还须通过现有 access/metadata 两道 gate，迟到结果只释放，不发布。

HTTP capability 是 bearer URL：可绑定签发窗口及其生命周期，不能证明每个 HTTP 请求的真实 WebView 身份；同源 Origin 不能区分应用窗口。此边界与现有 Blob URL 的持有者访问模型相同。禁止在实现或交付文档中声称 HTTP 可使用自定义 scheme 的真实 `webview_label`。若将来要求每次字节请求都核验实际窗口，应单独实施平台原生增量响应适配器。

## 流式原件

服务只监听 `127.0.0.1:0`，精确检查 Host、方法及允许的应用 Origin，无目录浏览和自报文件路径。使用维护中的 HTTP 库及异步 File，不自行编写 HTTP 解析器。

| 请求 | 行为 |
| --- | --- |
| GET 无 Range | 200、精确 Content-Length；约 64KiB 文件块，以 backpressure 逐块发送，禁止整文件 Vec/Base64 |
| GET 单 Range | 支持闭区间、开放末尾和 suffix；206、Content-Range；同样有界发送 |
| HEAD | 与对应 GET 一致的元数据，不读取 body |
| 无效/越界/多 Range | 416，明确不实现 multipart；无无界拼接 |
| 未授权/失效租约 | 拒绝，不返回名称、大小、MIME 等附件元数据 |

每个响应开始、异步读取后且发布块前检查租约与 `Session.sensitive`；撤权丢弃未发布块并取消在途响应。连接断开及时释放文件及任务。响应使用 `no-store`、`nosniff`，媒体 MIME 来自登记和有界头部判断。无 Range 首次播放不能以全文件分配作为兼容回退，也不能直接拒绝以冒充完整播放支持。

Android release 只对精确127.0.0.1配置 HTTP 本地例外，禁止全局开启 cleartext。CSP 只在 img-src、media-src 和 connect-src 增加精确 http://127.0.0.1:*；connect 仅用于按登记大小/时长设限的短音频波形 fetch，长音频仍禁止整件解码。Mac ATS 先验证，必要时添加最小本地联网例外。不能扩大 asset 附件目录权限作为授权替代。Tauri 当前 owned-body scheme responder 不是 streaming body，不作为大媒体完成证据。

## 真正缩略图

列表与画廊使用独立小文件缓存。建议列表目标 160px、画廊 480px，可按 DPR 有界提高，上限 1024px。键包含源附件身份/确切版本、目标像素和算法版本；单图尺寸、输入像素、输出字节均有界。重复生成合并，并发限制 1–2，原子发布。缓存采用固定容量上限和 LRU 回收；删除/替换清理旧版本，清空工作区和数据管理包含缓存回收。缓存命中不读取或重新解码原文件；小 PNG 派生产物必须在有界内完整校验帧、IEND 和校验和，损坏自动删除后按原授权重新生成。授权变化后生成完成也不得重新发布到失效 UI。

可复用扫描插件内部 ImageIO / BitmapFactory 的降采样和 EXIF 旋转实现，提炼目标尺寸参数；仅 Rust 验证受管 File 后内部调用，不能开放任意路径给 WebView。SVG 使用禁止外部资源的受限 rasterizer，并限制尺寸与复杂度。不得假定 ImageIO/BitmapFactory 共同支持 SVG。PNG/JPEG/GIF/WebP/BMP/SVG 的首帧缩略图为基本目标；HEIC/HEIF/AVIF 等建立真实平台支持表。失败显示类型与文件占位，保留原件打开/导出和手动重试，不静默加载全原图。视频生成有界首帧海报；长音频显示已有 peaks 缓存或中性可 seek 轨道，不自动整件解码。

## 104文字SVG补齐合同（源码独审接受，原生交付另验）

文字SVG缩略图使用锁定resvg的text功能与唯一可信内置NotoSansCJKsc Regular字体；保留OFL许可及固定来源/摘要，不扫描或加载系统/附件字体，不解析外部CSS/字体URL。默认及未知font-family统一采用该Regular替代，粗体/斜体只承诺可见字形近似；不覆盖的字符或转换失败整图返回unsupported_media，不能丢字或发布tofu/空白成功缓存。基本目标是横排text/tspan、常用定位/对齐、填色与字号；textPath及现有外部资源/复杂效果限制保持。

在现有2MiB输入、10K XML节点、12000画布轴长、1024px输出预算之外，初始文字预算为1024 Unicode scalar、128个text/tspan及4096个定位数值；shaping前检查有界属性与复杂度，转换后再查轮廓数量，压力测试如需调整须与真实限制一同记账。字体数据库只读共享且按需初始化，字体必须计入产品指纹和缓存算法版本。实现细节与证据见[104任务](../plan/tasks/app-svg-thumbnail104.md)及[方案](../plan/analysis/svg-thumbnail104.md)。冻结50份样本为Latin编号，额外中文/繁体/tspan文字像素验证独立执行，不把背景非空当文字通过。

## 前端生命周期

接口区分 acquireAttachmentSource(id, purpose, size?) 与 releaseAttachmentSource(leaseId)。资源仍遵循 retain/dispose/bindController；最后引用释放回收租约，撤权立即强制停止，无需等待归零。前端错误沿用 access_changed / metadata_stale / not_found / invalid；另明确 unsupported_media、media_io、cancelled。取消不提示错误，其他错误保留可理解的原因和重试。

- 列表和画廊只申请 thumbnail；预览另申请 original，不能 retain 缩略图作为原图。
- 缩略图请求在前端合并并限制同时签发数量，尚未开始的离屏/销毁请求立即撤出队列；快速滚动不能排队数百个已失效IPC或打开文件。原件播放/预览使用独立激活通道，不能等待全部历史缩略图请求。已发出但无法取消的迟到回执仍须走两道gate并释放，不发布到失效卡片。
- 正文媒体按可见性加载。普通文件卡不预读字节；音视频先呈现元数据，激活才申请原件，普通离屏资源释放，正在播放的资源按明确策略保留。
- AudioWaveform 必须在 fetch 前检查登记大小/时长限制，禁止 fetch.blob 后才判断；长录音不走完整解码路径。
- 原文件导出、剪贴板与系统分享继续走原字节路径，不输出缩略图。画廊定位、选中、浮动预览和正文保存行为保持。

- pool 共享键使用附件 owner、ID、登记路径/大小/MIME、用途/尺寸和 sessionId/note epoch，禁止使用每次正文保存递增的全局 metadata sequence。公开附件无 revision；同字段替换必须按 MetadataEvent.changes 中 attachment ID 精确失效，停止旧 source 并触发可见 hook 重新申请。普通 note 保存不触发附件失效。数据管理清缓存仅失效 thumbnail，播放中的 original 保留。
- 当前 UI 生命周期选择：普通离屏音视频暂停并释放原件；再出现时保留元数据/中性轨道，需再次激活。浮动原图使用独立 original acquire 和 retain，原卡片离屏/切换笔记不释放浮窗；预览申请 await 后重新核对捕获的 owner/授权/正文引用/触发元素，旧目标不发布。

### 视频元素失败与显式恢复（107，源阶段）

原件签发成功不等于后续元素读取成功。`video` 本身的网络、解码或格式失败需要在该附件下显示简洁错误和“重试视频”，不能只处理 acquire 的 Promise 失败。用户重试时经现有 hook 重新签发 source；不反复加载旧的失效 URL，不自动循环，也不改后端30分钟空闲租约规则。

仅在同一附件、当前可见、仍有授权的 owner 有效时恢复有限的播放位置；平台恢复失败须显示错误，不能悄悄从头播放冒充恢复。旧元素事件、晚回执、导航/撤权/离屏和卸载不能重新激活播放。初次激活和普通原生控件保持现有行为。具体源阶段验证及双端交付边界见[107任务](../plan/tasks/app-video-recovery107.md)。这项明确错误呈现的补齐不证明Mac106 live11/12卡住的原因。

## 验证与测量

Rust 临时 Store 覆盖真实受管文件与范围精确字节、无 Range 全部 body 且峰值缓冲有界、尾部 seek、断连、并发、release/过期/错误窗口、prepare/锁定/删除/替换中止、符号链接/大小不符、内部记录、缓存命中与淘汰、撤权迟到发布。浏览器覆盖离屏零原件读取、缩略图预览升级、普通文件零预读、controller 停止、浮窗 retain、导出原字节。

隔离 Store 中准备 500–1000 张不同大图（PNG/JPEG/SVG）、90 分钟约 86.4MB WAV、90–95MiB H264/AAC MP4（faststart 与尾部 metadata）。不得灌入用户库或用超过归档限制的包代替。保留相同样本前后基准：设备/浏览器、冷/热启动到 workspace-ready、首张缩略图时间、读取字节/请求数、JS heap/原生 RSS、解码资源数、滚动 rAF p50/p95/max、>50ms long tasks、重复滚动保留内存。明确缓存冷/热状态及测量口径。

Mac 与 Android release 实包最终验证首帧、长录音后段 seek、大视频尾段 seek、读取中撤权及 loopback 访问。mock IPC 或小 PNG 延迟不替代原生流式和大量附件性能证据。


## MEDIA99C 平台派生器边界

`ThumbnailProvider` 只接收受管 VerifiedFile、MIME、目标像素/源像素预算和授权检查；输出有界RGBA，现有cache继续统一编码PNG、完整性校验、授权后原子发布及失效。production使用start_with_provider，原start保持portable/native-free。无新增renderer command或JS租约字段。Mac实际/dev/fd AVURLAsset对两种固定MP4失败，改用内部resource loader的64KiB pread与32MiB累计输入预算；ImageIO从FD降采样并处理EXIF。Android27+使用FD和scaled frame，26仅允许≤1M源像素的明确fallback。系统解码不可保证立即中断，调用取消/10s截止后丢弃结果并保持单worker占用，直到原生任务真正结束，避免积累脱离任务。

具体平台能力、真实Mac探针与待101的Android实包证据见plugins/tauri-plugin-notes-media/README.md；HEIF/AVIF不声明跨平台共同支持。内部性能metrics区分原件HTTP读取、派生HTTP读取、生成逻辑源字节和产物字节，不将登记大小或decoder内部读取伪称物理IO。前端与实包验证范围仍依原规格，不以provider探针替代最终双端验收。
