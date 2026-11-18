# CyberBus 迁移交付计划

设计：[迁移契约](../architecture/cyberbus-migration-20261118.md)。当前状态：实施前方案已建立，服务环境调查并行进行。

| 任务 | 范围 | 依赖 | 状态 |
| --- | --- | --- | --- |
| cyberbus120-core | 固定 SDK、SecureStore、设备事件 owner、受限 Data 虚拟流 | 无 | in-progress |
| cyberbus121-account | 账户 Runtime、登录、设备列表、SyncService 接线 | core（按接口并行开发，合入后组合验证） | in-progress |
| cyberbus123-platform | 账户前端、Android Keystore、构建与发布配置 | account（接口联动） | in-progress |
| cyberbus124-network-harness | 双独立 SDK/SQLite 真实传输与数据测试工具 | core | in-progress |
| cyberbus122-verification | 独立审阅、组合回归、真实 Logto 与多资料库/多端验收 | account | pending |

服务调查：[Logto/CyberBus 部署](analysis/cyberbus-logto-deployment-20261118.md)。[验收矩阵](../verification/cyberbus120/TEST-CASES.md)覆盖 AUTH/STORE/DEVICE/BRIDGE/SYNC/SESSION/BUILD/NETWORK。运行及结果后续写入 `docs/verification/cyberbus120/`，失败保留，模块测试与真实网络分列。

## 恢复入口

| 实施边界 | 分支 | 独立工作树 |
| --- | --- | --- |
| core | `codex/cyberbus120-core` | `/Users/water/work/2026/Apple-Notes-Clone-cyberbus120` |
| account | `codex/cyberbus121-account` | `/Users/water/work/2026/Apple-Notes-Clone-cyberbus121` |
| platform | `codex/cyberbus123-platform` | `/Users/water/work/2026/Apple-Notes-Clone-cyberbus123` |
| network harness | `codex/cyberbus124-network` | `/Users/water/work/2026/Apple-Notes-Clone-cyberbus124` |

主工作区管理设计、部署调查与合入。实现写集分离，core 公共接口和 Android Keystore JNI 签名明确后由账户模块接线；单独分支测试不能替代合入组合检查。实现提交后交不同验证员独立审查，通过后合入；core 先合，再将其准确提交同步到账户工作树完成编译。独立网络工具只验证 SDK/SyncService/Store 数据组合，不能替代 Tauri 账户与 Session 接线验收。

远端只读调查已完成，后续正准备 CyberNote 产品的最小管理 API 增量。正式 pins 以部署读回报告为准，测试密码/管理凭据不进入本计划。当前尚无迁移后数据同步通过声明。
