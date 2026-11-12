# 桌面设置按图 2 校准

2026-11-07。针对用户提供的第二张参考图，直接修改实际桌面设置界面。

- 取消横贯面板的标题栏，将“设置”放在左侧分类栏顶部，右上角保留关闭按钮。
- 1440×1000 视口下，面板 920×660，位置 x260 / y170，侧栏 196px；内容起点、卡片、分段控件和预览间距按参考校准。
- 外观下拉改为跟随系统、浅色、深色三张卡片；界面字号和编辑器字号改为五档分段选择，行尾展示当前值。
- 使用浅灰侧栏、白色正文、浅黄色选中态和浅色背景遮罩，沿用深色模式变量。
- 控件继续调用原设置保存函数；使用 radio 分组语义，支持方向键、Home / End、Tab。保存中保留焦点，阻止重复提交。
- 焦点约束只计入实际 Tab 停靠点，避免将未选中的 radio 或分类加入首尾焦点循环。

实际截图：[1440×1000 桌面设置](../../../artifacts/preferences-reference/desktop/settings-reference-1440.png)。

验证：[汇总](../../../artifacts/preferences-reference/verification.json)。桌面 144 项、移动设置 157 项通过，包含主题及五字号、浅深外观、窄屏 / 短屏、控件保存与重新加载、错误反馈、分类状态保留、备份在途、权限变化、焦点及原生保护投影。图 2 尺寸使用实际 DOM 几何断言；浏览器使用隔离协议数据，不代表真机 OS 验证。本轮无需重复执行未改变业务的完整编辑器 / Rust 套件。

本机产物：[CyberNote.app](../../../artifacts/preferences-reference/release/CyberNote.app) / [ZIP](../../../artifacts/preferences-reference/release/CyberNote-macOS.zip)。构建记录见 [mac-build.log](../../../artifacts/preferences-reference/mac-build.log)，签名和 ZIP 解压后的文件一致性见 [manifest.json](../../../artifacts/preferences-reference/release/manifest.json)。本地 ad-hoc 签名，保留上一轮产物。
