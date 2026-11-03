# Android d9a5be5 有限失败证据

2026-11-03，独立实际 Android UI 验证。结论与边界见 `docs/plan/reviews/app-001-fix-03-android-01.md`。

本目录仅包含合成输入、可见 UI、设备/WebView 运行环境及安装包身份。普通保存因 WebView 91 缺少 `crypto.randomUUID` 阻断，未执行锁定/冷启动后续步骤。应用既有私有数据没有导出或清除。

`save-failure-environment.json` 保留尚未落盘的完整合成文档与真实 selection；这份只读快照不表示生产保存成功。截图和 DOM 读取只用作观察，所有创建/输入动作通过 Android 原生触摸和按键执行。

`integrity.sha256` 校验本次证据文件（不包含该清单自身）。
