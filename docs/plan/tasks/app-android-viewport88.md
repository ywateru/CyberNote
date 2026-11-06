# APP-ANDROID-VIEWPORT88 设置视口兼容

状态：in-progress。由sync87实际Android17/API30验收触发；不改变同步协议或设置结构。

cycle08实际固定trace在pair-device-name失败：viewport360×568，设置面板height1579.5且y-505.75，名称输入框y807.75，屏外且无IME。原始脱敏诊断在`/private/tmp/notes-sync87-native-actual-01/pair-ui-failure-1793966933757.json`。先由sole-device作者只读确认CSS.supports与实际computed值；不注入样式或绕过屏外输入。

若确认旧WebView不支持dvh，Preferences.css在桌面min高度及手机height/max-height的dvh声明之前提供等义vh回退。保留现代dvh优先、设置/数据两个标签、内容区内部滚动、桌面760px限制及原生顶部退让。无需更改业务逻辑或用户数据。

作者仅修改必要产品CSS和有关文档，使用受影响设置/同步布局检查及build；不同代理独立复核旧视口语义和现代布局。修复合入后准确重出Android18与Mac28并独立核包，更新immutable peer的受影响前端输入回执。sole-device作者只在5584同userdata升级新准确APK，不碰原录音现场；实际设置可见、名称/邀请可输入、双向完整正文/媒体及重开冷启继续为sync87门槛。原Android17失败保留，不追认旧包已修。
