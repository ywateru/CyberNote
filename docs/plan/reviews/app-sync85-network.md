# APP-SYNC85 独立审查

状态：**blocked**。2026-11-06。冻结产品 `f58f63c8`，依赖 `5759ebe0`，作者文档 `dad423fc`。

P1 阻塞：正常多 peer 同 hash 附件并发，双方先取得 offset 0；第一条写入后第二条收到 Protocol，客户端永久等人工唤醒，自动同步不再收敛。独立真实 socket 测试已确定性复现，退出 101。修复共享 staging 的 offset 并发/重试协议后，对新冻结版本重新独审。不得把人工 sync_now 作为该用例的通过条件。

冻结原有 14 项复跑通过；新增 required_blobs 在 push/pull 之前拒绝媒体 IO、adopt 成功后 Ready 写失败并重启恢复两项通过。全部冻结输入 SHA256 运行前后相同。

完整证据及原始失败位于 `docs/verification/sync85-independent/`。本轮仅网络/身份与 opaque File Fixture，未证明生产 Store、Session apply、真实双端或出包；没有产品源码修改。
