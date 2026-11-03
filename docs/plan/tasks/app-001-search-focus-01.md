---
id: app-001-search-focus-01
scope: native-menu-search-focus-before-renderer-roundtrip
status: ready-for-review
depends-on: []
---

## objective

把 Mac 全局搜索菜单事件的原生焦点请求提前至插件处理该事件期间，移除现有 native→renderer→IPC→main 往返对首次聚焦的依赖。保持真实窗口/绑定/搜索可用性门禁和重复 focus 的 no-op。该候选只改善已确认的异步窗口，不能未经新包实测宣称解决一次快捷键立即粘贴误入正文的异常。

## context

docs/INDEX.md、docs/architecture.md 的 Mac 原生顶部宿主契约、docs/research/mac-search-focus-sequence-01/analysis.md、docs/plan/reviews/unified-fabafcf-mac-independent-02.md。实际失败与恢复是该报告12/15和完整正文证据；原因 unknown。已锁定 Tauri MenuEvent 自身排队，插件回调在宿主 global listener 之后，因此本任务不承诺最初 AppKit action 返回前聚焦。

## path

仅 plugins/tauri-plugin-notes-ui/src/lib.rs、src/macos.rs，以及确需的同插件原生 focus body 和定向检查。不得改 App/bridge/搜索投影/Editor、宿主菜单映射、依赖或其他 UI。隔离分支以排期主 HEAD 为基线；共享 Rust target 的构建由 root 串行授权，本任务准备源码和最小检查，不自行开启完整 Mac/Android 构建或 GUI。

## contract

精确识别已有 id=search 的 RunEvent::MenuEvent，解析实际 focused main 窗口和当前绑定；独立 note-* 窗口无全局搜索时拒绝，不激活别窗或回落全局最后绑定。当前搜索必须存在且 enabled，绑定/窗口不得已销毁。仅在已有主线程回调里执行共享同步 focus body；禁止 block_on 现有 async on_main、自等 channel 或再次异步排队。原 IPC 入口继续通过已有 on_main 调用同一 body，已在搜索或其 field editor 时保持 no-op。

不主动发送空搜索 intent、不改 query/selection/revision、不替换正文、不搬移已误写字符、不重绑、不开新窗口。后续 renderer 菜单处理和 IPC 重复请求兼容原契约。错误沿既有显式错误/日志边界表达，不伪造成功；不把插件可能落后的 toolbar 状态冒充即时 renderer 授权。

## verification

开发与独立源审核对同步主线程路径、精确窗口/当前绑定、disabled/unbind/destroy/no-search 与重复请求行为，运行该插件受影响检查及允许的最小编译。需要构建时先交接 target 所有权，不重跑无关存储矩阵。

通过源审后纳入下一统一默认 Mac 包。实际记录一次快捷键→立即粘贴的输入顺序与真实落点、完整合成正文及 revision，保留失败，禁止重复刷到通过。另测已聚焦搜索、普通显式搜索、唯一→零→clear、独立窗口、禁用/关闭与中文 marked text；没有可靠事件时序只报告实际目标和限制。原版相同动作作对照后再评价交互一致，不把减少 Promise 往返直接当原版一致或像素通过。

## 开发候选 01（2026-11-04）

两项插件源码已冻结并待独立源审。菜单事件精确 `search` 后按真实唯一 focused main 取得当前绑定，在本次回调直接调用与 IPC 共用的同步 focus body；IPC 仍使用原 async `on_main`。App/bridge/F07/宿主/ObjC/依赖未变。最小 locked/offline 插件测试13项通过，共享 target 已释放；无完整包、GUI、设备或像素验收。证据：[源码候选01](../../verification/app-001-search-focus-01/source-candidate-01/README.md)，两源码 aggregate `7f4ea27e672293cfb4f5c4dc0805da92762dc495139b5298bcdf1f37f1c6d968`。真实快捷键异常原因仍 unknown，本候选效果待新包验证。
