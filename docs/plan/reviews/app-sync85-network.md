# APP-SYNC85 独立审查

状态：**85网络/身份模块范围通过，原并发阻塞已解除**。2026-11-06。复审HEAD `7d206973`、产品修复 `c88982a6`，依赖 `5759ebe0`。

原P1：`f58f63c8` 正常多peer同hash附件并发，双方先取得offset0；第一条写入后第二条收到Protocol，客户端永久等人工唤醒。原独立真实socket失败退出101仍保存在 `docs/verification/sync85-independent/`，未改原件。

修复对重叠块逐字比较，只追加缺失后缀；迟到块核对已发布对象后幂等返回，不重复发布；发送端接受有界前进offset。独立审查size/offset/finish约束、预算及锁顺序后，完整19项真实回归自然退出0，wall18.535888709秒。原独审并发测试逐字不变且无人工sync_now，上传及双源下载均自动收敛。16项输入SHA256与作者证据一致，前后不变。

复审证据位于 `docs/verification/sync85-independent-recheck/`。本轮仅网络/身份与opaque File Fixture，未证明生产Store、Session apply、真实双端或出包；没有产品或测试源码修改。可继续86真实适配与后续独审，不能将85通过外推为完整同步完成。
