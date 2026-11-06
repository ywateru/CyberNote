# APP-SYNC86 前端quiet coordinator

状态 pending；depends-on 86UI已独审合入及固定窗口协议。前端可以不等待84/85的Rust合入并行开发，最终真实集成依赖它们。根分配隔离worktree后才开发。是[86 adapter](app-sync86-adapter.md)的前端并行子任务，最终共同独审真实接线，不单独宣称完整目标完成。

context：[架构](../../architecture/sync.md)、[窗口协议](../../architecture/sync-coordinator.md)、86 adapter与87任务；不重做首页83/设置82/同步设置86UI。

path：src/network-sync.ts、src/bridge.ts必要导出、src/App.tsx真实probe/prepare/release挂载与全部写入口freeze、src/attachment-target.ts可信global epoch重绑；相关前端types及定向debug测试。不得修改Rust/Session/lib/网络/identity或Rust测试runner，它们归86 adapter作者；两方仅通过已冻结本机协议衔接。对协议有异议先报root，不能私自猜字段或做stub绕过。

objective：按两阶段实际窗口协议实现quiet coordinator。保护真实PM组字、录音ticket完整生命周期、附件picker/ACK、创建/退出/access屏障；安全目标短freeze并flush现有队列，无关编辑继续、实例/DOM/Undo保持、超时/取消/迟到事件安全释放。将attachment/recording全局epoch变化改为可信snapshot下的严格重绑，其他owner/editor/document/noteEpoch校验一项不删。

verification：真实React/Tiptap handlers与HTML定向验证所有上述路径，明确本机事件fixture层边界；不伪造compositionend、不使用真实麦克风/原设备。不复制86设置全矩阵。冻结源码后由其他agent审查；最后与生产Rust适配器接实际transport的双页面测试由根统一安排，fixture不代表真实网络。
