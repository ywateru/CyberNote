# CyberBus 迁移验证状态

本页区分开发自测、独立审阅、组合创建链与真实网络，不把不同层的结果合并成总体通过。2026-11-18 按用户要求收敛核心功能：命令行直接验证，UI 由用户执行 [手动测试用例](MANUAL-UI-TESTS.md)。

| 范围 | 已取得结果 | 仍需执行 |
| --- | --- | --- |
| 迁移前代码与服务调查 | 代码创建链、Logto 1.46.0、JWT 配置、专用 scope、relay TCP 可达已核对；CyberNote 产品最小增量成功，完整读回相等，14 项公开 fixture 通过；真实 SDK 双端已分别登录并恢复 | 不同账户/产品负例 |
| core `2b24104a` | 四项阻断已修；[独立复审 02](../../plan/reviews/cyberbus120-core-02.md)通过：27 产品测试、8 独立 fixture、离线编译；已合入 | 生产平台存储运行与原生集成由其他层验收 |
| platform `a4c85d32` | 两项阻断已修；[独立复审 02](../../plan/reviews/cyberbus123-platform-02.md)通过：34 CLI 检查、Android Java/DEX、release auth AAR/lint、JNI 签名；已合入 | 真机 Keystore、完整 Android Rust/组合 APK；完整发布源导出另列限制 |
| 账户 Runtime `0f3cd922` | [独立复核](../../plan/reviews/cyberbus121-account-01.md)通过；默认及 sync-e2e 离线编译、35 账户测试、真实 Rust→TS DTO 5 合法/11 非法组合通过；退出、认证错误投影、profile 验证已修且合入 | 原生真实账户/回跳/云撤销 UI 手测 |
| 独立 SDK/SQLite 网络工具 | [real-report-05](../../../scripts/cyberbus120-network/real-report-05.json)通过：双端实际登录/发现、Data/Noise、完整中文富文本/PNG/文件 push/pull 及反向排除、both、重启、inbox、冲突两完整分支/附件、暂停拒绝；[独审](../../plan/reviews/cyberbus124-network-01.md)完成 9 本地测试/fixture/95 源文件 provenance 核验，已合入；旧失败保留 | 不代替 Tauri Account/Session 或平台 Keychain/Keystore；在线执行属于作者证据，独审未重跑授权 |
| 最终应用 | 产品组合 `c693a748` 的 [Mac Debug `.app` 构建通过](combined-build.md)，真实 sidecar/前端资源与 plist 完整，本地 ad-hoc strict 签名校验通过；[组合前端/平台 CLI](combined-cli.md)通过 | 原生 UI 按手动用例执行；Android 不在本轮包交付范围；Debug 包非正式发布 |

最终组合 [Rust 定向回归](combined-rust.md) **49/49 通过，0 ignored**：账户 35、真实 Store/Session 方向 3、headless 边界 7、sync-e2e 契约 4。使用实际主配置、真实 sidecar 和已锁定离线依赖，未使用空资源覆盖。组合前端 typecheck、34 项平台 CLI、2 项独立 DTO 用例和合并契约补充断言通过；Tauri hook 的 `tsc -b && vite build` 通过。本轮不把这些定向组称为全部 375 项 Rust 测试均运行。

设计：[迁移契约](../../architecture/cyberbus-migration-20261118.md)。计划：[实施与恢复入口](../../plan/cyberbus-migration-20261118.md)。逐项用例：[验收矩阵](TEST-CASES.md)。部署：[产品增量回执](logto-product.md)。开发自测详见 `core.md`、`platform.md` 和合入后的 account/network 报告。

真实 SDK 网络工具的 Store backend 只能证明传输和数据算法组合，不能代替 App 账户或 Session quiet 屏障。Android AAR/DEX 只证明编译，不证明 Keystore 运行。生产 release/source-export 必须再核对全部固定源码、git pin、对应源码/许可证和实际包。

旧 CyberGrid `.account/grant.json` 不由新实现读取或恢复；本轮未验证它的云端撤销。新退出仅提供 CyberBus 的本地关闭与独立云端撤销收据。既有发布 inventory 的 62 项基线差异保留，未通过完整 source-export，不影响本轮隔离资料库的本地核心手测包范围。

本轮应用入口：`src-tauri/target/debug/bundle/macos/CyberNote.app`。两个隔离资料库的准确启动命令、12 个核心 UI 用例与 7 个第二轮回归用例均在 [手动测试文档](MANUAL-UI-TESTS.md)。未启动原生 UI、未访问用户原资料库；CLI 结果不能代填 UI 通过。
