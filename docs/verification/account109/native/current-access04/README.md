# Current desktop access 04

准备 relogin04 时，父级已有 native Chrome handle 的一次只读 AX 检查明确返回 Mac locked。记录日期为 2026-11-13，结果生成时间见 result.json；精确 AX 时间未单独返回，不把生成时间当成精确操作时间。未保存原始错误、AX、截图、浏览记录或系统凭据。CUA 部分已结束。

新 source `920fa9cf` 的 GUI 已构建、独立核包，runner pin 已准备；本次尚未启动 App、原库运行或新的 OAuth。单独本地只读检查确认 `/private/tmp/account109-desktop-relogin04` 不存在、没有 notes-clone 进程。没有发起 ADB/网络探测或改变系统设置，也未尝试绕过锁定。正常解锁后才能继续真实系统浏览器重新认证。

此前 relogin02/03 的 GUI ready 与当前锁定不矛盾，按各自时点保留；本次不解释历史 scope 故障或 WebView 超时。手机协调服务可达性仍是另一独立条件。
