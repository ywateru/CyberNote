# 更新连接界面主线整合

2026-11-06。仅接收独审通过的换址UI `66958c1d`，主线对应 `05ee05ee`；独审原件 `7ce136da` 对应主线 `a8687e87`。native工具和路线runner未随本次UI接收进入主线，host输入回显P2仍由原作者修复；真实wss仍等待后端TLS修复。

|运行|自然退出|外层实测秒|
|---|---|---|
|桌面同步设置56项|0|21.867|
|手机浏览器同步设置56项|0|22.039|
|pnpm build|0|18.647|
|生产调试入口排除|0|5.567|

前三项并行，生产排除在build通过后运行。实际argv/源码commit/时长见各execution.json；原始stdout/stderr、summary、HTML/几何和两种尺寸截图保留。运行时只写 `/private/tmp/sync87-main-reconnect-integration-01`，所有runtime退出后再复制本目录，未改测试断言。build保留现有chunk-size warning。

135文件源码指纹前后相同：`f76443c5336b5055ffcbcd48d7b0a86e7e8791a9a8981ed54fe47b4ceae43665`，gitDirty=false；页面均无未捕获错误。范围为真实React/App DOM及显式本机IPC fixture；不证明Rust连接、实际隧道、Android安装或原版像素。原Android录音现场未操作。最终完整同步目标保持active，所有受影响产品主线完整回归与准确包仍待后端和真实DOM整合。
