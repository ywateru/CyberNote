# APP-SYNC86-UI 设备同步设置与命令

状态 ready_for_verify（产品/调试源码冻结 a9221a0e83b666d47b7fde3bd26a18ea63834a01；独立验收待根排程，生产接线另任务）。技能docs-sprint分配的develop角色。只在根分配worktree修改，不操作设备/真实麦克风/用户数据，不push。

objective：按[UI](../../ui/sync-settings.md)与[架构](../../architecture/sync.md)实现真实React同步设置组件、严格类型/IPC包装、挂到数据总览、程序化调试指令和必要DOM验证。明确当前真实IPC尚待86 adapter，不把fixture当网络完成。

path：src/SyncSettings.tsx/.css、src/sync-client.ts（采用本规格固定command/status schema）、src/DataManagement.tsx optional同步ReactNode插槽同scroll、src/App.tsx仅挂组件/handle与debug handler、src/debug catalog/protocol以及scripts/debug新增sync-settings runner和fixture sync_command分支。不得修改Rust/Store/network/原有保存或录音控制器；86 adapter稍后接线。App改动尽量局限上述挂载及命令，避免后续quiet coordinator冲突。

context：docs/ui/sync-settings.md、docs/ui/preferences.md、docs/ui/storage-overview.md、docs/architecture/sync.md、docs/debugging.md。用户授权无需再确认设计/权限。

verification：pnpm build/typecheck及精确定向真实App DOM+显式IPC fixture。覆盖未启用状态、host/pair/invite/复制/单次点击/失败重试/撤销/冲突两方式、状态刷新不抢焦点、关闭/切tab清secret且迟到回包不能重新显示、统计首次失败入口仍在、320/390/1280浅深/短屏无横溢且按钮可达、DEV command allowlist和生产不含debug。保留原数据/设置/附件/录音入口断言，不跑原设备。冻结源码后由不同agent独审。

产出准确源码commit、任务测试自然退出/前后hash/截图HTML及真实边界，不自行merge主线，不标同步goal完成。

开发证据：`docs/verification/sync86-ui/README.md`。冻结源码桌面48项、mobile browser48项、preferences52项、build与production gate自然退出0。只证明UI与显式IPC fixture，不代表网络同步goal完成。
