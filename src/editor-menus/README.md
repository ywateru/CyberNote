# 编辑菜单

App 创建 `AppMenus`，按 surface、format、media、table、note、view、folder、app 分组传入明确 props。组件拥有实际菜单 JSX、图标/分隔/子菜单、能力禁用、右键位置及位置观察器；`FormatControls` 拥有格式控件和局部颜色选择。可见性、格式书签与焦点仍唯一归 EditorSession，MenuSurface 仍负责嵌套层和最内层关闭。

调用链：用户展开 → EditorSession 捕获目标 → App 组装对应菜单 → 菜单调用领域动作。普通编辑语义通过 `executeEditorCommand`，Web 格式/表格入口和平台原生命令共用目录。原生调用先经过 NativePlatform 原有 scope、授权、Editor、版本、书签核验，再执行同一目录；目录本身不代替领域授权，也不保存工作区或 Editor。

生命周期：菜单卸载释放位置 ResizeObserver、滚动/resize listener；格式面板与普通菜单独立渲染，打开普通菜单不会关闭手机格式面板。已有 MenuSurface 层级与 Android Back 优先级保留。保存、分享、移动、锁定等业务仍调用根的原领域控制器，不新建保存队列。

MODULES98 开发回归：mobile-editor、note-move-menu、TABLE95 真实 App 转换及原生 intent、SESSION96 格式/局部菜单返回均通过，证据 `artifacts/modules98-menu-*`、`artifacts/modules98-platform-*`、`artifacts/modules98-final-menu.log`。真实 AppKit 菜单/第一响应者仍由 FINAL101 实包验证。
