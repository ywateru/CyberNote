---
id: app-001-sidebar-restore-01
scope: mac-sidebar-toggle-visibility-and-layout
status: awaiting-review
depends-on: []
---

## objective

修复用户实际报告的桌面“隐藏文件夹后无法再次显示”。按docs/ui/macos.md新增原版实测契约保留左上直接恢复按钮，修正对应标题、返回按钮布局与窄侧栏优先级；检查原有菜单切换。先完成最小可交付修复，之后同candidate06出包做实际窗口验收。

## context

- docs/INDEX.md、docs/ui/macos.md“文件夹侧栏隐藏与恢复”
- docs/research/mac-sidebar-original-20261104-01/ 原版01–04与克隆05–07
- plugins/tauri-plugin-notes-ui/README.md、macos/toolbar.m
- src/native-toolbar-state.ts、src/native-toolbar-controller.ts、src/App.tsx

## path

优先仅plugins/tauri-plugin-notes-ui/macos/toolbar.m布局，若确需动态无障碍提示可同文件窄改；必要src/native-toolbar-state.ts、受影响检查脚本、本任务文档与新证据目录。不得改存储/锁/依赖/录音/标签/共享协议，不用改数据或重建编辑器绕开布局问题。根负责全部Mac GUI，代理不操作GUI。

## verification

- 直接调用生产布局检查列表/画廊浏览/画廊展开的隐藏→恢复，宽/窄窗口及160/228等合法侧栏宽，文件夹按钮始终直接可见、可命中，标题/返回/列表操作互不重叠，不进overflow；独立窗无按钮。
- 检查真实动作→现有意图→React侧栏状态仍接通；现有菜单恢复路径不丢失。保持搜索实例、查询与焦点处理；普通显示三栏宽工具栏回归。
- pnpm build、原生toolbar检查、严格ObjC语法和相应生产几何检查。仅必要有意义测试，不扩展大量同构检查。
- 保留原失败/限制；不把源码受控检查称为安装版或像素通过。源码提交后由不同代理审查。
- 不下载/升级/清理/平台构建；不占Rust共享target。输出前>=2GiB；待root合入、统一构建和实际窗口往返/菜单/重启验收。

## delivery

产品仅窄改toolbar.m布局：隐藏时直接toggleSidebar，newFolder随侧栏移除；160pt可见侧栏优先toggle、新建进overflow；标题/返回避让。110个生产布局状态、36条同控制器隐藏恢复链通过，旧源码36个隐藏失败均复现，正常228pt侧栏三栏与独立窗逐字段回归通过。pnpm build、13项原生toolbar控制器检查、严格ObjC语法均exit0。证据在 `docs/verification/app-001-sidebar-restore-01/`，含两次几何检查接缝失败原始材料。未运行真实包/GUI/Rust target；待不同作者独审和root整合后实际窗口验收。
