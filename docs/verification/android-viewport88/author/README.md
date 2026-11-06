# Android88 作者验证

仅在 Preferences.css 的三处 dvh 声明前增加等义 vh 回退：桌面面板维持 760px 上限与 native-top 退让，移动面板维持整屏高度及内部滚动。支持 dvh 的浏览器继续采用后面的 dvh 声明。没有修改同步、存储、设置结构或其他 UI。

既有真实 React/DOM 场景全部自然退出0：手机设置50项（15.026秒）、桌面设置52项（11.268秒）、手机同步设置56项（8.514秒），均无 pageErrors、输入指纹未变化；设置矩阵覆盖 320/390/800/1280px、明暗模式、设置/数据标签与320×360短屏内部滚动。pnpm build 自然退出0，Vite 阶段1.34秒，保留现有大 chunk 警告。完整原始成功 summary/stdout/stderr 与布局数据随附。

首轮四次调用因提供的 sparse-checkout 缺少已跟踪 assets SVG 而在应用启动前自然退出1；未运行产品断言。仅补齐 sparse-checkout 的 assets 后复用相同产品修改重跑。首轮错误详情见 manifest；没有伪造不存在的首轮原始日志。

这是现代 Chromium156 中的真实前端和隔离 JS IPC/媒体 fixture 验证，不证明旧 Android WebView、Rust/socket 或双端同步。作者没有操作任何设备；旧 WebView 单位支持证据、独立兼容性复核、重出包和实际新包 Android 设置/双向文本媒体验收由根任务继续。
