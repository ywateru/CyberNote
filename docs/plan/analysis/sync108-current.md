# 当前同步实现分析与本轮验收

2026-11-12。本轮基于用户工作区当前源码，不以旧 Mac29/Android21 或106包的历史测试替代。

## 实现链

| 模块 | 职责与实际连接 | 验证重点 |
| --- | --- | --- |
| `src/SyncSettings.tsx`、`src/sync-client.ts` | 设置表单调用严格类型化 `sync_command`；前端不直接同步 SQLite | 当前重构设置页仍能开启、配对、停止、重连、查看冲突 |
| `src-tauri/src/lib.rs` | 创建 Store→Session→媒体服务→`sync::adapter::Runtime`，注入真实窗口事件 | 两个原生进程必须分别创建独立 Store/Session/缓存 |
| `src-tauri/src/sync/adapter.rs` | 连接本地身份、Store、网络服务和窗口 quiet 协调；锁外准备媒体，短锁重验提交 | 接收成功不等于应用成功；最终要看持久正文/引用/原文件 |
| `src-tauri/src/sync/network.rs`、`identity.rs` | WebSocket + Noise 配对、授权、分块传输、重试与持久配置 | A作为集合点，B/C分别连接A，验证B↔A↔C转发 |
| `src-tauri/src/store/synchronization/` | 同事务 dirty、版本向量、heads/inbox、内容校验、附件发布及投影 | 并发保留、删除恢复、幂等、原字节一致 |
| `src-tauri/src/session/synchronization.rs`、`src/network-sync.ts` | probe→prepare/flush→重验→commit/abort→release | 由真实窗口处理器回复，不能由测试伪造ACK |
| `src/editor-session/`、`src/trusted-synchronization.ts` | 当前重构后的编辑会话、保存与可信快照 | 远端应用后编辑器和保存队列仍能继续工作 |

每端的数据包括 `notes.sqlite3`、`attachments/` 和 `.sync/`；`.sync` 中的身份和配置必须留在本机，邀请/私钥不写进测试报告。笔记/文件夹/标签/置顶/删除/密文与附件引用参与同步；本机外观、窗口选择、解锁状态、缓存和在途附件 journal 不参与。

## 需要完善的启动边界

本轮修改前，原生入口只调用 `app.path().app_data_dir()`，不能显式以两个目录启动测试实例。`Store::open` 自身没有覆盖完整进程生命周期的工作区锁；SQLite WAL不等于防止两个应用同时恢复同一附件journal或共用本机同步身份。

现已增加桌面 `--data-dir` 启动参数、目录规范化、实例锁和独立派生媒体缓存。平台默认路径保持为未传参行为；Android继续使用应用沙箱。参数失败在打开业务库前拒绝。同目录/别名路径的第二实例拒绝，第一实例退出后可重开；两个不同目录可同时启动。启动模块9项单测、原生启动检查及独立审阅见本轮验证目录。

## 测试层次

1. 真实Store/Session/Noise/socket回归验证算法、持久化与错误分支。
2. 两个当前原生桌面App，传不同 `--data-dir`，通过真实界面/语义处理器写入，核对完整document/plainText、业务元数据与原文件SHA256。
3. 独立Android测试应用沙箱，在明确serial的ADB上运行少量三端用例。默认应用ID和用户既有库不变；ADB reverse只暴露本轮监听端口，结束只移除本轮映射。

浏览器+Rust双App工具可用于补充回归，不替代原生桌面证明。Android后台只验证正常回前台后的补齐，不承诺常驻后台服务。新测试包如修改applicationId/名称，须明记该差异及源码/二进制身份。

## 用例目录与完成状态

可执行用例与逐项结果见本轮 `docs/verification/sync108/`。任务在实际双桌面和少量Android三端测试完成后才关闭；任何构建、安装、UI或数据断言失败独立保留，不重写成通过。
