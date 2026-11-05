# 52：Mac 显式录音授权预检，源码候选

源码固定在 `ef2fe7c3a3de7f8b7644d3ed50e0232a445b5af8`，基线 `a6282ae3a93b1fccfe1bda63b02d752595d1fad7`。分支 `task/mac-recording-access52`，隔离工作树 `/private/tmp/apple-notes-mac-recording-access52-01`。本记录只覆盖52；独立录音窗界面、定向保存、退出保护属于50，未修改其路径，也未整合50产品代码。

## 变更与边界

- 只在显式 Start 的 Mac Tauri 环境，在 getUserMedia 之前动态调用 `recordingAccess()`。无媒体API时直接失败；浏览器、Android和iPad Mac平台标识均不发原生请求。
- 公开 AVCaptureDevice 音频授权 API：已允许放行，拒绝/限制/未知状态报错，只有未决定才异步请求。系统回调后重读授权状态，不能用假值或未知值代替成功。
- IPC 验证注入的真实 Window 与 windowLabel，接受 main、既有 note-* 与精确 `recording-<小写标准UUID>`。录音窗 capability 只授予这一麦克风预检命令，不授予工具栏 default。
- 发起前核对真实 NSWindow/WKWebView；回调中弱引用原窗口和视图，检测关闭/脱离；Rust 回包后再次核对当前调用 Window 的物理身份。WebView ready 安装的只是应用内窗口关闭观察，不查询或请求权限。
- 原生系统等待30秒；Rust 初始回包与回包后身份复核各自最多35秒；Session每个准备阶段45秒。Session取消/超时后不会进入迟到采集。系统提示本身不能被这些截止撤回：未结算时保持单一pending；OS block持有ObjC owner和Rust上下文到真实回调结束，超时不释放仍可能被调用的上下文。
- getUserMedia的迟到stream逐条停止全部轨道；一个stop抛错也继续清理其他轨道。取消/超时不会复活会话。没有增加失焦、隐藏或后台自动暂停。

未修改依赖版本/锁文件、签名、既有可信WebKit媒体permission handler、用户数据或数据库。没有GUI、REA注入、真实权限调用、录音、系统设置操作或TCC修改。公开API的真实编译验证仅证明SDK/FFI接线可编译；native运行测试把OS权限边界替换为受控实现。不能据此声称系统授权、WebKit音轨、真实收音、后台录音或像素验收通过，也不声称预检必然解决adhoc/TCC签名匹配问题。

## 结果

| 检查 | 结果 | 证据 |
|---|---|---|
| 插件 Rust 测试 | 20 PASS | `rust-plugin-test-final.log` |
| 生产 ObjC owner/status，伪OS边界 | 14 PASS | `check-native.m`、`native-owner-final.log` |
| Session新增授权/取消/截止/迟到清理 | 11 PASS | `check-session.mjs`、`session-access-final.log` |
| 生产默认环境及helper接线，伪IPC边界 | 8 PASS | `check-production-preflight.mjs`、`production-preflight.log` |
| 原Session失败注入回归 | 26 PASS | `session-regression.log` |
| 生产ObjC公开API编译 | exit0，无诊断 | `native-compile-final.log` |
| TypeScript | PASS | `typecheck.log`及最终`frontend-build.log`中的`tsc -b` |
| 前端生产构建 | PASS | `frontend-build.log`，含独立native helper产物 |
| Mac宿主离线locked检查 | PASS | `host-check.log` |
| diff空白与锁文件差异 | PASS / 无差异 | `result.json` |

首次插件编译因当前Tauri feature集合没有 `AppHandle::get_webview` 而失败，原始日志保留在 `rust-plugin-test.log`。已改用现有公开 `get_webview_window(...).with_webview(...)`，最终20测试和宿主检查通过。最终前端构建仍有现有主chunk体积提示；宿主有4项现有dead-code warning，均未导致失败。

## 可复查命令

在上述工作树执行，node_modules只读链接复用现有安装，Rust target独占 `/private/tmp/apple-notes-recording-access52-target`；不下载依赖。

```sh
pnpm typecheck
pnpm build
node scripts/check-recording-session.mjs
node docs/verification/mac-recording-access52/check-session.mjs
node docs/verification/mac-recording-access52/check-production-preflight.mjs
cargo test --manifest-path plugins/tauri-plugin-notes-ui/Cargo.toml --lib --locked --offline --target-dir /private/tmp/apple-notes-recording-access52-target
cargo check --manifest-path src-tauri/Cargo.toml --lib --locked --offline --target-dir /private/tmp/apple-notes-recording-access52-target
clang -fobjc-arc -fblocks -mmacosx-version-min=12.0 -Wall -Wextra -c plugins/tauri-plugin-notes-ui/macos/recording_access.m -o /private/tmp/apple-notes-recording-access52-native.o
clang -fobjc-arc -fblocks -mmacosx-version-min=12.0 docs/verification/mac-recording-access52/check-native.m -framework AppKit -framework WebKit -framework AVFoundation -framework CoreFoundation -o /private/tmp/apple-notes-recording-access52-native-check
/private/tmp/apple-notes-recording-access52-native-check
```

`result.json`固定源码身份及各产品输入SHA256；日志和harness属于随后的证据提交。独立审查和整合50+52的准确新包实机核验由root继续。
