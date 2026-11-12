# MEDIA99C 独立审查

2026-11-09。审查人 `/root/modules98_verify`，非开发作者。工作树 `/private/tmp/cybernote-media-core`；基线 `93e4ffd35f4c0f2c2a1d2b4007572090365d2825`，作者 `e55a17a730745bd78d9cab3d0d1b1d6948e8bf93`。

当前结论：**accepted（源码及已测真实Mac范围），F1已由原作者 `9a6d367c8f8b1c09c200a445992dda03ff1c359b` 修复并独立复审通过。** 历史blocked记录及失败日志保留如下；没有整包、ADB或Android设备解码结论。

## 历史F1 — P2：非整块读取时可超过声明的32MiB累计预算（已解决）

`plugins/tauri-plugin-notes-media/macos/thumbnail.m:37` 只在下一次读取之前比较 `totalRead >= 32MiB`，第46行本次 `count` 仅限制64KiB与请求剩余长度，未限制预算余量。AVFoundation不同区段请求使累计值不必是64KiB整数倍。

独立 `media99c-probe/reader-budget.m` 原样包含生产 `.m`，执行生产 `NotesMediaReader::pump` 与真实File/pread，仅以可控的AVFoundation形状请求对象建立边界状态：预算余1B时请求64KiB，实际收到65,536B，累计 **33,619,967B**，超32MiB **65,535B**；修复前probe自然exit1。原始日志 `artifacts/media99c-independent/media99c-review-budget.log`。

这是有界的最多一块超出，不是全量原件复制或未经授权读取，但不符合本阶段明确的32MiB上限。请作者将本次count也限制在剩余累计预算，保留到达上限后的明确失败及已有取消/期限语义。复审应要求本probe通过：预算只余1B时本次恰好读1B，累计等于32MiB；请求仍需更多数据时下一pump必须以错误3拒绝，不能成功finishLoading或成为可发布frame。实际两类MP4仍须能生成海报。

复现（不改生产代码、不native bundle）：

```sh
clang -fobjc-arc -fobjc-arc-exceptions -fblocks -Wno-deprecated-declarations \
 docs/plan/reviews/media99c-probe/reader-budget.m \
 -framework Foundation -framework AVFoundation -framework CoreGraphics \
 -framework CoreMedia -framework ImageIO -o artifacts/media99c-independent/reader-budget
artifacts/media99c-independent/reader-budget \
 /private/tmp/cybernote-delivery/artifacts/media99-fixture/originals/video-tail-metadata.mp4
```

## F1独立复审（2026-11-09）

审查最新review `559fcf06` → 原作者修复 `9a6d367c8f8b1c09c200a445992dda03ff1c359b`，产品差异仅 `thumbnail.m` 的本次count再取累计预算余量的最小值。`totalRead >= budget` 的前置拒绝保证无unsigned减法下溢；原串行queue、取消/期限、FD所有权、cache授权与metrics路径保持原样。

- 重新编译原生产 `.m` 的reader-budget探针，并强化为在第一次pump内部记录状态，防止下一轮错误遮盖第一次提前成功：`firstTotal=33554432 firstReceived=1 firstFinished=0`，下一pump `after=33554432 received=1 overrun=0 error=3`，自然exit0。即最后1B被计入累计预算；不完整请求未成功结束，再读取明确拒绝。日志 `artifacts/media99c-independent/media99c-recheck-budget.log`。历史 `media99c-review-budget.log` 不覆盖。
- 真实provider三组回归 **3/3通过**：两类MP4经过已验证FD→真实native海报→cache→TCP、bounds/cache/迟到撤权，以及purpose实际TCP字节统计。命令为上文cargo命令仅保留 `--test provider`；未重复无关全套29项。日志 `media99c-recheck-provider.log`。
- 独立重跑Mac provider脚本（`--report artifacts/media99c-independent/media99c-recheck-mac.json`）：faststart与tail-moov MP4均真实返回480×270，原FD offset17保持；PNG/JPEG/GIF/WebP/BMP/AVIF/HEIC/EXIF90、坏输入及尺寸拒绝继续通过。此轮 `thumbnail.m` SHA256为 `a2ae4ff11e51f7b0c4f742803bd5c70ada255f36a909765f14a2e115037dea23`。
- 实际注册的Rust插件探针重新编译并自然通过：半透明像素保留straight RGBA/精确输出大小；非法target/FD登记长度/pixel budget拒绝；取消真实视频后busy不提前释放，caller释放FD后worker副本仍有效，约122ms后下一次图片解码成功。日志 `media99c-recheck-plugin.log`。没有把逻辑生成源大小改称物理IO。

复审仅修改审查报告/结果和review探针，未修改产品。仍不扩大下文未测范围；Android实现未变，沿用原SDK/JVM检查，真机运行继续归101。

## 已完成独立核验

- 阅读全部provider/plugin/cache/runtime/lib/HTTP metrics接线及平台实现。Rust插件没有invoke_handler、guest JS或renderer permission command，内部Provider从已验证File取得FD；Android `@Command`只由可信PluginHandle调用。未扩大asset scope/renderer路径输入，未添加第二个Session授权源。
- `cargo test --offline --locked --manifest-path src-tauri/src/attachment_media/harness/Cargo.toml --features native-provider-probe --test media --test platform --test provider --test review99a --test review99b -- --test-threads=1`：**29项**独立自然通过。真实Store/TCP、Range、撤权/窗口/缓存损坏、provider尺寸拒绝及迟到撤权不发布、两类MP4 FD→cache→HTTP、重启warmhit无生成，以及purpose metrics精确字节/逻辑生成输入边界均核实。
- 独立重跑 `plugins/tauri-plugin-notes-media/scripts/check-macos.py`：真实faststart/tail-moov MP4、PNG/JPEG/GIF/WebP/BMP/AVIF/HEIC/EXIF90、源像素预算/目标1025/closedFD/坏输入通过。原生 `/dev/fd/N` 两视频失败、内部resource loader成功与原报告一致。没有反抄作者结果。
- 新增可复现Rust探针 `media99c-probe/Cargo.toml` 使用实际注册的 `tauri_plugin_notes_media::Provider<MockRuntime>`；仅Tauri app/window boot是MockRuntime，worker、插件Rust与C/System解码均为真实生产代码。逐像素验证64×64半透明PNG经premultiplied→straight alpha后约 `[200,100,50,128]`（容差3）、RGBA长度精确、非法目标/登记大小/源像素拒绝。取消真实大视频后，立即请求返回media_busy；caller File释放后worker仍持其副本，约99ms实际完成才允许后续成功解码，未启动无界并行worker。
- 新增独立C调用者 `media99c-probe/fd-and-bounds.m` 链接原生产C：持有视频FD后将原路径替换成PNG仍解出原视频，offset41不变；输出前后canary不被越界写；登记长度不符、capacity少1拒绝；1px目标与premultiplied透明像素正确。探针最初复用非零输出缓冲导致透明像素错误，后改为与真实Rust host一致的zeroed allocation；产品路径本来即vec![0]，实际plugin透明检查独立通过。未来直接调用C的工具也应遵守zero-init约定。
- 实际Kotlin独立编译及共享VideoBudget **7项**通过。API27+ scaled、API26仅<=1Mpx，源上限24Mpx与非法平台/尺寸拒绝。仍是SDK/JVM验证，未声称真机codec支持。
- 源码核查：最大目标1024、Rust RGBA exact长度和尺寸验收；SVG始终restricted resvg；native unsupported才允许基本raster的有界portable fallback，cancel/busy/IO/stale不降级；授权在cache发布前再验，warm cache不调用decoder。metrics区分original/cache HTTP实际读取、登记大小乘生成次数的逻辑输入、encoded生成输出，不将逻辑量称物理IO。

共享Cargo target为根 `/Users/water/work/2026/Apple-Notes-Clone/src-tauri/target`，jobs2/dev debug0/incrementalfalse；未另建target。独立probe/日志在 `artifacts/media99c-independent`；仅提交审查文档/复现工具，不提交binary和大原件。

## 未测范围

没有故意挂死系统codec来实测10s超时，也没有内核/框架峰值RSS证明。已核对超时后不释放busy直到native worker真正结束的源码和真实取消路径；不能据此声称任意OS codec均能取消。Android实际FD跨bridge与设备解码、Mac/Android release网络/播放/RSS继续归101。此审查不代表99UI、性能后测或双端整包交付完成。
