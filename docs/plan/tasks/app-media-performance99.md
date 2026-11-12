---
id: app-media-performance99
scope: media-performance
status: done-with-measurement-limitations
depends-on: [app-module-extraction98, app-media-platform99b, app-media-baseline99p, app-media-provider99c]
---

## objective

实现列表和附件画廊独立缩略图、按可见区域加载与释放；长录音/大视频按需读取播放，避免全量 Base64/Blob 链路；用包含大量图片、长录音、大视频的可重复样本测量启动、内存、滚动流畅度。

## context

docs/architecture/attachment-media.md（完整媒体生命周期、受管文件、缩略图和流式契约）；docs/architecture.md 中受管附件、Session授权与撤权；docs/ui/attachment-gallery.md；docs/plan/cybernote-modernization-state.md。

## path

99C可与前端迁移并行，独占native provider/thumbnail内部；前端仍只通过原有thumbnail/original acquire接口。99整项验收须等待99C独审接受，不能在provider未接线时宣称视频海报完成。

NoteThumbnail、AttachmentGallery、Editor 媒体卡、use-attachment-media/attachment-media/AudioWaveform、必要的 bridge 消费接线、平台视频海报和格式能力、数据空间缓存清理、性能样本与测量脚本。依赖先前模块迁移后再创建前端实现分支。Rust 独立核心按 MEDIA99A、IPC/平台网络按 MEDIA99B 先行，不与 App 迁移路径重叠；已有 core/platform 独审后才迁移 UI。

## verification

- 不可见附件不读取原字节；列表/画廊图片实际使用小尺寸缓存而非 CSS 缩小原图。SVG 和其他扩充图片格式有明确支持/失败路径。
- 大音视频不先全量 readAttachment 或 fetch.blob；Range、seek、并发、读取中撤权/删除/同步替换均有真实 Rust 边界测试。禁止直接开放整个附件目录的 asset scope 绕过授权。
- 缩略图是可再生缓存，不作为正文附件参加同步/导出备份；有容量/尺寸上限与失效/清理策略；删除/撤权不可继续泄露派生图。
- 样本需记录原始大小/数量/时长、硬件/浏览器、冷启/热启、内存口径、滚动帧耗时/长任务和读取字节数，保留前后对比；不把小 PNG 合成延迟当实际大量大媒体性能。
- 原有媒体播放、波形、导出原字节、剪贴板、画廊定位与保存重载行为仍通过。最终双端实包补测。

## MEDIA99UI develop handoff（2026-11-09）

基线 `4bacc5f7526d83735b042428090669b64221258a`。本轮仅 UI source 阶段；99C provider、99M 生产 Rust postmeasure 与 FINAL101 实包不由本提交完成。

实际调用链：workspace 元数据 Context → 可见 hook → attachment-source-pool → 不变的 acquireAttachmentSource(id,purpose,pixels)（既有两道 gate）→ lease URL → img/媒体 controller。thumbnail 合并并限制2个同时签发、离屏 queued 立即撤回；original 独立激活。精确 attachment change IDs 失效替换，不用全局 metadata seq 作缓存key；普通正文保存保留媒体。recordedAt 取登记元数据，不读取原件。普通文件零 acquire；正文图片1024/列表160/画廊480；音视频点击才申请 original，普通离屏暂停释放。预览另申请 original，await 后核对 owner/auth/doc/ref/trigger，浮窗独立 retain；handle 幂等、最后引用清controller/src/abort后 release，prepare 同步 stop。

数据管理呈现受管 mediaCache 占用并可清理，只刷新可见thumbnail；原字节复制/导出/系统打开不依赖媒体 loaded。AudioWaveform 在 fetch 前分别检查已知 size≤8MiB/duration≤300s，长/大/未知音频保持中性可 seek 轨道。

开发验证（均在本隔离树、未运行 nativebuild/ADB）：

- `node scripts/check-media99-ui-pool.mjs`：生产pool/handle、可控 deferred IPC 6组：并发2、dedupe、queued withdraw、original不饿死、迟到释放、独立retain/幂等释放、prepare stop先于release、cache仅thumb/精确ID失效、response-gate变更最多3次重新过gate（拒绝授权不重试）。证据 `artifacts/media99ui-pool.log`、`artifacts/media99ui/pool/result.json`。
- `node scripts/check-media99-ui-app.mjs`：真实App/hook/DOM 17项：各尺寸用途、离屏和普通文件/音频idle零原件、未load文件菜单原字节动作、preview original升级/独立retain/晚结果拒绝、同字段替换重取、601s WAV激活及seek不整解码、fetch前独立预算、正文保存不断流、缓存按钮仅thumb、prepare同步stop。证据 `artifacts/media99ui-app.log`、`artifacts/media99ui/app/result.json`。
- `pnpm test:attachment-files`14、`pnpm test:attachment-gallery`33、`pnpm test:recording-refresh`8、`pnpm test:mobile-editor`、`node scripts/check-session96-menu-back.mjs`；日志 `artifacts/media99ui-{files,gallery,recording-refresh,mobile,back}.log`。
- `pnpm build`、`git diff --check`；日志 `artifacts/media99ui-build.log`。构建仍有既有大bundle提示，未增加代码拆包范围。

测试适配说明：默认隔离协议fixture新增显式HTTP lease/Range与acquire/release命令；显示组件不回退旧 readAttachment/Base64。thumb fixture为固定小PNG，视频poster明确unsupported直至99C，用途为功能验证；不作为真实provider或大量媒体性能证据。旧tests按显式音视频激活和leased URL更新，保留SVG原件、导出字节、定位、保存与菜单行为检查。17项App WAV为9.6MB/601s受控样本，只证明前置预算/seek/UI生命周期，不能替代99M规定的90min大样本与真实Rust内存/流量指标。开发提交需不同代理独立审查。

补充回归与边界：旧移动附件组按新source协议更新后继续保留实际FileList/FileReader、批次/ACK/重试/授权/保存检查；检测出连续附件quiet同步使已排队thumbnail receipt过期，pool仅对仍存活请求的access_changed/metadata_stale有限重新acquire，保持原两道gate，取消/拒绝授权不重试。另修普通文件按钮在320/390px长文件名min-content溢出，未改全局CSS。预览Tab测试改为通过正常顺序走过Chrome可聚焦滚动信息区后离开，并检测内部循环；单次Tab必须直接离开dialog的旧假设不再成立，产品无Tab拦截变更。

最终补测记录：`pnpm debug group quick-home --mobile --out artifacts/media99ui-quick-home` 已通过46项，`node scripts/check-menu-lifetimes.mjs` 已通过。最终App17/pool6/gallery33/build/diff-check通过；文件14、录音刷新8、mobile-editor、SESSION96 menu-back此前通过，相关源码路径未在收尾改动。

扩展大组未标通过：`pnpm debug group attachments --mobile --out artifacts/media99ui-attachments` 曾完成98项附件/数据管理/预览检查后在 `scripts/debug/storage-overview.mjs:213` 失败（期望 `.storage-summary` 1个、`.data-file` 0、`.storage-category` 7）。调查确认本轮cache UI误复用 `.storage-summary`，使总览从基线1个变成2个；同一原因使quick-home第419行失败。已将缓存区域收进唯一原总览，不改该断言，quick-home最终46项通过。最新大组重跑完成mobile attachments43项后，切换到DataManagement首图导入时遇到原captured-target拒绝：`原附件目标、正文或授权状态已改变；已保留恢复身份，请勿关闭窗口`，save snapshot queued1/pending0/failed0。精确证据为 `artifacts/media99ui-attachments/{suite.json,failure.json,attachments-failure.state.json}` 和 `artifacts/media99ui-attachments.log`。未复跑基线大组，不能把这次跨scenario拒绝认定为基线既有问题；原owner guard未放宽、此大组仍留给独审判断。独立App17与files14均通过，不能用其替代整个大组的失败结论。避免继续扩大到Preferences/备份范围。


## independent source acceptance

2026-11-09：作者6c9b965b，独审52094e28接受并回填根目录；pool独立7组/App17/43项prefix及精确双添加/唯一总览复验通过。历史captured-target拒绝根因未知，未追认为旧问题，原失败保留并在101实际流程复核。99整项仍等待99M正式后测和101实包，不把源码阶段标为整体完成。
