# Store/Session 显式同步空间切换

2026-11-14。按 [资料库独立契约](../../../plan/tasks/app-account109-account-independent-library.md)执行 delegated author 部分；只修改 Store/Session 与合成 fixtures，account/adapter 由 Huygens 负责。此记录不是独立审阅或用户资料库实测结果。

源码链（基线 `b44cbca6`）：

- `c022e352`：Store 预检查、事务采用、媒体 bootstrap、Store/Session 权限代际。
- `07602e76`：六个 Store 与两个 Session 保全/回滚 fixtures。
- `3ef56755`：专用 adoption probe/prepare/release，等待所有窗口冻结并确认保存，不应用旧 inbox；三个屏障 fixtures。
- `213b1a5a`：空参与窗口使用明确 adoption 错误；补超时、旧操作清理与替换操作隔离及 late Pending fixture。

接口约定：

- `Store::sync_adoption_preflight(workspace, device)` 只读；`Store::sync_adopt_workspace(workspace, device)` 事务提交。相同 workspace/device 不改 SQL、Store instance 或待同步状态。
- `Session::sync_adoption_preflight(workspace, device)` 用于开始前。跨身份时 native pending/save intents/已有 quiet 操作必须先完成。
- `Session::sync_begin_workspace_adoption(workspace, device, live)` 发起现有窗口 probe；常驻 coordinator 的 `sync_tick` 只为此目的发 prepare/abort，不构造旧远程应用计划。
- prepare 目标包含全部本地笔记；protected/blocked 窗口不能被排除后继续采用。复用现有 renderer freeze/flush/ACK，不以 native 已登记保存代替 UI 草稿确认。
- `Session::sync_workspace_adoption_ready(operation, workspace, device, live)` 在媒体准备前和最终锁内重复检查：全部 ACK、原操作/目标、参与窗口、每阶段五秒期限、Store instance/Session epoch、当前笔记集合、无 pending/intents 及 Store 投影安全。
- 最终 ready、Store 采用、`sync_release_workspace_adoption(operation, true)`、`sync_finish_workspace_adoption(previous_instance)` 必须处于同一个 Session 锁；锁外先发送原操作 `notes-sync` release，再发送返回的 `notes-access`。失败释放原操作；迟到清理不得释放替换操作。

Store 在同一 SQLite 事务中先捕获 dirty 编辑，再验证唯一 head 与 projection 的 digest/vector、完整内容及附件原字节，之后重建固定同步表/触发器并从现有业务行建立新基线。inbox、并发 heads、未投影版本或不一致内容明确拒绝 `sync_adoption_blocked`，不静默选版本。拒绝与事务失败均保留旧 SQL；附件业务行、引用、原文件不被迁移代码改写。不可变 blob 缓存不是账户权限，迁移不删除该缓存或 managed 附件。

成功后轮换 Store instance 与 Session id，使旧 apply plan、prepared media、global/note/media token 在 A→B→A 后仍然失效；本机已解锁 key 保留。此模块不处理登录、grant、网络服务或采用标记文件，其 fences 属于 adapter/account 接线。

验证状态：作者执行 `git diff --check`；本树未运行 Cargo、App、设备、网络或访问真实库。十二个 `workspace_adoption` 合成 fixtures 已交 Huygens 在唯一共享 target 中串行执行，结果待其精确整合源回执；没有声明本轮运行通过。共享 target 的 ownership 已直接约定归 Huygens，作者不占用或新建 target。

Huygens 已报告较早整合 checkpoint `5634c8fb` 的 account 48/48、workspace_adoption 12/12、adapter 19/19，无 skip；该组包含 adapter 自身匹配过滤的 fixture，尚不含作者最后的 `213b1a5a`，不可作为最终链验证结果。最终精确测试源、日志及 target 释放以 Huygens 后续回执为准。

独审 P2 后的静态恢复建议（已直接发 Huygens，未在作者树新增恢复入口）：现有 Store plan/apply 与 Session quiet 均不要求联网，可在旧身份及 transport 封闭时，显式通过 trusted window 发起旧空间本地收件应用，并保留 renderer freeze/flush/ACK、媒体校验及代际 fences。不可绕 Session 直接 apply。仅有未投影 heads 而无 inbox 的状态仍受现有 `NoEligiblePlan` 限制，需要专门的显式本地恢复目的；缺 blob 时不能离线补出字节，必须保留具体阻断及合法旧空间恢复途径。冲突数为零不代表无待办。退出后移交 manual binding/config 的精确身份与文件所有权属于 account/adapter，Store/Session 不删除 inbox、binding 或采用标记来消除错误。该建议不代表 P2 已修复或整个集成已获批准。
