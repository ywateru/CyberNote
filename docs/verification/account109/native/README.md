# Account109 原生接入阶段验证

本阶段实现原生账户 owner、持久单账户绑定、CyberGrid 发现与实际 TCP map、签名 enrollment 自动 Noise 配对和持续授权 gate。编译和本地契约测试通过；尚未进行产品 App 的真实 Logto 登录、两端 CyberGrid 连通和 Android 安装/回跳验收，不能据此称端到端完成。

后续 `a9b62a3e` 修复账户 foreground 额外创建手工服务的入口，账户 9 项及手工 adapter 7 项通过；准确旧版反例、工具失败分类、Android 原生库链接与隔离构建准备见 [foreground 隔离记录](FOREGROUND-ISOLATION.md)及 `foreground-checks.json`。该修复后的 exact 主线候选 APK 尚未构建或安装。

## 实现与状态边界

- `src-tauri/src/account/` 由 App 持有，设置页关闭不影响 owner。IPC 只接收严格 DTO，返回安全状态；token、grant、enrollment proof、邀请和 Noise 私钥不传到 JS。
- Pauli 的 `crates/account-auth` 负责 PKCE、state/nonce、ID 签名、grant 持久化与 refresh rotation。显式错误状态的重新登录先封网，成功 logout 后才开始新授权；撤销失败返回 `account_cleanup_required`，保留同一 owner 供重试。正常已登录状态拒绝覆盖授权。首次 bind 失败会撤销已提交的 grant；已有绑定的离线恢复保留授权。
- 账号 profile 的 issuer/subject/product/workspace 与持久 binding 必须一致。已有手工 workspace 或其他账号 workspace 拒绝接管，不删数据。首次登录默认暂停，只有用户确认启用才激活原 Store 同步空间。
- SDK 真正发布两个 TCP port、枚举在线设备并建立 enrollment/sync mapping。双向交换的 ES384 proof 仅由固定 coordinator JWKS 验证；Noise 一次授权约束预期 key/device。已有版本向量、附件原字节、Prepared/Ready 和 Session apply 管线复用。已消费 enrolled pin 跨重启/续期复用，不因目录轮询无限创建邀请。
- 账号同步服务的每次 Noise 握手及双向 RPC 都检查 local/remote proof TTL、owner 代际、SDK 协调状态和 Noise pin。关闭 gate 不可重新打开。退出/暂停/取消先封 gate，再收 mapping、listener、SDK 和同步 worker；迟到授权不能恢复旧代连接。
- Mac arm64 用系统浏览器和严格 `127.0.0.1:17897/callback` listener。Android arm64 用 opener 和专属 `com.local.notesclone.auth://callback`；provider 从 ApplicationInfo 读取 nativeLibraryDir，并从 ConnectivityManager 获取当前 DNS，要求 API 28+。清单保留原包身份、备份隔离和 IME 行为，增加精确 VIEW filter、ACCESS_NETWORK_STATE 和 provider 提取配置。
- 原 SDK/provider 冻结 f2a3961536e5c69b13c7dbc661953d9243becbae，保留许可证、通知与 SOURCE.json。只声明 Mac arm64 和 Android arm64 provider 支持。

## 检查

本表对应 `92c6ffb9` 阶段，源文件指纹、命令、原始日志路径和 SHA256 见 `checks.json` 的 `sourceCommit`；本轮安全编译/测试日志的归档副本在 `logs/`。归档仅移除末尾空白行，`originalSha256` 保留原日志指纹，`sha256` 对应归档字节；不更改 vendor notices、模块日志或 SDK pin。全部检查使用共享 target `/private/tmp/cybernote-account109-target`、jobs=2、dev/test debug=0、incremental=0。

| 检查 | 结果与范围 |
| --- | --- |
| Mac `cargo check --locked --lib` | 原生 owner、SDK、插件和生命周期接线编译 |
| Android arm64 `cargo check --lib --target aarch64-linux-android` | NDK27.2/API28 JNI、provider 与 callback 分支编译；不是 APK/设备验证 |
| 原生 `account::` | 8 项：严格 IPC、错误重认证策略、真实 TCP callback Host 负例、私有绑定/权限/重启、ES384 owner/字段/签名负例、真实 Store 保文档和拒绝 legacy workspace |
| 原生 `sync::` | 32 项：包括实际加密流封 gate、enrolled pin、64MiB 附件、stale recovery 与既有同步回归；新增实际 StartHost 后拒绝账户接管及账户暂停路径保持原手工同步 listener/config/workspace |
| enrolled pin 续期 | 纳入上述 32 项：重启后消费 pin 的 70 次续期及错误 key 拒绝 |
| auth crate | 15 fixture 项通过，1 项 public discovery 被忽略；含真实 fixture invalid_grant→logout→新授权、revoke 失败保留/重试、resource refresh 不重传 scope 及 RFC9207 issuer 校验。不是产品平台执行证据 |

检查曾发现并修正 Serde unit command 对未知字段的接受行为；现使用空 struct variants 并保留未知字段拒绝测试。早期编译/测试失败的原路径和 SHA 也保存在 receipt，后续通过不覆盖失败记录。

## 真实联调前提

2026-11-13 主代理报告本机系统 fake-IP/代理路径对固定 auth/canonical Vercel 域名出现 TLS reset，保留 hostname/TLS 验证的独立路由可成功。产品没有 IP pin、DNS 覆盖、TLS 绕过或全局代理改动。服务 advertised scope 必须严格为原生 owner 支持的 `openid profile offline_access connect`；未知 scope 仍被拒绝。

真实浏览器 callback 已观察到 `code,state,iss`；原生 listener 不丢弃 query，统一交 auth crate 校验 pinned issuer。本次冻结已包含 Pauli 的 RFC9207 修复及对应 fixture。真实 refresh、rotation、撤销的主代理独立 harness 结果仅作服务前提，不能代替本产品 owner 与平台回跳执行。

未启动 App 登录、未操作手机、未读取用户笔记，未生成真实 enrollment 邀请。真实两端发现、同步、离线恢复、退出和 Android 回跳须由主代理安排隔离数据目录和测试包后继续。
