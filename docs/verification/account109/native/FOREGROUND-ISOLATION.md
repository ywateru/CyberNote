# 账户 foreground 服务隔离修复

账户模式与手工模式共用 Session apply coordinator 的 `active` 标志。旧 `sync::adapter::Runtime::foreground` 只检查该标志，会调用 `activate`，额外打开手工 `SyncService::new(policy=None)` 及 `.sync/identity-v1.json`。账户服务自身仍使用 `.account/noise/identity-v1.json` 和 `with_policy`；本次发现不是账户凭据被手工服务复用。

修复只在 foreground 入口增加持久 binding 检查；有账户 binding 时由账户 Runtime 独自恢复服务。没有账户 binding 的现有手工同步恢复路径保持原实现。退出或暂停保留 binding，显式手工 StartHost 也继续返回 `sync_workspace_mismatch`。

真实 Store 测试先确认没有手工 Noise identity，再激活账户并调用 foreground。旧实现产生手工 identity，准确断言得到 `Some(device)`，保留在 `foreground-red04`；修复后账户 9 项通过，包括同一设备/key保持和暂停后手工启动拒绝。手工 adapter 7 项通过。原测试最初把共有 `.sync/blobs` 目录当作手工身份，导致过宽断言；这些工具失败及一次缺 import 的编译失败均保留并明确分类，不能当作产品反例。源码、日志原路径、原 SHA 与归档 SHA 见 `foreground-checks.json`。

`92c6ffb9` 的 Android arm64 库实际链接已通过，ELF 为 AArch64，依赖为 Android 系统库；该产物在本 foreground 修复前生成，不是待安装候选。按主代理要求，修复合入且给出 exact 主线候选后再构建隔离 APK。没有设备操作。

隔离构建已在外部准备 `/private/tmp/account109-android.init.gradle`，沿用 Sync108 init-script 方式，仅对 debug 增加 `.account109` 后缀和 `CyberNote Account Test` 名称，保留生产 namespace。新包为 `com.local.notesclone.account109`，避免覆盖原用户包，也避免复用原 Sync108 C 已配对的手工 workspace。原 Sync108 测试包及合成数据保留。实际候选构建仍须核对 APK package/activity、provider ELF、deep-link filter、源码及 APK SHA，再按后续 exact 授权安装。
