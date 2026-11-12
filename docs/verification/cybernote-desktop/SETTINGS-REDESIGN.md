# 设置页重构验证

2026-11-07。按最新要求直接修改现有界面，本轮没有调用图片生成模型。实现规则见[设置页规格](../../ui/preferences.md)。

## 结果

设置改为五分类：外观与字号、备忘录、设备同步、存储空间、导入与备份。桌面使用分类侧栏和内容面板；移动端使用分组首页及带返回、完成的全屏子页。两个字号保留既有五档配置并各自预览，选项即时保存；保存失败在设置内提示。

原生顶部栏消失源于 `contentOverlay` 的隐藏布局分支。现在保留按钮组、标题、计数和搜索的位置，设置期间只禁用操作。关闭后恢复状态。Web 主界面通过 inert 防止操作穿透，遮罩从顶部栏下缘开始。

存储和备份分开显示但共享保留实例，保留文件筛选、分页、滚动及在途结果；备份不依赖存储采样成功。同步独立懒加载，离开清除可见配对值。Apple 备忘录复制导入继续限制在 Mac 主窗口，保留现有保存和取消流程。

权限恢复回归发现表格控件清理时访问已销毁的编辑器视图。本轮改为保留挂载时的视图引用以移除事件监听，消除了卸载异常；表格编辑和历史回归通过。

## 验证

输出根目录：`artifacts/preferences-redesign/`。最终汇总：[verification.json](../../../artifacts/preferences-redesign/verification.json)。

| 范围 | 结果 | 证据 |
| --- | --- | --- |
| 桌面设置 | 141 项通过：入口、五分类、键盘、保存错误、持久化、五字号与浅深布局、状态保留、权限及迟到结果 | [desktop-final/suite.json](../../../artifacts/preferences-redesign/desktop-final/suite.json) 中 preferences 组 |
| 桌面同步 | 56 项通过 | 同一 suite 的 sync-settings 组 |
| 数据管理 | 33 项通过 | 同一 suite 的 data-management 组 |
| 存储及备份恢复 | 99 项通过：采样、权限、原文件导出、备份、录音保护、无快照恢复、导航 | [desktop-storage-overview/suite.json](../../../artifacts/preferences-redesign/desktop-storage-overview/suite.json) |
| 移动设置 / 同步 | 157 + 56 项通过：分级导航、窄屏、五字号、深色、状态及配对清理 | [mobile-final/suite.json](../../../artifacts/preferences-redesign/mobile-final/suite.json) |
| 原生设置覆盖层 | 几何和可见性保持，按钮和搜索禁用；旧搜索确认、IME、恢复与过期状态检查通过 | [native/overlay-result.json](../../../artifacts/preferences-redesign/native/overlay-result.json) |
| 原生工具栏 | 22 项控制器回归通过；40 个 AppKit 外观、几何及渲染用例通过 | [toolbar-tests.log](../../../artifacts/preferences-redesign/toolbar-tests.log)、[native-appearance.log](../../../artifacts/preferences-redesign/native-appearance.log) |
| 表格与编辑器 | 表格实际编辑、行列菜单及历史检查通过；96 个文档用例与状态、历史检查通过 | [table-tests.log](../../../artifacts/preferences-redesign/table-tests.log)、[editor-tests.log](../../../artifacts/preferences-redesign/editor-tests.log) |
| 生产前端 | TypeScript / Vite 构建和调试 API 排除通过 | [mac-build.log](../../../artifacts/preferences-redesign/mac-build.log)、[production-check/summary.json](../../../artifacts/preferences-redesign/production-check/summary.json) |

浏览器回归共 542 项通过，使用真实 React 控件和既有处理函数，系统及持久化边界使用隔离协议数据。AppKit 验证使用独立原生窗口。本轮未操作用户笔记，也未执行 Android 真机或真实 Apple Notes 来源导入。Apple 导入的原有业务逻辑保持，入口改到导入与备份。

桌面综合运行中的存储组最初因静态测试包未暴露动态导入的测试辅助模块失败；补齐测试运行环境后独立重跑该组，99 项通过。原日志保留；最终汇总按实际通过组汇总，不把此前整个综合运行标为通过。

## 实际界面截图

以下均为应用实际运行截图，使用合成笔记数据。

- [桌面：外观与字号](../../../artifacts/preferences-redesign/desktop-final/settings-1280-light-settings.png)
- [桌面：设备同步](../../../artifacts/preferences-redesign/desktop-final/settings-1280-light-sync.png)
- [桌面：存储空间](../../../artifacts/preferences-redesign/desktop-final/settings-1280-light-data.png)
- [移动：首页](../../../artifacts/preferences-redesign/mobile-final/settings-390-light-home.png)
- [移动：外观与字号](../../../artifacts/preferences-redesign/mobile-final/settings-390-light-settings.png)
- [320px 深色](../../../artifacts/preferences-redesign/mobile-final/settings-320-dark-settings.png)

## 本机产物

[CyberNote.app](../../../artifacts/preferences-redesign/release/CyberNote.app) / [ZIP](../../../artifacts/preferences-redesign/release/CyberNote-macOS.zip)。macOS release 构建成功；沿用项目 entitlements 本地 ad-hoc 签名，ZIP 解压后的严格签名及全部文件哈希一致性通过；来源及归档校验见 [manifest.json](../../../artifacts/preferences-redesign/release/manifest.json)。没有替换此前交付包或安装到系统应用目录。
