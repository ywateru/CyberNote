# CyberBus 迁移剩余工作

截至 2026-11-19，macOS 双端账户、设备目录和显式内容同步已经通过真实原生 UI；macOS 与 Android 之间尚未达到可替代旧同步功能的门槛。本页只记录未完成项、证据边界和下次恢复入口，不把模块测试、Noise 会话或设备在线写成内容同步通过。

## 阻断项：Mac↔Android 首帧前断流

### 2026-11-19 修复进展

已修复一个可复现的握手期限不一致：发现用主动端原来只有 2 秒，被动端及 Noise 协议允许 10 秒。主动发现现在与协议使用同一有限期限；业务请求的调用方 deadline、撤销和身份校验保持原契约。延迟 3 秒的真实 Noise 回归在旧实现报 `BrokenPipe`，修复后双向角色均能交换 metadata。另用三个真实 EasyTier 实例关闭全部 P2P/打洞，只让两端连接中继，验证 `cost=2`、指定下一跳以及慢握手后两端 metadata 均通过验证。无响应对端仍会在有限期限退出。

这只能证明已修复的慢握手路径，不足以认定以下 Android 历史故障的全部原因已经消除。Android 修复版 QA APK 已保留数据覆盖安装；等待 `ready` 和本机目录恢复后，升级前后及强停重启前后的设备身份、工作区摘要一致。最早启动采样尚无本机目录条目，不能用该次即时身份比对代替等待后的结果。Mac QA-B 当前已退出登录，QA-A 授权恢复报 `account_network`；真实浏览器重登录停在需要测试凭据的表单。因此修复版 Mac↔Android 正文、附件、MIME 和 SHA-256 仍待有效 Mac 登录后重跑，UI-18/UI-19 不改为 PASS。详细变更和验证见 [本轮修复记录](../cyberbus125/README.md)。

同时修复了 Mac QA 命令入口：普通 `--slot` 名称不再被当成原生窗口位置；账户动作直接调用有限生产 IPC，避免未打开设置时报错、把 UI inspect 包装当作账户状态，或仅打开确认框却没有执行内容操作。正式账户 UI 仍需明确确认。

Android QA 应用能进入 `ready`，账户存储为 `encryptedFile`，设备目录可见；但真实同步诊断显示 Noise 会话反复建立后，在读取首个 metadata frame 前关闭。一次累计快照为：

```text
sessionsEstablished=1471
sessionsInbound=1471
sessionsOutbound=0
businessSessionsEstablished=0
metadataQueued=1471
writerMetadataSent=2920
writerSendFailed=1451
writerExitSendFailed=1451
framesReceived=0
metadataFramesReceived=0
metadataValid=0
readerErrors=1471
readerNoFrameExits=1471
livePeerCount=0
```

这些数字是故障窗口的累计计数，不应作为当前瞬时值或稳定性能指标。它们证明登录和设备发现成功，也证明业务同步失败。下一步应使用 `sync-device` 前后诊断增量缩小范围，并优先排查：

- Noise 会话的 probe/business 半关闭和 writer shutdown。
- metadata 排队后是否在业务准入前被 writer 退出清理。
- 远端关闭是否错误终止读首帧中的业务会话。
- 流适配层是否把正常 EOF/半关闭映射成 `writerExitSendFailed` 与 `readerNoFrameExits`。

在业务会话建立、双向正文和附件落盘、两端 SHA-256 一致之前，UI-18 保持 FAIL。不得清 Android 数据、重建身份或自动解锁来制造新基线。

## UI 和端到端验收

| 项目 | 状态 | 完成条件 |
| --- | --- | --- |
| UI-03～UI-11 macOS 双端 | PASS | 已覆盖登录、设备发现、改名/离线、默认暂停、开启确认、push、pull、both、重启、暂停和退出再登录 |
| UI-12 错误反馈 | 未执行 | 断网、恢复和明确重试显示正确连接/认证/同步错误 |
| UI-13 编辑中接收 | 未执行 | IME、焦点、Undo 与安全点应用/冲突入口保持 |
| UI-14 并发冲突 | 未执行 | 同实体冲突两分支及附件可恢复，不静默丢版本 |
| UI-15 删除与恢复 | 未执行 | 删除、旧端编辑和回收站恢复遵守因果/墓碑规则 |
| UI-16 旧库迁移 | 未执行 | 在已备份副本上保留正文、附件、inbox、冲突和未完成任务 |
| UI-17 换账户 | 未执行 | 设备可见性隔离，本地笔记保留，新账户默认暂停 |
| UI-18 Android 传输和重启 | FAIL | 修复首帧前断流后重跑 push/pull/both、MIME、哈希、强停、Keystore 和身份恢复 |
| UI-19 异网络 | 未执行 | 另一个网络/热点下完成正文与附件落盘，不以 relay 端口可达代替 |
| 三设备转发 | 未完成 | 第三安装参与时同实体不重复、附件完整、暂停端不接收 |

macOS 稳定样本为两端各 4 篇笔记、6 个附件、3 个文件夹，`pendingCount=0`、`conflictCount=0`、`state=ready`、4 个同步 head 且 `sync_inbox=0`。笔记语义摘要、附件描述符摘要和内容寻址 blob 聚合摘要分别为：

```text
notes     1cce6f59869b948a2621af92ce179aeb50c7c4e56d13847708aeeb32733944fc
attachments 319b578dc3cd3295efa2f589f1fd18b12af6e5b0ee7d0d1cc729c83a9b257f7d
blobs     5bd82417347ce853d9a9ffc208045d6bc727054983a35a3ec701be912404a320
```

这些摘要只证明 macOS A/B 样本，不证明 Android。

## 登录和测试覆盖

最初的 `account_sdk_failed / cyberbusCode 1` 首先由 SDK 构建错误引起，重建后消除。之后真实 Logto 登录页拒绝凭据，根因是测试账号实际大小写与输入不一致，且当时密码不是 Logto 中的测试值。修正测试账户后真实系统浏览器登录成功。

此前 CLI 未发现该问题，是因为 harness 使用独立 QA fixture 直接构造授权账户，绕过真实登录页的表单、账户大小写和凭据校验。后续发布验收必须保留至少一条真实 Logto 浏览器登录测试；CLI fixture 只能验证登录后的账户/同步行为。文档和日志不得写入账户、密码、subject、token 或授权 URL。

## 凭据存储

2026-11-21 起产品只支持本地加密文件，设置页不再显示凭据存储选项：

- macOS 使用 `EncryptedFileStore`，本地密钥文件权限为 `0600`，AES-GCM 密文、原子替换、进程独占和完整性校验。
- Android 使用 Keystore 保护的本地加密文件；Keystore 是内部保护机制，不是用户可选的“系统密钥”模式。
- 旧 Keychain 项不读取、不删除。发现旧版 Keychain 偏好或安装标记时，先归档当前绑定到私有会话记录，再清除活动绑定并要求重新登录；备忘录、附件和旧 Keychain 项保留。
- 状态 DTO、IPC、调试命令和 UI 不再包含 `credentialStorage` / `setCredentialStorage`；`platform-keyring` feature 已移除。

macOS A/B 的登录、重启恢复和同步已在本地加密文件模式通过。旧 Keychain 安装的实际升级迁移、Android 强停恢复和发布签名包仍未取得通过证据；Mac↔Android 传输阻断发生在业务会话建立前，不能据此推断 Android Keystore 强停恢复已通过。

## 正式交付边界

- 当前 `src-tauri/target/debug/bundle/macos/CyberNote.app` 是 Debug 手测包，不是 Developer ID 签名和公证后的正式发布包。
- 完整 source export、发布 inventory 的既有差异、许可证/固定源码复核尚未闭合。
- 旧 CyberGrid `.account/grant.json` 不被新实现读取或恢复；旧云端 grant 撤销未验证。
- Android 只有现有 QA debug APK 的运行证据，正式签名包和生产 R8/Rust 组合发布验收未完成。

## 分支和工作树处置

2026-11-19 已完成提交树和补丁等价性审计。四个 CyberBus 功能分支因 cherry-pick 重写历史或后续主分支修复覆盖，分支 tip 不是 `main` 的祖先，但业务代码、审阅回执和验收证据均已在 `main` 找到等价实现：

| 分支 | 工作树 | 审计结论 |
| --- | --- | --- |
| `codex/cyberbus120-core` | 已移除 | 所有补丁在 `main` 有等价提交；保留分支作为来源历史 |
| `codex/cyberbus121-account` | 已移除 | 业务补丁与 `main` 一致；`src/account-client.ts` 的旧错误分类由主分支后续完整分类取代 |
| `codex/cyberbus123-platform` | 已移除 | 平台 inventory/provenance 补丁在 `main` 有等价提交；保留分支作为来源历史 |
| `codex/cyberbus124-network` | 已移除 | 网络 harness 审阅补丁在 `main` 有等价提交；真实网络结论已进入本页和验证 README |

四个来源分支暂时保留，因为它们不是 `main` 祖先，而安全清理规则只允许 `git branch -d`，禁止用 `git branch -D` 强制掩盖历史。对应的四个 worktree 已全部移除；account worktree 原有的两个未跟踪 `checkout.txt` 只记录已失效的临时 review 路径，已随 worktree 清理。

核心迁移先合入主分支提交 `f0401ebf`。随后完成以下清理：

- 三个 detached account review worktree 的提交均已确认由 `codex/cyberbus121-account` 包含，工作树无未提交改动，已用 `git worktree remove` 删除临时目录。
- `git branch --merged main` 审计出的 18 个旧 account、sync、archive、project 和 task 分支已用 `git branch -d` 删除。每个分支的 tip 都是 `main` 的祖先，因此没有代码或提交丢失。
- `codex/cyberbus120-core`、`codex/cyberbus121-account`、`codex/cyberbus123-platform` 和 `codex/cyberbus124-network` 的四个 worktree 已移除；对应分支按上表保留。
- account worktree 的两个未跟踪 `checkout.txt` 仅含临时 review 路径，移除该 worktree 时一并清理。
- 仓库另有 202 个与本轮 CyberBus 收敛无关的历史非祖先分支。它们包含 `main` 之外的提交，尚未完成逐分支业务归档，因此本轮没有强制删除；后续应先建立来源归档或确认补丁等价，再按需要处置。
- 本次没有使用 `git branch -D`、`git reset`、`git checkout` 或 `git clean`。
