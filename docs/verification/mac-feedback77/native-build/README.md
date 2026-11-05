# Mac22：截图修正77本地应用

2026-11-06，主线源码 `c0b368aeb2de5b55b5aba70ea1c998b52483a173`。离线环境 `CARGO_NET_OFFLINE=true` 运行 `pnpm mac:build`，自然退出0，完整wall 16.429秒。279项跟踪构建输入前后完全相同；原始构建日志、逐项输入/文件SHA及命令记录见[result.json](result.json)。前端build和原生release构建成功，13项既有Rust warnings按原样保留。

可交付派生应用：`artifacts/mac-feedback77/备忘录.app`，ZIP `artifacts/mac-feedback77/备忘录-Mac22.zip`（5014273字节，SHA256 `40cce79f87f27d44a3849e8e8981201d5073f3621ee7551b38de09098df93b2c`）。派生主执行文件SHA256 `6c6f063ac9c07e6ef470d4b5c7303b4e4bf38988197690b48396e79c8f85e37a`。本地arm64 ad-hoc签名，strict/deep verify自然exit0，无公证/开发者分发认证，也没有安装或启动该包。

构建器原始包完整保存在 `artifacts/mac-feedback77/mac-original.app`。其strict verify exit1，原始错误“code has no resources but signature indicates they must be present”保留于verify-original.log，没有改原件或伪报通过。复制到单独派生.app后一次完整adhoc签名，签名及严格验证均exit0；只允许主执行文件与CodeResources变化，原件逐文件身份保持。ZIP由已严格验证的派生包生成。

本轮是新包构建/签名和源码来源记录，真实Mac/WKWebView交互及整体原版像素没有由该记录自动证明。独立核包另见[核包报告](../native-independent/README.md)。原Android现场保持原状，未构建或安装APK。

独立核包已通过：`7d179a40`，自然exit0、完整wall1.41秒。原包及派生包内嵌主JS/CSS/native-recording JS分别Brotli解码后与当前dist逐字节一致；HTML由498字节序列化为478字节，完整有序token/属性/非空文本/注释规范化一致，不冒称HTML原始字节相同。279跟踪输入与c0b368ae准确Git字节一致，派生strict验签、ZIP逐文件字节/CRC/权限通过，产物前后身份保持。详见独立核包报告。
