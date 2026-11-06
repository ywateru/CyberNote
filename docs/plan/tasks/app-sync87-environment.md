# APP-SYNC87 隔离Android与路由环境准备

状态 ready，独立于86源实现；完整87验收仍pending。仅准备本机资源、生命周期和可审计工具，不能把环境ready称真实同步pass。

objective：确认现有SDK/API30 ARM64 emulator、ADB、cloudflared和构建缓存，准备全新独立AVD HOME/AVD名称/data目录及仅允许该新serial的检查工具，完成冷启和停止可选验证，为随后准确同步APK安装与新设备原生provider验收提供可重复入口。只用已安装工具和镜像，无新SDK安装。根拥有最终源码合入与准确出包，不能运行构建或安装旧包。

context：docs/plan/tasks/app-sync87-e2e.md、app-android-attachments-native76.md、docs/plan/sync-delivery-state.md。

path：本任务docs/verification/sync87-environment/、scripts/debug/sync87-environment相关独立工具；不得修改生产Rust/TS或已有测试/构建脚本。

本轮独立资源置于/private/tmp/apple-notes-sync87-environment-01，独立ANDROID_AVD_HOME，显式新AVD名notes-sync87-isolated。绝不复制旧userdata/snapshot/AVD配置。只读使用缓存API30 google_apis arm64-v8a镜像。端口需先确认未占用，新serial必须与旧emulator-5580不同。所有ADB/CDP显式新serial及AVD名/新进程身份校验，不得默认首个target或kill-server；不能全局关闭emulator/ADB或修改用户VPN/路由。

原Android约13秒未保存录音现场完全不动：禁止安装/启动/停止/重启/读取/导出/备份任何原设备或旧AVD，含emulator-5580。允许查看host端口占用/本轮owned PID；不对旧serial发命令。新环境只放合成数据；真实mic/no-audio，禁真实AppleNotes操作。用户授权直接执行无需再问。

磁盘当前约17GiB、已有共享target/SDK必须保留。创建前检查预算，cold boot需no-snapshot/no-audio；如boot会分配过大userdata/内存，先采用有界配置并报告。若启动独立AVD，保存精确PID、AVD名、serial、启动/ready/停止命令和自然退出；最后停止仅本轮owned PID，保留合成目录用于随后安装，不自动清数据。不要启动cloudflared/公开任何库，只核二进制和匿名临时路线前置条件；WireGuard/EasyTier无现成安全网只记录未具备，不擅自配置用户网络。

verification：工具必须默认拒绝旧serial/缺serial/非本轮AVD，拒绝任何安装旧APK和未显式路径；记录准确命令、退出/wall、磁盘与资源界限。源码先冻结commit，再纯证据commit，交根独审并合入。环境层不证明App、网络、provider或像素通过。所有shell显式当前worktree，不写主线；不merge/push/管理worktree。证据不得包含用户文件/邀请secret。

2026-11-06：独立审查285970a1通过（ENVIRONMENT-READY ONLY），已合入主线；新emulator-5584目前stopped、可供准确新APK验收，原设备不操作。17 guards及证据清单独审通过；P3文字收窄：目录总占用增加，base userdata allocated_bytes前后均105316352，不能把增长归因该文件。原作者证据与两次失败保留。
