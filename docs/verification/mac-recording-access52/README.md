# 52：Mac 显式录音授权预检，源码候选

首版源码固定在 `ef2fe7c3a3de7f8b7644d3ed50e0232a445b5af8`，基线 `a6282ae3a93b1fccfe1bda63b02d752595d1fad7`。独审发现两项资源释放问题后的最新源码是 `f5bc101614dcc2c144f962b41620e70d4f8657b1`，修复与最新结果见本文末尾和 `result-review-fixed.json`；首版 `result.json` 及原日志保持历史身份。分支 `task/mac-recording-access52`，隔离工作树 `/private/tmp/apple-notes-mac-recording-access52-01`。本记录只覆盖52；独立录音窗界面、定向保存、退出保护属于50，未修改其路径，也未整合50产品代码。

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
clang -fobjc-arc -fobjc-arc-exceptions -fblocks -mmacosx-version-min=12.0 -Wall -Wextra -c plugins/tauri-plugin-notes-ui/macos/recording_access.m -o /private/tmp/apple-notes-recording-access52-native.o
clang -fobjc-arc -fobjc-arc-exceptions -fblocks -mmacosx-version-min=12.0 docs/verification/mac-recording-access52/check-native.m -framework AppKit -framework WebKit -framework AVFoundation -framework CoreFoundation -o /private/tmp/apple-notes-recording-access52-native-check
/private/tmp/apple-notes-recording-access52-native-check
```

`result.json`固定源码身份及各产品输入SHA256；日志和harness属于随后的证据提交。独立审查和整合50+52的准确新包实机核验由root继续。

## 独审阻塞修复

独审针对首版复现了两个问题，不能用首版的通过检查覆盖这些失败：

1. getStream已成功、prepare尚未把stream交给start的微任务间隙，dispose先取消prepare，导致轨道既未登记、也未经过迟到清理。原始失败见`handoff-original-failure.log`（stopped=0）。提交 `e2903cc590fab18742ec26b1da586ba37c4a07f2` 在原始流成功回调立即登记Session轨道所有权，dispose随时可以清理，await后不再重新登记。新增4例覆盖两个交接位置、三轨清理及首轨stop抛错，确认每轨恰好stop一次，且不会新建录音器或发成功/错误回调。
2. 系统请求保存completion后抛Objective-C异常，局部强owner/block在原编译模式的异常展开中未释放，晚回调结束后context仍存活。原始断言失败见`native-exception-original-failure.log`。提交 `f5bc101614dcc2c144f962b41620e70d4f8657b1` 把`recording_access.m`独立编译并只为它启用`-fobjc-arc-exceptions`；其他原生文件flags保持原样。异常返回和晚回调仍各自遵守一次交付/延迟释放边界。

`check-review-handoff.mjs`、`check-review-microtask-cuts.mjs`、`check-native-supplement.m`从独审工作树原样复制，方便此目录独立复查。补充native harness仍只替换OS边界，既不发权限也不操作GUI。

| 最新检查 | 结果 | 日志 |
|---|---|---|
| Session授权/生命周期及交接清理 | 15 PASS | `session-access-handoff-fixed.log` |
| 独审最小交接复现 | PASS，stopped=1、recorder=0 | `review-handoff-fixed.log` |
| 独审7种取消切点 × 有/无预检 | 14 PASS | `review-microtask-cuts-fixed.log` |
| 生产门控与原Session回归 | 8、26 PASS | `production-preflight-handoff-fixed.log`、`session-regression-handoff-fixed.log` |
| 原native生命周期与独审FFI/异常补充 | 14、4 PASS | `native-owner-review-fixed.log`、`native-supplement-review-fixed.log` |
| 插件Rust | 20 PASS | `rust-plugin-test-review-fixed.log` |
| 最新公开API编译 / 前端构建 / 宿主离线检查 | PASS | `native-compile-review-fixed.log`、`frontend-build-handoff-fixed.log`、`host-check-review-fixed.log` |

最新源码的产品输入SHA256及不变锁文件检查见`result-review-fixed.json`。补充检查命令如下，native补充必须使用生产同样的ARC异常清理flag：

```sh
node docs/verification/mac-recording-access52/check-review-handoff.mjs
node docs/verification/mac-recording-access52/check-review-microtask-cuts.mjs
clang -fobjc-arc -fobjc-arc-exceptions -fblocks -mmacosx-version-min=12.0 docs/verification/mac-recording-access52/check-native-supplement.m -framework AppKit -framework WebKit -framework AVFoundation -framework CoreFoundation -o /private/tmp/apple-notes-recording-access52-native-supplement
/private/tmp/apple-notes-recording-access52-native-supplement
```
