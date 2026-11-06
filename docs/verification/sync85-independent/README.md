# Sync85 独立验收：阻塞

2026-11-06。审查基线 `dad423fc339be227de68bd372efe59c664cc3413`，产品冻结 `f58f63c8`，依赖 `5759ebe0`。本轮不批准该冻结版本交付；未修改产品源码，未操作设备、真实用户库或麦克风。

## P1：同一附件的正常多设备并发上传会永久停止自动同步

位置：`src-tauri/src/sync/network/staging.rs` 的 `Staging::write` offset 检查；`src-tauri/src/sync/network/service.rs` 的 `client_loop` 非传输错误等待分支。

两个已认证客户端向同一 host 发送不同笔记，笔记引用相同的 24,687 字节附件。两个客户端先各自获得 `BlobOffset=0`；独立测试只在发送端的首块本地读取入口等待双方到达，不替换网络、staging 或协议实现。双方随后通过真实 localhost WebSocket/Noise 发送首块。host 接受其中一条写入后，另一条请求的 offset 已落后于共享 staging 的当前长度，服务端返回 Protocol。客户端把它当作永久协议错误，只等待人工 `sync_now`。

7 秒内 host/B/C 的笔记数量保持 `[1,1,1]`，一个客户端 `error: Protocol`，另一个 `idle`；三端本应自动收敛为 `[2,2,2]`。测试没有调用手动重试。这个问题属于正常多设备场景，需要支持幂等重叠块、返回可恢复 offset、单 hash 上传协调，或其他自动可恢复协议；不能靠调整测试顺序隐藏并发。

原始失败：`independent-attempt01.txt`、`independent-attempt01.json`。测试：`scripts/sync-network-test/tests/independent85.rs::simultaneous_same_blob_uploads_automatically_converge_without_manual_retry`。自然退出码 **101**，2 项通过、1 项失败，完整 wall **9.275088625 秒**。该失败原件保留，后续修复必须另存新的运行记录。

## 已通过的独立复验

- 冻结版本原有完整测试自然退出 0：7 unit、6 socket 集成、1 三进程场景；wall 13.697444583 秒。见 `baseline-tests.txt`、`baseline-result.json`。
- 新增 `required_blobs_rejection_precedes_blob_io_on_push_and_pull`：push 与 pull 两条真实 socket 路径，接收端预验证拒绝后，源端没有 blob 读取，接收端没有 blob 发布、版本收件或 partial 文件分配。
- 新增 `prepared_credentials_survive_ready_file_failure_after_successful_adoption`：成功采用 workspace 后，独立注入 Ready 身份文件 rename 失败；保持 Prepared、没有拉取数据；恢复持久 Prepared 文件并创建新服务后，可继续恢复并收敛。

原有测试还实际覆盖未认证 inventory、Noise 重放与密文篡改、撤销活连接、大小/深度与 partial 预算、停止和重开。原有 14 项均通过，并不抵消新增并发失败。

## 身份和边界

`before.json` 和 `after.json` 对全部 14 项冻结输入逐文件记录 SHA256；与作者证据一致，运行前后不变。新增独立测试的 SHA256 单独保全，不混入被冻结产品指纹。

测试后端明确为 opaque File Fixture，证明生产网络/身份模块行为；没有连接生产 SQLite Store、84 完整 wire 校验器或 86 Session apply。因此不能据此宣称真实笔记冲突、IME/录音屏障或完整双端同步通过。TLS 真实域名、VPN、隧道及安装包也未验。本轮不触及原 Android 未保存录音现场。
