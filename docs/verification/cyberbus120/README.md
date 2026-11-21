# CyberBus 迁移验证状态

本页区分开发自测、独立审阅、组合创建链与真实网络，不把不同层的结果合并成总体通过。2026-11-19 已完成 macOS 双端真实原生 UI 生命周期验证；Android 能完成本地登录和状态恢复，但 Mac↔Android 在业务会话首帧前失败，因此核心替代目标尚未全部完成。命令入口见 [命令行验证](COMMANDS.md)，未完成项和分支处置见 [剩余工作](REMAINING.md)。

| 范围 | 已取得结果 | 仍需执行 |
| --- | --- | --- |
| 迁移前代码与服务调查 | 代码创建链、Logto 1.46.0、JWT 配置、专用 scope、relay TCP 可达已核对；CyberNote 产品最小增量成功，完整读回相等，14 项公开 fixture 通过；真实 SDK 双端已分别登录并恢复 | 不同账户/产品负例 |
| core `2b24104a` | 四项阻断已修；[独立复审 02](../../plan/reviews/cyberbus120-core-02.md)通过：27 产品测试、8 独立 fixture、离线编译；已合入 | 生产平台存储运行与原生集成由其他层验收 |
| platform `a4c85d32` | 两项阻断已修；[独立复审 02](../../plan/reviews/cyberbus123-platform-02.md)通过：34 CLI 检查、Android Java/DEX、release auth AAR/lint、JNI 签名；已合入 | 真机 Keystore、完整 Android Rust/组合 APK；完整发布源导出另列限制 |
| 账户 Runtime `0f3cd922` | [独立复核](../../plan/reviews/cyberbus121-account-01.md)通过；默认及 sync-e2e 离线编译、35 账户测试、真实 Rust→TS DTO 5 合法/11 非法组合通过；退出、认证错误投影、profile 验证已修且合入。真实系统浏览器 Logto 登录、双 Mac 重启恢复和退出再登录已通过 | 不同账户负例与云端授权撤销 |
| 独立 SDK/SQLite 网络工具 | [real-report-05](../../../scripts/cyberbus120-network/real-report-05.json)通过：双端实际登录/发现、Data/Noise、完整中文富文本/PNG/文件 push/pull 及反向排除、both、重启、inbox、冲突两完整分支/附件、暂停拒绝；[独审](../../plan/reviews/cyberbus124-network-01.md)完成 9 本地测试/fixture/95 源文件 provenance 核验，已合入；旧失败保留 | 不代替 Tauri Account/Session 或平台 Keychain/Keystore；在线执行属于作者证据，独审未重跑授权 |
| 真实 macOS 原生 UI | 两个独立资料库分别登录并发现设备；定向 push/pull/both、改名/离线、重启恢复、暂停/恢复、退出/再登录均通过。双 Mac 增量测试实际接收中文/Emoji/粗体/斜体笔记、70-byte PNG 和 262144-byte 文件，传输显示 `3 / 3`、`261.8 KB`；稳定笔记摘要、附件描述符和 blob SHA-256 逐项一致 | Android UI-18、异网络 UI-19 及可选第二轮编辑/冲突/删除回归 |
| Android 原生 UI | QA APK 已安装并启动；应用能进入 `ready`，账户存储为 `encryptedFile`，设备目录可见 | **FAIL / 未完成**：Noise 会话反复建立但业务首帧前关闭，`businessSessionsEstablished=0`；Mac↔Android 内容、附件、MIME 和重启恢复未通过 |
| 最终应用 | 当前 Debug `.app` 已用于真实 UI；产品组合构建记录、真实 sidecar/前端资源与本地 ad-hoc strict 签名校验保留在 [组合构建记录](combined-build.md)，组合前端/平台 CLI 见 [combined-cli.md](combined-cli.md) | Debug 包非正式发布；完整 source export 与 Developer ID 签名/公证另列 |

最终组合 [Rust 定向回归](combined-rust.md) **49/49 通过，0 ignored**：账户 35、真实 Store/Session 方向 3、headless 边界 7、sync-e2e 契约 4。使用实际主配置、真实 sidecar 和已锁定离线依赖，未使用空资源覆盖。组合前端 typecheck、34 项平台 CLI、2 项独立 DTO 用例和合并契约补充断言通过；Tauri hook 的 `tsc -b && vite build` 通过。本轮不把这些定向组称为全部 375 项 Rust 测试均运行。

2026-11-19 文档收敛后的最终定向检查为：`pnpm typecheck` PASS、主应用 `cargo check --features sync-e2e` PASS、`git diff --check` PASS；命令、三端、Android 文件与登录界面 Node 组合测试 **87 passed / 0 failed**；CyberBus 库 **96 passed / 0 failed / 1 ignored** 且 facade **3 passed / 0 failed**，`notes-cyberbus` **32 passed / 0 failed / 0 ignored**。

真实 Logto 登录问题另行收敛：最初 `account_sdk_failed / cyberbusCode 1` 来自 SDK 构建错误，重建后消除；随后登录页拒绝凭据，原因是测试账号大小写与输入不一致且当时密码不是 Logto 中的测试值。CLI harness 使用独立 QA fixture 直接构造已授权账户，绕过真实浏览器表单与凭据校验，这是此前 CLI 未发现该问题的覆盖缺口。永久文档不记录账户、密码、subject、token 或设备标识。

设计：[迁移契约](../../architecture/cyberbus-migration-20261118.md)。计划：[实施与恢复入口](../../plan/cyberbus-migration-20261118.md)。逐项用例：[验收矩阵](TEST-CASES.md)。部署：[产品增量回执](logto-product.md)。开发自测详见 `core.md`、`platform.md` 和合入后的 account/network 报告。

真实 SDK 网络工具的 Store backend 只能证明传输和数据算法组合，不能代替 App 账户或 Session quiet 屏障。Android AAR/DEX 只证明编译，不证明 Keystore 运行。生产 release/source-export 必须再核对全部固定源码、git pin、对应源码/许可证和实际包。

旧 CyberGrid `.account/grant.json` 不由新实现读取或恢复；本轮未验证它的云端撤销。新退出仅提供 CyberBus 的本地关闭与独立云端撤销收据。桌面只使用本机加密文件，Android 只使用 Keystore 保护的本地加密文件；系统钥匙串不是可选项。旧 Keychain 项不读取、不删除，升级后归档活动绑定并要求重新登录。既有发布 inventory 的 62 项基线差异保留，未通过完整 source-export，不影响本轮隔离资料库的本地核心手测包范围。

本轮应用入口：`src-tauri/target/debug/bundle/macos/CyberNote.app`。两个隔离资料库的准确启动命令、12 个核心 UI 用例、7 个第二轮回归用例和 2026-11-19 实际结果均在 [手动测试文档](MANUAL-UI-TESTS.md)。测试未访问用户原资料库；CLI 结果不能代填 Android 传输失败样本、异网络或可选第二轮 UI 项。
