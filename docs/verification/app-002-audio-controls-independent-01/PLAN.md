# 音频控件可达性独立源码审计划

2026-11-04。冻结候选 /private/tmp/apple-notes-audio-controls-01，HEAD8893bede25e725e5b55cb397264c3a8ef9ed53b7，产品8a8f995，base6fd3bf8。只读产品，不操作设备、GUI、Rust target、依赖安装或主git。

按 app-002-audio-controls-01 四条合同：真实MediaView/NodeView接线与原生control目标、mousedown/click/dblclick去重与编辑器事件边界；标题按钮的Enter/Space/aria语义和窄屏/44px触摸；controller源码及生命周期原样保全；实际生产NodeView离线浏览器定向复跑，加既有WebM/WAV/错误/lifecycle回归。产品之外的正文/schema/App/bridge/Rust/依赖须冻结相等。

现有216源/3edc4ad0包的移动hiddenexpand失败保留，不与新源码证据混用。Chrome156触摸模拟与preview localStorage不等于Android91 IME、RustACK/冷启动、Mac包或pixel。结果只SOURCE-READY或finding，新APK原生入口/range/±15仍须实际独立验收。

使用既有主node_modules临时只读链接，结束移除。不改产品源码。独立重hash冻结git、作者manifest、保留WebM；typecheck、11helper及两个真实生产浏览器定向脚本。额外缺口只补具体需要的真实生产边界，不复跑无关矩阵。
