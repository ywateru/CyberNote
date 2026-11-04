---
id: app-001-sidebar-menu-label-01
scope: mac-sidebar-menu-state-label
status: done
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

生产仅3个文件：菜单初始文字“隐藏文件夹”；原生模块复用当前main绑定的columns.sidebar_visible，在bind/update成功后与Focused(true)同步既有子菜单内sidebar标题。独立窗不写主窗菜单；不新增IPC、状态副本、存储字段，不改布局/启用/动作。菜单错误单独记录，不改变成功toolbar结果。插件离线16项测试和桌面宿主cargo check --lib通过；新增3项生产投影/受控菜单sink检查覆盖主窗三布局显示→隐藏→恢复与重新投影、独立窗口与未绑定隔离、真实revision/绑定门禁和菜单错误不变更当前状态。精确命令/日志/身份及限制见 `docs/verification/app-001-sidebar-menu-label-01/`。仅编译API，不创建真实AppKit菜单或GUI；root需出新Mac包完成两种入口、画廊、切窗、冷启实际验证。等待不同作者审查。

## 实际包交付

8bfeb43经72ad237独审SOURCE-READY后合入主线，准确b5063fd实际离线Mac补包exe731695ca…已构建/独核。root在真实新包中验证可见“隐藏文件夹”→隐藏“显示文件夹”→恢复，工具栏/菜单双路径、画廊浏览/展开与正常冷启通过；candidate06-mac-sidebar-menu-independent-02对28项有限记录断言支持。仅完成此状态文案子项，独立窗实际焦点与完整像素未追认。
