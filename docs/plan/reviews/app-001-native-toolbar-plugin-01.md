---
id: app-001-native-toolbar-plugin-01
task: app-001-fix-02
baseline: adc544a
result: limited-static-review-focus-entry-gap
date: 2026-11-03
---

# 原生工具栏有限接入审查 01

**正式替换主应用顶部前，须补固定的原生搜索 focus 入口。** 本轮只读已冻结 `adc544a` 插件及主应用已提交 `0d8b245` 基线，未读取 FIX03 开发中源码作通过依据，没有运行 GUI、重编译或新增测试框架。编译日志、glassRegular 诊断和以下静态检查均不构成像素/输入法/生命周期实测通过。

## P2：搜索菜单及快捷键不能聚焦原生搜索

`plugins/tauri-plugin-notes-ui/guest-js/index.ts:51` 只有 bind/update/inspect/unbind；ToolbarState.search 只有 enabled/value/acknowledgedEvent。`macos/toolbar.m` 创建 NSSearchField，但无对宿主开放的 makeFirstResponder 路径。冻结主应用 `src/App.tsx:670` 的 Cmd/Ctrl+Shift+F、约713行的搜索菜单分支均调用 DOM searchInput.focus。若接入时按插件契约隐藏重复 DOM 搜索框，这些入口不会自动把焦点移至 NSSearchField。

最小补齐要求：

- 增加固定类型化 `focusSearch` 命令/方法，使用 Tauri 注入的当前 Window，并复用 windowLabel、UUID bindingId、当前绑定校验；不得提供任意 selector 或跨窗标签调度。
- 在主线程对当前有效、存在且可用的搜索控件请求 first responder；未绑定、过期绑定、搜索缺失/禁用/已关闭返回明确错误。不得以重新 bind 或重写搜索文字实现聚焦，避免破坏当前输入和选区。
- 正式主应用接入时把搜索菜单与 Cmd/Ctrl+Shift+F 路由至所属窗口的 focusSearch；桌面 Cmd/Ctrl+F 的笔记内查找职责保持原有单独路径。仅改插件不会自动完成宿主路由。
- 独立 GUI 验收至少覆盖主窗快捷键/菜单后实际输入进入原生搜索、W2不得夺取W1焦点、unbind/rebind旧ID拒绝、搜索缺失/禁用的错误路径。当前全部 not-run。

## 已见清理及事件边界，仍需接入时遵守

| 边界 | 静态所见与宿主责任 | 未知项 |
| --- | --- | --- |
| 窗口注销 | `toolbar.m:161` 的 WillClose 调 dispose；`:360` 幂等移除观察者、菜单跟踪、target/delegate、视图及 Rust callback context。Rust `lib.rs` Destroyed 和 on_drop 再清绑定，`macos.rs` 按 bindingId 销毁。宿主组件销毁须停更新队列，尝试 unbind，并在 finally 解除 JS 监听；不能让 unbind 的 stale_binding 错误阻止 unlisten | 未实测释放次数、关闭/重开、异步unbind与组件卸载竞态 |
| 身份及序号 | Rust 发出前核 label+bindingId+当时stateRevision+允许动作；guest listen 只再核 label+bindingId，未自动按 sequence 去重/排序，也不校验已送达事件的 stateRevision。宿主须按每绑定管理队列/lastSequence，异步执行前复核目标笔记/授权，重绑重置序号；toolbar revision独立于document revision | 未实测事件迟到/乱序；序号不能代替FIX03真实Rust授权 |
| 首次绑定 | guest 的 bindingId 在 bind响应后才写入；该响应前到达的事件会被监听器丢弃。初始 active/layout以bind返回的native信息建立，不依赖一次早到windowActivity事件；销毁时忽略迟到bind响应并清理对应绑定 | 未实测快速开关窗口与绑定响应竞态 |
| 搜索ack | `toolbar.m:180` 用searchSequence拒绝过期ack，`:307`统一递增sequence；宿主合并最新search value+sequence后串行update，stale_search须重新合并/inspect后重试，不能把未合并序号直接ack | 未实测并发update、Return/Escape、短时重复输入 |
| 中文组字 | `:182`在marked text且文字不同的状态更新上返回search_composition；`:338`组字不发change；相同文字不setter。宿主不能每次无关渲染都写旧search值，遇composition须保留待更新并等待真实提交；权限/窗口清理不能无限等待输入法结束 | 未实测真实中文候选与selection保持 |
| 52pt布局 | `toolbar.m:246/300`自有视图高及reservedTop固定52pt，坐标取真实contentView，fullSizeContent仅诊断。冻结main的notes-header54px、editor-header55px、sidebar-toolbar43px不是可叠加的同一空间；接入须隐藏重复桌面DOM栏、在三栏/画廊/独立窗各保留一次52逻辑像素，并同步真实sidebar/list宽度与可见性 | 未实测main safe-area/titlebar、缩放/2×、窄窗overflow；52pt不是已量测原版像素结果 |

示例 `toolbar_demo.rs` 对状态更新直接 spawn，不能作为生产宿主已串行更新的证明。README已明确本阶段不接main、没有受控截图；该限制保持。正式接入应在最终 FIX03 已验收基线上进行，避免重新从UI缓存取得敏感正文或恢复已失效编辑器。
