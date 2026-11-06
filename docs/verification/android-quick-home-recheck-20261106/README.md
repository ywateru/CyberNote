# Android 快速画廊首页复验

2026-11-06，根据用户三张参考图复核工作区既有的快速画廊实现。本次未改动产品源码。

- 命令：`pnpm debug group quick-home --mobile --out /private/tmp/notes-android-quick-home-recheck-20261106-01`。
- 自然退出码：0；45 项断言全部通过，页面错误为空。
- 测试记录来源提交：`a8687e87f2d6a25ef66dae140ffd4f20acb3638a`。
- 运行前后 135 项输入指纹一致：`f76443c5336b5055ffcbcd48d7b0a86e7e8791a9a8981ed54fe47b4ceae43665`。
- `pnpm exec tsc -b --pretty false` 自然退出码 0。

覆盖启动直接进入全部有效笔记画廊、唯一黄色添加按钮、实际点击与新编辑器精确聚焦、连续点击单次创建、保存与重载、来源文件夹与返回、失败及迟到响应、锁定摘要保护、设置/数据两个标签，以及图片附件和合成录音保存。布局覆盖 320/390/430/800px、浅深主题、短屏最后卡片可滚动至添加按钮上方，以及卡片字号放大 200%。完整断言见 summary.json，几何见 quick-home83-layout.json。

这是实际 React/Tiptap/DOM 和应用处理器的受控浏览器验证；设备与持久化边界使用隔离 fixture。没有操作原 Android 设备、未保存录音现场、真实麦克风或用户笔记。实际 Android 输入法、系统选图以及安装包 WebView 运行未由本轮复验替代。

既有 Android 构建16安装包 `artifacts/mobile-home8283/备忘录-Android16.apk` 本轮只读重算 SHA256：`26a9d3a9fcd42cd89d9e5e43117b67e2fbf3ff2c20e684322d8cb31488e3dc60`，与原交付记录一致。该包的准确构建来源仍为 `1f735ebe4881399699b6ba769e29f82a52278e7c`；本轮未重新构建或安装。
