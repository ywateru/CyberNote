# MEDIA99A 独立审查

2026-11-09。审查人 `/root/media99a_verify`，非开发作者。基线 `8c3ce9a4`，产品提交 `a355ea6823bd63701b607dbb70c08ca8a03fce03`，工作树 `/private/tmp/cybernote-media-core`。

## Findings

### F1 — P2 / blocking：缓存只验证尺寸头，损坏正文会永久命中并以 200 返回

- 设计/模块合同：`docs/architecture/attachment-media.md:47` 定义可再生、版本化、有界的真正缩略图缓存；`src-tauri/src/attachment_media/README.md:126` 明确声明 “corruption regenerates”。损坏派生文件应能恢复，不能让正常原件永久停在失败缩略图。
- 代码：`src-tauri/src/attachment_media/thumbnail.rs:188` 的 `cached()` 只调用 `ImageReader::into_dimensions()`，没有验证 PNG IDAT 的可用性/完整性；`get():240`–`251` 据此更新 LRU、计为 hit 并返回新租约。服务端 `open_source` 核对的是这次损坏文件的新 stamp，因此随后仍正常输出损坏内容。
- 独立真实复现：正常生成 160×80 PNG 后，保留 IHDR/尺寸，翻转 IDAT 压缩数据中的一个字节。独立 `image::load_from_memory` 确认文件确实不可解码。随后重新申请 thumbnail：暖缓存 `generations=1,hits=1`；重建 `ThumbnailCache`/`MediaCore`/服务的冷缓存 `generations=0,hits=1`。两者均返回 **HTTP/1.1 200 OK**，body 仍不可解码。源附件、真实 Session/Token/owner 不变。
- 影响：任何这类缓存损坏后，重试仍取得同一坏 PNG，进程重启也不会修复；既无法作为图片显示，也没有 typed error 触发可恢复路径。原件正常却需要手动整体清缓存才能恢复。
- 修正要求：命中前建立有界的完整性判据，坏文件自动移除/重新生成；覆盖暖缓存与重启恢复。不要通过每次重读/重解码原件实现“命中检查”，也不能静默返回原图绕过缩略图。若采用缓存内容校验或首次验证，应保留输入/内存/输出上限和正常命中语义，避免增加无界全目录启动工作。
- 复现脚本：`src-tauri/src/attachment_media/harness/review99a.rs`（独立测试体）与 `harness/tests/review99a.rs`（集成入口）；只修改测试 harness 接线，没有改产品实现。
- 证据：`artifacts/media99a-independent/cache-corruption.log`、`result.json`。最终命令自然 exit 101，2 failed，0 passed；这两个失败是预期暴露的产品缺口，不能记为通过。

## 本次验证

- 阅读全部核心产品 diff：Store 主键查找/受管 File、SessionAuthority/window incarnation、租约、HTTP 服务/响应体和缩略图缓存。逐项核对 no-follow/openat、登记及文件版本、IO 脱离 Session mutex、原件每块前后授权、连接级取消、固定块大小、Header/Host/Origin/Range、缓存配额与原子路径、受限 SVG 外部资源禁止及解码边界。
- 独立执行既有真实 Store/TCP 核心测试：**15 passed / 0 failed / 3.72s**。包括 no-Range 全部原件 body、HEAD 零载荷、Range 精确字节、12 并发位置读取、慢消费者背压、release/断连、真实 Session prepare 与读取后撤权、窗口重建/stale token、文件和缓存 symlink、实际多格式 PNG 缓存/配额/迟到生成拒绝。日志 `artifacts/media99a-independent/existing-core.log`。
- 新增独立暖/冷缓存 IDAT 损坏探针，使用真实 Store、真实 SessionAuthority 与 TCP body，不 mock decoder、IPC 或授权。上述 F1 在两条路径均复现。
- 核对 PNG/JPEG/GIF/WebP/BMP 的限制先于全帧转换；SVG 限制输入字节、XML 节点、输出像素并禁外部 resolver，复杂 SVG 明确拒绝，未发现可支持声称完整 SVG/HEIF/视频海报的证据。decoder allocation budget 为库的 best effort，不等同进程精确 RSS。
- `git diff --check` 通过。只添加独立测试与报告，未修改生产逻辑，未 native build、安装、ADB 或操作用户库。

复现命令：

```sh
CARGO_TARGET_DIR=/Users/water/work/2026/Apple-Notes-Clone/src-tauri/target \
CARGO_BUILD_JOBS=2 cargo test \
  --manifest-path src-tauri/src/attachment_media/harness/Cargo.toml \
  --locked --test review99a -- --nocapture
```

## 明确后续边界

本任务为独立核心，不因尚未在 `lib.rs` 声明/启动而新增 blocking：任务明确把 IPC/实际窗口生命周期与 prepare/同步撤销转发、tagged 回执及前端双 gate、DataManagement 统计/清理、CSP/Android release loopback/Mac 网络配置交给后续 MEDIA99B/MEDIA99。上述链路必须真实接入后才能称产品功能完成。HTTP URL 仍是 bearer capability，不能证明请求 WebView 身份；被浏览器/内核接收的字节无法召回，renderer 清除仍是访问 ACK 前置条件。

未执行新原生包/设备/长音视频真实解码及 seek，也未测大样本启动、RSS、滚动；保留 FINAL101 的真实平台门槛。本次 bounded core 检查不能替代那些证据。

## 结论

**blocked**。原作者修正 F1 并通过上述两个独立探针后复审。其余已审核心边界在本次限定源码与真实 Store/TCP 范围没有发现新增 blocking；不能据此声明完整 P1、前端或双端性能已完成。


## F1 修复独立复审 — 2026-11-09

复审范围 `9676b0c69a0d7389d0639d87e7e1f138547c97ba..f830c695680dd86103de134d05c053f41bed8eb5`。保留上方首次失败结论作为历史证据；本节是该修复的当前结论。

**pass；F1 已关闭，本轮未发现新增 blocking。** 未修改任何产品源码或原独立探针。

- 原独立暖缓存、重启恢复缓存 IDAT 损坏探针实际重跑 **2 passed / 0 failed**。暖缓存返回可解码 PNG、`generations=2,hits=0`；重启路径返回可解码 PNG、`generations=1,hits=0`。均为实际 HTTP 200 body，证明发生自动再生，而非仅把损坏缓存错误转为重试。
- 核心真实 Store/TCP 集成集实际重跑 **16 passed / 0 failed**。新增尾部用例保留完整帧、截断 IEND CRC，断言再次生成且恢复完整字节；同时证明 source 已撤权时拒绝再生、损坏缓存保持原状，和大于 8MiB 的 cache `output_bytes` 配置被拒绝。其余 15 项流式读取/授权/缓存回归继续通过。
- 初步直接执行现成 debug 二进制以避免大产物；随后用同一源码工作树执行两条 `cargo test --locked` 确认源码绑定。harness 小规模重新编译成功（review99a 1.08s；无 Tauri/native），最终结果以 `cache-corruption-locked-recheck.log` 和 `core-locked-recheck.log` 为准。
- 源码核对 `cached()`：受管 no-follow 文件及尺寸限制后，只读取派生 PNG；强制 RGBA8、非交错、单帧及请求尺寸上限，以 checked arithmetic 分配不超过 1024×1024×4（4MiB）的显式帧；`png::Limits` 给内部 decoder 16MiB 预算，编码文件配置最大 8MiB。`read_header_info` 后完整 `next_frame`，再 `finish`，并在返回前核对 FileStamp。没有引入原件解码作为 cache-hit 校验，也没有全目录启动解码。
- 独立阅读锁定依赖 `png 0.18.1` 的 decoder 实现：`ignore_checksums(false)` 开启 CRC 和 Adler32；`finish()` 的 `read_until_end_of_input` 迭代到完整 IEND chunk。截断 IEND 的真实用例与该源码语义一致。上述数值是显式缓冲和库分配预算，不能当作精确进程 RSS/峰值测量。
- 证据保存在 `artifacts/media99a-independent/`：新 `recheck-runs.json` 记录直接执行的二进制 SHA-256、exit 和耗时；`recheck-result.json` 记录源码复验结果。原 `result.json` 及首次失败日志保留。`git diff --check` 通过。

复审命令仍为上一节命令，另运行同 manifest 的 `--locked --test media -- --test-threads=2`。共享根 target、jobs=2，无 native build/安装/ADB/用户库操作，未清理他人产物。

本次通过仅接受 MEDIA99A 有界核心及 F1 修复。前述「明确后续边界」继续有效：生产 IPC/生命周期/前端 gate 与媒体组件尚未由此证明接入，真实 Mac/Android 播放、seek 和大样本性能仍待后续任务，不得据此声明用户可见功能或完整 P1 已完成。
