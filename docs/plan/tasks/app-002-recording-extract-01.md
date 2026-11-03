---
id: app-002-recording-extract-01
scope: production-recording-panel-module-seam
status: done
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

## source candidate 01

基线fabafcf的纯抽取已完成：真实App改为import新RecordingPanel，移动组件主体与错误转文字函数逐字相同，props和父挂载/onCancel/onDone保持。typecheck、既有26组RecordingSession清理检查及diff-check通过。报告`../../verification/app-002-recording-extract/README.md`，源等价与SHA记录在其source-candidate-01目录。等待独立源码审查，保持ready；不修录音状态/保存，未操作设备/target/打包。

## independent source delivery

2026-11-04：独立审查SOURCE-READY，无blocking；实际typecheck和26组production RecordingSession检查通过，完整组件/父挂载/周边字节等价性已核。主63603d1合入，仅任务追加段落add/add冲突保留双方内容，两个产品文件与源966ba7d逐字一致，身份见main-integration.json。报告`../reviews/app-002-recording-extract-static-01.md`及8项独立证据原样保存，审查工具首轮准备失败亦保留。done只限纯模块抽取，不改变录制/父保存缺口，不追认candidate02包已含此新模块。
