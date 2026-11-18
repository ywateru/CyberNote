# CyberBus 迁移验证状态

本页区分开发自测、独立审阅、组合创建链与真实网络，不把不同层的结果合并成总体通过。迁移仍在进行。

| 范围 | 已取得结果 | 仍需执行 |
| --- | --- | --- |
| 迁移前代码与服务调查 | 代码创建链、Logto 1.46.0、JWT 配置、专用 scope、relay TCP 可达已核对；CyberNote 产品最小增量成功，完整读回与预期相等，14 项公开 fixture 通过 | 实际登录签发/刷新、产品隔离网络验证 |
| core 开发首版 `c3ea6dc7` | 13 模块测试、cargo check；真实 SDK 离线生命周期与受控 TCP 桥测试 | 独立审阅、真实 SDK 双 peer/Data、取消/EOF/期限补测 |
| platform 开发首版 `b74eeb63` | 31 平台/发布检查，前端 typecheck/build，Android Java/DEX/auth AAR 编译 | 独立审阅、Android Keystore 真机、Rust JNI、组合 APK |
| 账户 Runtime | 实施中 | 新登录/设备/SyncService/Session 创建链与全 feature 编译 |
| 独立 SDK/SQLite 网络工具 | 实施中 | 真实 Logto、双进程完整正文/附件/方向/恢复测试 |
| 最终应用 | 尚未构建 | 准确 Mac/Android 组合包、隔离资料库原生验收 |

设计：[迁移契约](../../architecture/cyberbus-migration-20261118.md)。计划：[实施与恢复入口](../../plan/cyberbus-migration-20261118.md)。逐项用例：[验收矩阵](TEST-CASES.md)。部署：[产品增量回执](logto-product.md)。开发自测详见各模块合入后的 `core.md`、`platform.md` 和后续 account/network 报告。

真实 SDK 网络工具的 Store backend 只能证明传输和数据算法组合，不能代替 App 账户或 Session quiet 屏障。Android AAR/DEX 只证明编译，不证明 Keystore 运行。生产 release/source-export 必须再核对全部固定源码、git pin、对应源码/许可证和实际包。
