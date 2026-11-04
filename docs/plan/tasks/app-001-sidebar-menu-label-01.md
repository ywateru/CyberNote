---
id: app-001-sidebar-menu-label-01
scope: mac-sidebar-menu-state-label
status: developing
depends-on: [app-001-sidebar-restore-01]
---

## objective

用户要求侧栏与原版一致。candidate06实际直接恢复与菜单动作均通过，但显示菜单固定“显示/隐藏文件夹”。补齐可见时“隐藏文件夹”、隐藏时“显示文件夹”的实际状态文字。

## context

以docs/ui/macos.md补充契约为准。原版隐藏菜单已有research/mac-sidebar-original-20261104-01；可见菜单为verification/candidate06-mac-sidebar-runtime-01/22-original-visible-menu.ax.txt。

## path

仅src-tauri/src/lib.rs初始标题、plugins/tauri-plugin-notes-ui/src/macos.rs和src/lib.rs既有状态应用/主窗聚焦投影及必要有意义验证。优先复用已成功绑定/更新的main ToolbarState.columns.sidebar_visible；禁止新增IPC/双份状态/DB、改变动作启用与路由、布局、编辑器、搜索、Android。菜单失败独立记录，不把已成功的toolbar标失败；查找真正子菜单内sidebar。

## verification

不同作者独审；实际生产状态到菜单的受控验证覆盖可见/隐藏/恢复、main与独立窗口隔离、旧revision不覆盖及聚焦恢复；必要cargo/平台检查，≥2GiB，不下载升级。root独占Mac GUI，代理不得GUI。共享target由root单独授予。完成源码后root合入出新Mac包，并实际工具栏/菜单双入口、画廊/冷启验收。

## delivery

待开发。
