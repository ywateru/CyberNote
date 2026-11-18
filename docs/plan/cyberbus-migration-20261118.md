# CyberBus 迁移交付计划

设计：[迁移契约](../architecture/cyberbus-migration-20261118.md)。当前状态：实施前方案已建立，服务环境调查并行进行。

| 任务 | 范围 | 依赖 | 状态 |
| --- | --- | --- | --- |
| cyberbus120-core | 固定 SDK、SecureStore、设备事件 owner、受限 Data 虚拟流 | 无 | ready |
| cyberbus121-account | 账户 Runtime、登录、设备列表、SyncService 接线 | core（按接口并行开发，合入后组合验证） | in-progress |
| cyberbus123-platform | 账户前端、Android Keystore、构建与发布配置 | account（接口联动） | in-progress |
| cyberbus122-verification | 独立审阅、组合回归、真实 Logto 与多资料库/多端验收 | account | pending |

服务调查：[Logto/CyberBus 部署](analysis/cyberbus-logto-deployment-20261118.md)。[验收矩阵](../verification/cyberbus120/TEST-CASES.md)覆盖 AUTH/STORE/DEVICE/BRIDGE/SYNC/SESSION/BUILD/NETWORK。运行及结果后续写入 `docs/verification/cyberbus120/`，失败保留，模块测试与真实网络分列。
