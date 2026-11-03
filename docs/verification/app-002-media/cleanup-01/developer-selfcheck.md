# APP-002 录音资源清理候选 01

2026-11-03，隔离工作树 `/private/tmp/apple-notes-media-roundtrip-02`；产品基线 `67ce948`，准备文档 `fd7bfd2`。仅开发者源码/受控失败注入检查，待独立静态审查；未构建、安装或操作 Mac/Android。旧冻结 `5dd6dfc8…` APK 仍用于现有 getUserMedia 基线，本候选尚未合入。

## 改动与生命周期

`RecordingPanel` 实际创建 `RecordingSession`，浏览器绑定仍调用 audio-only getUserMedia、原 MIME 探测顺序、MediaRecorder.start(250) 和真实 Analyser。挂载自动开始、暂停/继续、显式结束后有 blob 才能完成、父保存及 Rust 附件协议均保持原行为。本批不解决暂停完成、父保存吞错、在途保存取消和孤儿附件。

每次挂载创建一个会话并归属其权限请求、recorder、tracks、AudioContext、source/analyser 与波形 timer：

- 准备中构造/start/AudioContext/analyser/source/连接/定时器失败，统一解除事件并尝试停止所有已取得资源；一个同步释放失败不会阻止后续资源释放，错误合并回传。
- 取消/卸载先关闭会话回调入口，再 stop recorder/tracks、清 timer、断开节点、close context；重复释放不重复操作同一资源。权限晚返回仍停止该旧请求的 tracks，不进入新会话。
- recorder error、track ended、分析读取失败进入错误并释放。捕获的旧事件、定时器和权限拒绝晚回调不能继续更新面板或生成 blob。暂停/继续若平台调用抛错，也进入同一释放路径，不再写回正常状态。
- 正常显式结束立即释放 tracks/analyser/context，保留最终 dataavailable/onstop 入口；等待最后数据后只生成一次原 MIME blob。自己的 track.stop 不被误判为设备中断。
- 预览 URL 在 blob 的 effect 内创建、随替换/卸载回收，不在 render 每次创建；回收幂等。

AudioContext.close 是异步浏览器操作，代码发起关闭并捕获 rejection；失效会话不回写 UI。本次仅验证关闭调用/晚回调边界，不能证明设备资源已物理关闭或浏览器 close 实现成功。若权限/停止永久不回包，本批没有新增超时或用户恢复流程。

## 已执行检查

| 检查 | 结果 | 有限范围 |
| --- | --- | --- |
| `pnpm typecheck` | pass | 当前前端严格类型检查；没有新依赖 |
| `node scripts/check-recording-session.mjs` | 26 项 pass | 转译并调用真实生产模块；平台边界为可控替身，未复制清理实现 |
| `pnpm test:native-toolbar` | 12 项 pass | 既有原生顶部生命周期/状态检查，不能替代录音设备基线 |
| `git diff --check` | pass | 空白检查 |

26 项覆盖构造/start/context/analyser/source/connect/timer 准备失败、权限拒绝和取消后晚 resolve/reject、正常开始/波形/暂停继续及等待最终块、dispose/recorder error/track ended/分析错误的旧事件抑制、重复释放、track stop 单点失败、暂停/继续异常、旧新会话隔离、预览 URL、start 部分成功后抛错、start 同步错误事件、关闭异步失败晚回调，以及生产浏览器 audio-only/MIME mp4/默认容器绑定。

运行时仅临时借用主工作树现有 node_modules 的符号链接，未安装或修改依赖；交付前移除链接。产品文件和检查脚本身份见 `source-identity.json`。没有运行 Rust 测试：本批未改 Rust/IPC/持久化接口。

后续门槛仍是：独立静态审查 → 冻结旧 APK 现有路径受控音轨基线 → root 决定合入/候选构建 → 实际设备复验。真实权限/轨道停止/系统指示、录制容器和可辨识音轨、冷启动播放、系统中断、UI/像素均 unknown；本批 pass 不升级为 APP-002 整体通过。
