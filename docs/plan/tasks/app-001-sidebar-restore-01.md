---
id: app-001-sidebar-restore-01
scope: mac-sidebar-toggle-visibility-and-layout
status: done
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

## 主线源码状态 / 2026-11-04

候选1c835b35经不同作者d3ce0e77独审SOURCE-READY，已合入主线；主线d87bcb1上的最小整合build、toolbar13及生产110状态/36隐藏恢复链全部通过，证据于7496ec2封存。唯一运行产品变更为toolbar.m，SHA0deb20826e37511f0654c1c355901ffe10877416fcf98fa8dd32c2cc88c90588。候选manifest中的任务文档身份以冻结提交为准，后续状态补记不回写旧证据。任务继续partial，等新Mac包实际点击/菜单/画廊/正常冷启，不能以源码通过关闭用户故障验收。

## candidate06 实际窗口 / 2026-11-04

准确f18源sealed可执行152ad9e5…已实际启动；列表普通与宽窗隐藏→直接按钮恢复、菜单恢复、画廊浏览/展开、正常CmdQ新PID重启后再次恢复均有限通过。原始证据candidate06-mac-sidebar-runtime-01经不同作者candidate06-mac-sidebar-independent-01只读复核支持；20JPEG不是像素认证，连续窄窗/分栏拖动未验。新发现显示菜单仍固定文案，已追加sidebar-menu-label-01并待新Mac包实际验收后再关闭本用户故障子项。

## 本次用户恢复故障交付

菜单补包准确b5063fd、sealed exe731695ca…实际列表工具栏/菜单双入口、画廊浏览/展开及正常退出冷启恢复通过，独立证据复核candidate06-mac-sidebar-menu-independent-02支持关闭本次功能故障。新包已保留运行。此done仅指本用户报告的隐藏后无直接恢复入口与菜单文案修复；全窗口像素、连续窄窗拖动及完整Notes交互仍属父任务partial。

当前正文包a90e55f/b3c9013f…的同PID89698又实际完成隐藏→菜单恢复、隐藏→直接按钮恢复，完整合成正文和目录计数保持。证据 `verification/mac-sidebar-final-04/`。最后保持侧栏可见；本轮不修改产品源码，不扩展为整窗像素通过。
