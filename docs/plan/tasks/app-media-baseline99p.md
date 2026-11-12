---
id: app-media-baseline99p
scope: performance-evidence
status: done
depends-on: [app-build-delivery97]
---

## objective

源码工具与前测证据已由不同代理独立审查，6aa4805c接受，按84f2c896..6aa4805c差异整合。正式run4含503原件715,371,216B、1917次读取2,608,262,764B；音频无src超时与工具首轮故障均保留。后测与原生性能仍由99/101完成。冻结样本及原始证据暂保留于/private/tmp/cybernote-delivery/artifacts，不能清理。

在媒体优化前的真实源码上建立可重复大量附件样本与前测；后续 MEDIA99 使用相同 fixture 和测量脚本取得后测。仅增加隔离测量工具和文档，不修改产品。必须实际读取真实 Rust Store，不能用模拟 Base64/延迟作为读盘或内存结论。

## context

docs/architecture/attachment-media.md 的样本/测量口径；docs/debugging.md 的 real Rust transport；scripts/debug/runtime.mjs、scripts/debug/rust；src-tauri/src/store 和 Session 当前真实 API。

## path

scripts/performance/ 下独立 fixture 生成、Rust Store seeder、read_attachment 透明 trace transport、浏览器测量/报告；docs/verification/modernization101/performance-baseline.md；隔离 artifacts 产物。不得改 App/Editor、bridge、样式、生产 Rust/Session、已有 debug runtime/transport（需要扩展则新 wrapper，不影响在进行的迁移）。不 native build、不 ADB，不访问用户库。

## verification

- 默认 fixture：至少500张不同PNG/JPEG/SVG大尺寸图片（大多数至少1600px），一段90分钟约86.4MB WAV，90–95MiB H264/AAC MP4（faststart与尾部metadata各一份）。可用本机ffmpeg；总附件磁盘尽量不超过900MiB，生成过程有界。若空间不足先报告，不能缩成几个小PNG却称大量样本通过。
- 真实临时Store中分布大量图片笔记以及长音频/大视频笔记；生成清单含数量/原大小/尺寸/时长/sha256/源版本。fixture可以复用，测试不删用户附件；应用状态/密钥只在隔离目录。
- 使用现有真实Rust transport连接真实App/Chrome；透明记录实际read_attachment次数和返回原字节，不以CSS图像尺寸当缩略图。采样独立Chrome renderer/process RSS、JS heap与真实Rust transport RSS；这些不等同Tauri原生App RSS，原生双端留给FINAL101。
- 记录冷/热启动到定义明确的workspace-ready、首张可见图片、画廊滚动rAF p50/p95/max与>50ms long tasks、离屏原件请求、重复滚动保留内存、长音视频笔记打开/初次播放/后段seek情况。baseline已有失败或OOM如实记录，工具自身故障修复后重测。
- 测量脚本可接受fixture/transport/frontend/source参数，后测复用同一样本与口径。避免安装/修改用户运行中的应用或写入用户库。
- Cargo只用隔离native-free harness与共享root target，jobs2；如空闲低于2.5GiB停止新增大生成物并报告，不擅自删其他任务产物。提交源码工具+文档，原始指标和样本清单保留供独审/后测；不宣称P1整体完成。
