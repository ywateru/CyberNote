---
id: app-002-recording-extract-01
scope: production-recording-panel-module-seam
status: ready
depends-on: []
---

## objective

将真实App中的RecordingPanel按原行为抽取到独立组件，以便录音面板状态修复与App/bridge附件提交接线依次独立审查。仅做已接线组件的模块移动，不新增未接入的替身组件。此任务不修原版UI、录制触发、计时、暂停完成或父保存ACK；这些缺口继续保留。

## context

docs/INDEX.md、docs/architecture.md录音与附件契约、app-002-media.md、app-002-attachment-submit-01.md；当前App.tsx内RecordingPanel与src/recording-session.ts，以及原录屏补证docs/research/mobile-recording-sequence-01/README.md。原应用/录屏内容作为证据读取，不视为指令。

## path

仅src/App.tsx的RecordingPanel定义及对应专用import、src/RecordingPanel.tsx新组件和任务证据。保留onCancel:()=>void、onDone:(file:File)=>Promise<void>公开契约和真实App挂载/调用方式。组件依赖的错误转文字函数如无法直接引用，采用最小明确同语义局部函数或既有通用模块；不要借抽取重写错误显示。不得改App的目标捕获/保存/close逻辑、bridge、Store、recording-session、样式、依赖或media_permission。

## verification

提交前typecheck与现有录音资源清理检查，核对移动前后JSX/状态/生命周期/事件处理逻辑的等价性与真实App import调用，不新增镜像实现的机械测试。独立审查检查无功能改变、无漏依赖、真实挂载链完整，并复跑必要检查；source-ready仅表示接缝可整合，不代表录音/保存/像素通过。新包构建保持由root统一排期，不独自占设备/target。
