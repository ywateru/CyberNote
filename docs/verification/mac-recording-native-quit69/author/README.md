# 69作者源码与受控验证

状态：**SOURCE-READY / RUNTIME-OPEN**，交不同作者独审；没有真实Dock/AppleEvent通过结论。

- 基线：`0f2a1fc1e2c37e716ca122895fe800b6f8d4bda3`
- 产品：`bfbddfe33cb954e2ac0a19d1b3c8c25079a00a8c`
- 工作树：`/private/tmp/apple-notes-mac-recording-native-quit69-01`
- 分支：`task/mac-recording-native-quit69`
- 合同：[任务69](../../../plan/tasks/app-mac-recording-native-quit69.md)，实现边界：[DESIGN](../DESIGN.md)
- 不含任务68菜单补丁；根集成应同时合并两者，再冻结同一准确新包。

## 结果

| 验证 | 命令/结果 | 证据 |
|---|---|---|
| 生产原生bridge受控对象 | `python3 scripts/check-mac-recording-native-quit69.py --output docs/verification/mac-recording-native-quit69/author`；19组PASS；clang含`-Wall -Wextra -Werror` | `native-results.json`、`native-*.stdout.log`/`native-*.stderr.log` |
| 完整应用native编译检查 | `cargo check --locked --offline --manifest-path src-tauri/Cargo.toml --target-dir /private/tmp/notes-native-quit69-target-01 --jobs 2`；exit0 | `cargo-check.log`；13条既有根应用dead_code警告 |
| 实际插件与Rust ABI边界 | `CARGO_PROFILE_DEV_DEBUG=0 CARGO_PROFILE_TEST_DEBUG=0 CARGO_INCREMENTAL=0 cargo test --locked --offline --manifest-path plugins/tauri-plugin-notes-ui/Cargo.toml --target-dir /private/tmp/notes-native-quit69-target-01 --jobs 2 termination69_tests -- --test-threads=1`；3通过、0失败 | `cargo-native-tests.log` |
| 前端类型 | `pnpm typecheck`；exit0 | `typecheck.log` |
| 前端构建 | `pnpm build`；exit0 | `build.log`；保留既有大chunk警告 |
| 格式与patch | `cargo fmt --manifest-path plugins/tauri-plugin-notes-ui/Cargo.toml -- --check`、`git diff --check`；exit0 | 准确产品源码 |

先完整App check，后释放**本任务新建**的822MB check target，使用关闭debug info/incremental的同名独立target执行插件测试，避免低剩余磁盘下再复制编译缓存。未触任何共享/其他任务target。首次native runner因测试host手写getter/setter缺失显式@synthesize而编译失败，补齐测试ivar后最终19组全部通过；没有产品编译错误。node_modules只读依赖通过工作树symlink复用；未改package/lockfiles。

## 生产连接与受控边界

`notes-ui::init().setup`实际调用安装，失败返回插件初始化错误；不是未挂载helper。录音授权主线程入口及授权结果交付前均调用ready；未安装/身份变化不会调用新的OS录音授权。原生安装只认可锁定Tao实际delegate类，保留同一对象，主线程nil→same刷新后再次检查身份、IMP和ABI。

Native runner直接include生产termination.m，只替换NSApp变量为无GUI Foundation host。该host记录delegate可选方法缓存，模拟一次普通quit调用，并验证原生方法返回Cancel和回调。19组包括：应用/delegate缺失、未知类、已有未知方法、错误签名、worker调用、缺失callback、refresh setter异常及重试、安装/路由、精确重复、冲突context、delegate/IMP变化、callback异常/错误、嵌套退出、回调中drop、连续退出、drop后重装。各组独立进程。strong保活检查在nil间隔主动撤销测试原owner，确认原delegate未析构且其他Tao方法IMP未变。

Rust测试禁用默认Mac菜单、无窗口，使用真实Tauri MockRuntime，不创建NSApplication。实际插件setup在测试worker线程明确拒绝未防护运行。生产trampoline调用**实际AppHandle.exit**；锁定MockRuntime的request_exit为unimplemented，测试验证其panic在ABI内被转换为错误、Arc转移引用准确释放。该项不冒充成功派发Wry RequestExit。Wry队列/同步Prevent以及Tao最终app.stop路径按锁定依赖源码绑定；需根准确包真实验证补足。

源码输入清单`source-manifest.json`涵盖354项已跟踪src/src-tauri/plugins/scripts及根构建入口，聚合SHA256：`2e405ee05850b1ae2c4b0052c90a2021b4f793f6696a6301b6a5c3e19a27e466`。`locked-dependency-route.json`绑定本机缓存中实际Tauri2.12.5、runtime-wry2.12.3、Tao0.37.2和muda0.20.0相关路径的内容；两个Cargo.lock版本一致。

## 留给根实际验收

没有启动应用/GUI、创建真实NSApplication、调用真实terminate、发AppleEvent、请求音频、操作设备、改权限/签名/标识或动原Android/旧Mac18。新包需实际Dock退出A录音/B编辑→新进程重开核对原A卡与B正文，并验证失败保全；隐藏、多文档、AppleEvent普通退出覆盖仍开放。强杀/断电/注销不保证。registry全空纯正文放行保持既有行为，本任务不扩展协议，也不宣称所有未保存正文退出均安全。
