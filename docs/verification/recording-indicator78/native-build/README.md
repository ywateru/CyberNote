# Mac23本地构建

2026-11-06。构建源52056b4a（产品/runner与已整合e4276d8b完全相同，其后只有调试文档整理）。`CARGO_NET_OFFLINE=true pnpm mac:build`自然exit0，完整35.423秒；279个跟踪构建输入在构建前后字节相同。完整输入、资源、文件清单和命令exit/wall见result.json，原始stdout/stderr保留各log，build-driver.py是当次执行脚本。

产物位于`artifacts/recording-indicator78/`：

- `mac-original.app`：Tauri构建原件完整复制，严格签名验证自然exit1，保留“code has no resources but signature indicates they must be present”原始失败。
- `备忘录.app`：原件的独立副本，单次本地adhoc签名后`codesign --verify --deep --strict --verbose=4`自然exit0。仅主可执行及CodeResources改变，原件前后保持。
- `备忘录-Mac23.zip`：由通过签名检查的副本归档，5014535字节，SHA256 `9c28504a718e7924834a98ff941e718c385de9cfe42b8586b67b98e94d57a6ec`。

派生可执行SHA256 `21f47cc9efbebd9ae928b27ff0900cdffedcbd2b761d7e31910964aa7ffd9335`。本次前端资源为index-CCe0bfBw.js、index-DY8u7lO1.css、native-recording-access-CHwsSY6L.js，逐项哈希和HTML身份已记录，内嵌资源独立解码另见native-independent。

此包为本机arm64开发包，无Developer ID或公证；未启动、替换或退出当前应用，未操作用户笔记或原Android现场。构建和包身份不能替代原生麦克风、WKWebView运行或Apple Notes整窗像素验收。
