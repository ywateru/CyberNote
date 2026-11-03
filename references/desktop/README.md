# Mac 原版截图

本机 macOS 26.4 / Notes 4.13 (3146.101.28)，2026-11-03 采集。所有 PNG 来自 CUA 读取指定 Notes 窗口。窗口1088×660pt，截图2176×1320px（2×）。测试文件夹 Notes Clone UI 对照，文案均为新建的无敏感测试内容。

- macos26-list-editor.png：三栏主窗，普通文本编辑状态。
- macos26-format.png 与 .ax.txt：格式面板。
- macos26-media.png 与 .ax.txt：媒体菜单。
- macos26-note-menu.png 与 .ax.txt：笔记更多菜单。
- macos26-view-menu.png：视图菜单。

紫色屏幕共享标记与指针高亮来自采集环境，不能纳入应用设计。截图中的原版账户名称仅作为原版所在环境记录，正式克隆使用本地设备分组。

REA 已验证原程序路径/哈希，但 observe_native_ui 因 Accessibility 权限被拒绝；未获得原生 UI Evidence。`rea-evidence-initial.json` 是真实导出（0 records），不支持 UI 一致结论。原程序路径 `/System/Applications/Notes.app/Contents/MacOS/Notes`，SHA-256 `9e20c23a979367362c50edf8fb28bb1988be7e7384254cc3dce38a4a8373df02`。

用户解锁后已续采：

- macos26-gallery.png：测试文件夹的画廊。
- macos26-gallery-open-note.png：双击后同窗编辑，保留侧栏，返回回画廊。
- macos26-paste-plain.png：新建后纯文本粘贴为普通正文。
- macos26-checklist.png：清单状态（采集前一次AX动作报错，但后续画面证实勾选发生，不能只靠异常判断未执行）。
- macos26-table.png、macos26-table-menu.png、macos26-table.ax.txt：2×2表格、单元格内容和操作。
- clone-initial.png、clone-list-editor-first.png：首轮克隆实际主窗，用于差异定位，非原版参考。
- macos26-list-editor-active.png：解锁后重新采集的三栏；尽管文件名含active，该帧工具栏呈失活外观，不能据此比较激活颜色。
