# RecordingPanel 纯抽取源码候选 01

基线 `fabafcf9723e400c67fd842f870dad9d4ae79d19`，隔离目录 `/private/tmp/apple-notes-recording-extract-01`。状态：已实现，等待独立源码审查；不是录音状态、父保存或设备/像素验收通过。

将原 `src/App.tsx` 内嵌 RecordingPanel 原样移动到 `src/RecordingPanel.tsx`，加默认 export。新文件只增加其专用 React hooks、Pause/Play/StopCircle、RecordingSession/createRecordingPreview imports，以及与 App 原函数字节相同的私有 errText。App 删除原定义和这几项专用 import，并直接 import 新真实组件；原 `<RecordingPanel onCancel onDone>` 挂载与父回调完整保留，不是新建未使用的替身。

公开 props 仍为 `onCancel: () => void`、`onDone: (file: File) => Promise<void>`。没有改初始 starting/自动开始、tick 计时、pause/resume、显式 stop、blob 后完成、错误显示、preview、取消或卸载行为。父目标捕获、旧 storeAttachment、insert、关闭、refresh/ACK 逻辑也完全未改；此前暂停不能直接完成、父吞错/早关闭等差距继续存在。

`source-candidate-01/source-equivalence.json` 记录基线与本次源码 SHA 和直接等价性核对：移动的整个组件去除新增 default export 后逐字相同；私有 errText 与原函数逐字相同；App 在仅删除组件及精确替换专用 imports 后与预期逐字相同。因此父挂载/onCancel/onDone、其他 App 状态/事件与绘画均保持。RecordingSession、bridge、style、Rust、依赖、既有检查脚本与基线字节相同。

已执行：

- `pnpm typecheck`：退出 0。
- `node scripts/check-recording-session.mjs`：既有 26 组通过，退出 0；真实生产 RecordingSession，平台录音/track/context/时钟为受控环境替身。
- `git diff --check`：退出 0。

原始合并输出以完整字符串保存在 `source-candidate-01/checks.json`，附输出字节 SHA；未剪裁输出或改变其末尾空行，只用 JSON 表示以避免证据文本自身的空行影响 diff-check。没有额外安装依赖、写镜像测试、重跑完整存储矩阵或调用 target。临时只链接主现有 node_modules，检查后移除。

本候选只建立真实 App 已调用的组件接缝，未运行 App GUI/设备/麦克风、未打包。26 组受控检查不证明真实编码、音轨、系统权限或正文 ACK；typecheck 和源码等价不等于像素/交互验收。下一状态任务可在新组件/RecordingSession/专用 CSS 范围开展，App/bridge 附件接线由其 owner 单独进行，按任务独立审查后再整合。
