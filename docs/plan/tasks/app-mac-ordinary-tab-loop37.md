---
id: app-mac-ordinary-tab-loop37
scope: Ordinary Mac folder dialog Tab focus loop
status: in-progress
depends-on: [app-mac-keyboard-policy35]
---

## Objective

修正普通Mac新建文件夹表单Tab离开名称到HTML内容的实际差异，尊重当次系统键盘导航策略。原版37和31连续Right/Tab或直接Tab都重新全选名称；准确Mac13 runtime36的17/19仍HTML失焦，18 ShiftTab返回名称。35公开WK策略同步保留，不把该机制PASS扩大为对话框循环通过。

## Context

读docs/INDEX.md、docs/ui/smart-folders-macos.md、docs/verification/mac-typography-keyboard-runtime36/README.md、docs/research/mac-folder-tab-loop-original37/README.md、task35及插件现有真实window主线程边界。用户要求完整原版交互，当前不改系统设置，不做原版删除实验。

## Contract

仅native macOS主窗、普通新建文件夹（非mobile、非编辑folder、draft.smart=false）局部Tab/ShiftTab。必须有当次可信系统策略，不能默认false、modal-open缓存或异步值冒称同步读。可新增window限定只读keyboard_navigation command，主线程读取公开NSApplication.isFullKeyboardAccessEnabled，回传明确bool；不更改系统/WK设置、不依赖toolbar绑定、不访问笔记数据。

局部form同步preventDefault后再查询/导航是一种允许方案。系统关闭时循环仅名称，回到名称并select，即使原已focus也选全。系统开启时仅在本表单真实可用可见控件中按DOM顺序循环、Shift反向，不能把checkbox/按钮永久剔除。开启态顺序仅受控可访问性契约，尚无原版真实开启态完整证据，必须保留这个验收边界。不得在window吞Tab/改NSEvent；Option/Ctrl/Cmd修饰、组字、已defaultPrevented事件让行。OptionTab原版插入字面TAB另项开放，不混入本次。

若采用异步桥接，连续Tab须按序完成且每次读取；关闭/切换智能/提交busy/卸载/窗口销毁，以及用户点击、其他按键或另行聚焦后，旧回复不得抢回焦点。失败必须显式作为失败处理，不静默伪造bool；保持草稿和值，错误显示沿现有可访问形式，不暴露工程细节。避免UI新增不必要文案。

Enter/Escape、普通输入/选择/组字、正常保存/取消、原生搜索、Android和智能表单不改。保留像素/样式，禁止新增依赖、锁变更或全部表单trap。若现接缝不能可靠实现上述契约，先报告具体阻塞，不做不可信降级。

## Path

隔离worktree由root创建，develop_app唯一实施。允许src/SmartFolderForm.tsx、src/native-notes-ui.ts（若实际桥接名称不同按现有边界）、plugins/tauri-plugin-notes-ui/{guest-js/index.ts,src/lib.rs,src/macos.rs,macos/keyboard.m,permissions/*,README.md}及必要自动生成权限schema；不得扩张宿主/其它插件/依赖版本/锁/共享缓存。实际必要路径由作者在实施前报告。证据仅docs/verification/mac-ordinary-tab-loop37/。

## Verification

作者离线typecheck/必要Rust检查，使用已有依赖和独立自有target。真实App生产表单受控测试覆盖false Tab/Shift/Right后Tab、true正反顺序与disabled、每次系统值变化、快速连续导航/逆序异步回复、取消/模式切换/其他点击键入后迟到reply、失败保草稿、组字/修饰键/Android/智能/搜索边界。真实原生查询/主线程/window身份及closed失败需有限原生或集成证据，mock不能替代整条接线。不同作者独立审查已提交源码；之后准确新包Computer Use再比较原版，源阶段不得关闭实际差异。记录全部失败和限制，保留既有缓存/数据/输出，不下载或改系统设置。

2026-11-05 root START37：隔离/private/tmp/apple-notes-ordinary-tab-loop37-01，分支task/mac-ordinary-tab-loop37，基线26648d88021adf3abdcfdfe879453a3b36866613。实际桥接拆分src/native-keyboard.ts与src/ordinary-folder-keyboard.ts，插件build.rs/自动生成权限加入新只读command，宿主capability不改。node_modules只读复用，独占Rust target；作者待固定提交/不同作者独审，尚未准确包验收。
