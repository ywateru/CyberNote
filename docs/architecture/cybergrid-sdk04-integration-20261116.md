# CyberGrid 0.4.0 接入后的同步根因与修复

## 版本与结论边界

CyberGrid v0.9.0 / Rust SDK 0.4.0，固定源码 `8dc16bdbb24693db63fc61e14805a3912bb3e12b`。本次已经观察到 iroh-direct 与 cloudflare-tunnel 上实际的笔记版本和附件交换，因此不能把所有失败归结为两端不互通。完整资料库收敛需要单独的真机终态验收，局部持久收件不等于完成。

前期重复建连、旧 120 秒传输上限和附件每块重复全文件 SHA256 的调查见 `cybergrid-sync-connectivity-20261116.md` 与 `account-device-actions.md`。本报告说明更新 SDK 后仍失败的应用层边界。

## 已定位的失败

### 本地快照与后台应用竞争

真实 Android 日志（2026-11-16，UTC+8）：

```text
21:44:10.449 tid=14127 plan_stale src/store/synchronization/media.rs:269
21:44:18.553 tid=14127 plan_stale src/store/synchronization/media.rs:269
21:44:24.917 tid=15205 plan_stale src/store/synchronization/media.rs:269
21:44:24.918 tid=15205 reprepare_install src/sync/adapter.rs:84
```

这些行号对应当时的诊断构建。`sync_begin_media` 检查快照 root / generation；网络 backend 在进入此处前已检查同一 Session token、Store instance 与设备 epoch。该次失败来自内容 generation 的变化。网络收件和 quiet apply 的媒体验证在锁外执行，另一方可以在验证期间提交；状态变化本身正常，把尚未执行的事务准备冲突当成整个传输失败不合适。

修复：仅对事务之前的媒体准备重新捕获，最多两次；固定最初的 Session / Store / 设备授权。事务闭包只执行一次，事务结果、已发送请求与可能已提交的结果不重放。授权、账户或 Store 切换仍立即失败。

### 本地处理期间远端触发 30 秒空闲超时

Mac 实际日志 `mac-diagnostic-enrollment.log`：

```json
{"at":1794837691326,"stage":"blob","event":"sent","elapsedMs":6,"error":null}
{"at":1794837721418,"stage":"server","event":"idleDeadline","elapsedMs":30098,"error":"timeout"}
{"at":1794837721418,"stage":"server","event":"closed","elapsedMs":122980,"error":"timeout"}
```

该轮手机最后显示 15 / 111 项版本、1.1 MB、2 分 50 秒，传输阶段连接失败。远端先达到应用层 idle deadline，再关闭数据流；不能将后续 SDK EOF 当作最初原因。

代码确认了两个会拉长请求间隔的路径：

1. `required_blobs` / `receive_head` 使用完整媒体准备，提前为待应用附件复制独立发布副本；收件只是持久保存 inbox，quiet apply 之后还要再做这些副本。大附件放大了这段重复工作。
2. 授权续期在 `select!` 分支中直接等待 HTTP，等待期间不再轮询数据传输 future；本地准备与续期延迟可以叠加。

修复：收件专用快照保留摘要、冲突、预算、generation 与文件身份校验，但不预复制将来应用时的附件发布副本。正式应用仍独立准备安全发布能力。客户端在完成一轮 RPC、没有管线响应待消费时，每 5 秒用已有认证 `Status` 请求保持业务连接；不会把它插入分块管线。续期 future 与数据 future 同时轮询，不在分支内长时间等待。

30 秒 IO、20 分钟总传输、23 分钟外层请求、签名证明到期、设备撤销与取消后的任务退役规则保持约束。保活不会延长证明或绝对期限。

### 网络 EOF 被误报为账户存储故障

另一轮实际 UI 显示 `account_storage`。授权交换的 TCP `read_u32` / `read_exact` / `write_all` 使用 `?`，进入 `From<std::io::Error> for account::Error`，该转换原本为本地文件 IO 设计，统一返回 `Storage`。网络 EOF 因此被显示为“无法安全读取或保存账户授权”。

修复：授权 socket 读写、远端连接显式映射为 Network；本地凭据存储仍保留 Storage 分类。远端续期的暂时网络失败只有在原设备 / Noise key 的现有签名授权仍有效时才允许等待下次刷新；不修改到期时间，明确校验失败、存储错误、取消、过期或撤销仍终止。

## 回归与真机证据

仅保存有限源码边界和错误类别；不记录 JWT、用户正文、附件路径或远端自由文本。Android release 可通过 `CyberNoteSync` 标签获取失败边界，Mac 使用固定边界输出。

- 真实 TCP / WebSocket / Noise 回归：450ms 本地阻塞配合 150ms 远端空闲预算。无保活对照触发 Timeout，有保活时下一条认证 RPC 成功，空闲预算未变。
- 收件回归：已有 blob 的版本获得 durable、非 applied 收据，不创建新发布暂存或 live 附件；后续 SQL 回滚保留 inbox，重新准备后正式应用成功。
- 授权 socket EOF / 写失败返回 Network；临时刷新失败不得借用错误 key、已到期或已关闭的授权。
- 同一 Session 下 generation 变化允许重新准备；事务调用次数仍为一次，失效 fence 不重建。

真机各轮 JSON、截图与日志保存在本地 `artifacts/account-sync-sdk04-20261116/`。最终包与完整同步验收结果由该目录的交付回执记录；此处的失败调查不构成完整同步成功声明。
