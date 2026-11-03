# APP-002 当前源码差异与首批准备

2026-11-03；隔离工作树 `67ce948`。本次仅只读核源码、本机协议和工具可用性；未连接设备、录音、修改产品、安装依赖或构建。沿用 `analysis.md` 的范围和 unknown，不重写旧 21 项审计。后续按项目现有 docs-sprint 开发/独立验证交接执行。

## 与旧审计的差异

21 项输入中 17 项 SHA256 与旧 `inputs.json` 相同；4 项变化如下。旧 App/Editor/lib 三份冻结字节均与 `34223af` 对应文件完全一致，故可直接用 `git diff 34223af..67ce948` 核差异，不需要猜测旧工作树内容。

| 文件 | 当前变化 | 对录音链的影响 |
| --- | --- | --- |
| `docs/plan/tasks/app-002-media.md` | 收窄首批：先跑既有采集基线，再修资源释放、暂停完成、失败保留重试和落盘补偿 | 本次遵循该范围；绘画/通用附件不自动算首批完成 |
| `src/App.tsx` | `766a810` 用语义文档比较；`5c46536` 新建笔记同时采用已接受的 access 快照 | 可避免同文档键序差异/新建笔记 epoch 造成编辑器重建；录音入口、RecordingPanel 和父保存回调本身未改 |
| `src/Editor.tsx` | `f3071f3` 为 Android 启用已修正的组字保留选项，并引入 `native` | MediaView、AudioPlayer 字节未改；不能将编辑器组字修复算音频验证 |
| `src-tauri/src/lib.rs` | `c64b697` 增加标准关闭窗口菜单角色 | store/read attachment、WebView 权限回调未改 |

当前关键位置：普通入口 `App.tsx:1534–1538`，原生入口 `:2050–2054`，父保存 `:3202–3241`，RecordingPanel `:3707–3884`，播放器 `Editor.tsx:66–168`。旧审计的静态缺口全部仍成立，尚无设备复现结论：

- 普通入口仍只 `setRecord(true)`；原生入口另存 note/editor/access/bookmark 上下文。
- 面板仍在挂载后请求 getUserMedia 并自动 start；原版触发方式仍 unknown。暂停后没有最终 blob，完成按钮仍禁用。
- 取得 stream 后构造/start/AudioContext 失败仍只设 error，立即清理缺失；回调取消检查、recorder/track 中断处理、停止后的 analyser 释放仍缺失。原有卸载与晚返回 getUserMedia 的 track 清理仍在，不能说完全没有清理。
- 父 onDone 仍吞错；缺 current/editor 直接返回，insert `.run()` 结果不检查；在 refresh/flush 确认前已关面板。busy 时仍可取消，跨 await 没有同一会话活性检查。
- Rust/bridge/归属校验与旧审计逐字相同：有真实授权和附件归属保护，也有 DB 插入失败删文件；成功 store 后插入/保存失败无补偿或重试复用。不能靠前端报错判定无孤儿。
- 计时 tick、空 blob、MIME 文件名回退、预览 URL 未回收、播放错误吞掉均未改。实际编码/轨道/时长/冷启动音轨仍 unknown。

## 首批最小修改点（基线后执行）

1. **RecordingPanel 生命周期**：以同一清理入口处理准备失败、结束、取消、卸载、recorder error/track ended；先标记取消并解除/守卫回调，再停止 recorder/tracks、清 timer/analyser、关闭 ctx。等待权限返回的 stream 仍需立即停止。预览 URL 随 blob 创建与回收。不要把 analyser 初始化失败留成后台继续采集。
2. **暂停完成与失败重试**：paused 完成先 stop 并等待最终 dataavailable/onstop，再校验非空结果；保存中显式约束取消/Back，不允许已取消的异步回调继续插入。父 onDone 必须明确报错，缺目标/已销毁 editor/insert false 都失败，保留可重试草稿；只有正文保存确认后关闭。普通和原生入口共用录音会话的目标、授权和选区检查，保持既有后端保护。
3. **附件与正文两步结果**：首次成功 store 后暂存附件 ID，失败重试复用，避免每次生成新 UUID。实现前确定最小受授权清理边界：只清理同目标且未被持久化正文引用的本次草稿，不能在保存结果未知时盲删；若已有正文节点则重试确认保存，不能再插一个节点。检查文件/表/文档三者，必要的补偿放 Rust 端，不绕过 session/owner 校验。当前没有可直接复用的 discard API，不能只改 UI 声称已处理。

计时、容器/音轨和播放错误按真实基线补最小必要项。此处只是修改边界，不是已实现设计，也不引入原生录音插件。

## Android 受控音轨基线准备

按 root 交接，媒体源码与当前隔离树一致的已安装候选可复用：`/private/tmp/notes-fix07-candidate02-5dd6dfc8.apk`，SHA256 `5dd6dfc8d31812c2bafcff5115d9946456ff6d37028f2caed174585c91ca0ca2`；无需先重建。当前 Android 仍由 verify 使用，下面步骤尚未执行。

已复核本机 `emulator_controller.proto` 的 SHA256 仍为 `1d62c6bcad5f06621f90ec2bf26c661ba769ccd0f1416b5314d25a68e04eee5f`，injectAudio/streamAudio/麦克风状态接口与 root 补充一致。仅做无连接工具盘点：当前系统 Python 无 grpc/grpc_tools/protobuf，PATH 无 grpcurl/protoc；有 ffmpeg/ffprobe。这说明需要在设备交接后先确认可用客户端/最小隔离工具，不能声称现成注入链已可用，也不应在应用内伪造 MediaStream。

1. 收到 Android 释放通知后，先核已安装 APK 身份；只对自有模拟器做一次有界 gRPC 端点/认证可用性探测，不在报告/终端打印认证 token。记录原麦克风宿主状态；若需改变则必须恢复。若端点/认证/客户端不可用，记录具体阶段 unknown，不持续扩建测试平台。
2. 若可用，生成可辨识的两段节拍 PCM（S16LE、mono、≤48kHz），走真实 injectAudio→Android 麦克风→应用原有 getUserMedia。首包格式固定，分包小于约 300ms 缓冲；优先默认节流模式，不能盲用 real-time 模式冲入全部数据。宿主麦克风关闭是否阻止注入需要实测，不从协议名推断。
3. 真实 UI 建合成笔记、走录音菜单；记录权限结果、recorder MIME/track/资源状态。录约5秒→暂停约3秒→继续约5秒→暂停；先保存“完成仍禁用”的基线，再单列显式结束→完成测试，不能把替代路径当暂停完成通过。
4. 核附件 ID、MIME、大小、真实受管文件及正文引用；提取该合成文件，用 ffprobe/解码后的频谱确认两段音轨和约10秒有效录制。波形非零、文件非零或 MIME 字符串都不足以证明采集成功。
5. 强停/冷启动后真实播放；若可用 streamAudio 捕获虚拟设备输出，核两段节拍，不把直接解码文件当输出设备播放证据。短基线不能验证 ±15 秒；另用 ≥35 秒合成轨。实际保存失败、取消/Back、权限拒绝在首批修复前后保留真实结果及文件/表/文档差异。

Mac 仍等设备交接；其 getUserMedia 路径和可辨识音轨基线仍 unknown。任何平台/硬件无法提供的路径明确 unknown，不以本次准备或 APK 构建替代媒体、交互或像素验收。
