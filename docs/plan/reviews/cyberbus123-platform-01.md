# cyberbus123-platform 独立 review 01

2026-11-18。结论：**blocked**。两条 P2 blocking：首次目录持久化失败后的成功重试未补做父目录 fsync；发布 finalizer 与已提交 core 的 vendor 路径依赖不兼容。没有发现本轮新增的 P1。

审阅提交：`b74eeb637a68370d2b4faae26647be349fa31c50`，父提交 `728cac3815c3cc5b9932e50699a4072467bb25f3`。工作树 `/Users/water/work/2026/Apple-Notes-Clone-cyberbus123`，分支 `codex/cyberbus123-platform`。审阅者不是实现作者，已读完整变更、任务、迁移设计和 `docs/verification/cyberbus120/platform.md`，未将作者报告当作独立执行证据。

后续收到的 core integration 输入固定为 `c3ea6dc7d315ecf750540041edf6dd10083c00b1`。仅通过 Git 对象读取其 Cargo/vendor provenance 以核对发布边界；未合并、修改或审阅其内部实现，core 独审由另一 agent 承担。account 尚未合入。

未 spawn agent、使用设备、安装/启动应用、查询或修改线上服务、操作原 Notes 或用户资料库。未改产品代码和作者验证文件；只新增本报告及旁目录 fixture。Gradle/JVM/前端检查使用独立临时构建与合成数据。

## Findings

### F1 — P2 / blocking：首次目录创建的父目录 fsync 失败后，成功重试绕过该耐久性屏障

- 设计：`docs/architecture/cyberbus-migration-20261118.md:33` 要求安装 SecureStore 原子替换、失败关闭，存储降级显式报错；`plugins/tauri-plugin-notes-auth/README.md:45` 起承诺原子且耐久写入、无弱化回退。
- 代码：`plugins/tauri-plugin-notes-auth/android/src/main/java/com/local/notesauth/CyberBusSecureStore.java:28-33`，尤其 `syncDirectory(base.toPath())` 只在目录不存在的分支执行。
- 复现：创建 `cyberbus` 后注入父目录 fsync 失败，第一次 lock 返回 `storage`，尚未创建 key，目录仍存在。随后同进程正常重试 FirstInstall，成功生成 key、写 marker、save/load；整个成功重试只 fsync 子目录 **4 次**，父目录 fsync **0 次**。
- 影响：曾明确失败的目录项持久化没有在重试中得到确认，却向调用者交付成功的 store/写入。断电后不能依赖 `cyberbus` 目录名仍存在；Keystore key 若保留，恢复将进入无法读取安装记录的状态。未实测断电或声称必然丢失，finding 是可复现的耐久性屏障缺失。
- 独立证据：`cyberbus123-platform-01/public-wrapper-probe.py` 编译**提交中的原样生产 Java**，替换 Android Context/Os/KeyStore 为仅供 host 使用的 shim/provider。真实 host NIO、AES-GCM、文件锁和 atomic move 仍执行。输出 `F1 observed retry parent fsync count=0, successful child-directory fsync count=4`，最后按契约断言退出 **1**。这不是 Android Keystore/断电测试。
- 修复验收：成功首次 provisioning，包括遗留空目录和竞争创建路径，均须完成需要的父目录 fsync；该 fsync 持续失败必须继续报错。上述断言应变绿，并保留“已有 key/marker/blob 不得当新安装重置”的限制。不能通过删除目录/Keystore alias 来绕过。

### F2 — P2 / blocking（integration）：finalizer 拒绝已提交 core 的合法 vendor 依赖，且不收集该源树

- 设计：`docs/architecture/cyberbus-migration-20261118.md:63` 要求源码/lock 固定 SDK 来源、不缺漏新 crate、不依赖开发机兄弟目录；`scripts/publish/README.md` 的 CyberBus integration inventory 宣称 core/account 合入后使用此 finalizer。
- 代码：`scripts/publish/cyberbus-manifest.mjs:14-18` 强制 `cyberbus` 和 `cyberbus-auth` 都是 Git 依赖；`:14`、`:23-35` 只收集 adapter/native/account 路径及 adapter first-party ownership。
- 确切输入：core `c3ea6dc7` 的 `crates/notes-cyberbus/Cargo.toml:15` 使用 `cyberbus = { path = "../../vendor/cyberbus/crates/cyberbus" }`；auth 仍固定 Git revision。`vendor/cyberbus/README.notes.md` 记录原 SDK SubscribeData 对自定义 descriptor 的限制及不可变本地 schema constructor patch。vendor 内部 auth/protocol/transport 继续固定 `359465e83bd74b571a963f3d1fdc238f50169919`。
- 复现：`cyberbus123-platform-01/integration-inventory.mjs` 用 core **已提交的真实 adapter Cargo、vendor 文件和 core lock**，提供显式标注为 fixture 的无旧 owner native Cargo/lock 输入，调用未修改的 platform finalizer，得到 `SDK dependencies must use the reviewed exact git revision`。错误发生在 native owner/lock 检查前，故不能归因于 account 尚未合入。这是输入兼容性检查，**不是组合构建或完整 account manifest 验证**。
- 即使仅放宽上述检查，当前路径选择仍不会加入 `vendor/cyberbus/**` 或其 third-party 来源/许可证声明，真实 platform manifest 中也没有这些输入。集成需明确加入经过审核的 vendor 输入和 ownership；不能只使 Cargo 检查通过，或把 vendor 误标为项目自创源码。无需在本 review 合并另一 agent 的实现。
- 修复验收：使用已审核的本地 SDK patch 路径，验证 retained vendor Cargo 的依赖 pins、原始 revision、patch/provenance 与 licenses，纳入全部构建所需文件；拒绝兄弟路径、错误 pins/未审核 bytes。合并真实 account 后，在准确 committed tree 上运行 finalizer、export、独立导出目录的 locked 构建。
- owner 边界：`:20` 的 `/crates\/account-auth/` 文本匹配会拒绝单纯保留类型/取消工具的依赖，**不能据此认定仍有双 grant owner**。account 最终是否移除该 crate 尚未确定，本 review 不将这一未定输入另判为已发生的阻塞缺陷。修复应核对实际生产创建/restore 调用链，或在最终账户实现中彻底移除依赖。

### F3 — P2 / nonblocking（既有基线；仍阻塞最终发布）：真实源码 inventory 有 62 项哈希不匹配

- 设计：`docs/architecture/cyberbus-migration-20261118.md:63`；`scripts/publish/README.md` Export contract 要求提交字节与 manifest 一致。
- 位置：`scripts/publish/manifest.json` 的 `files`；校验位置 `scripts/publish/policy.mjs:129-140`。
- 独立执行 `node scripts/publish/export.mjs --ref b74eeb637a68370d2b4faae26647be349fa31c50` 返回 **1**：`Export hash mismatch: index.html`。逐条比较提交对象，platform 与其父提交各有 **62** 个 mismatch；不是本次新增的 62 个回归。
- 只在内存刷新 platform 哈希后，policy/license/secret scan 通过；**没有写回 manifest，也没有把这个结果记为源码导出通过**。新 adapter/vendor 缺失另外见 F2。需集成者逐项审核基线变化并更新 committed manifest 后重跑严格 export。

## 独立执行结果

| 检查 | 结果 | 证据与实际范围 |
| --- | --- | --- |
| `node --test plugins/tauri-plugin-notes-auth/*.test.mjs scripts/publish/*.test.mjs` | pass，31/31 | 包括原有 21 个 host vault contract cases、独立 JVM 锁竞争、helper 拒绝、license sidecar；host 合成 key 不等于 Keystore |
| `pnpm typecheck`；`pnpm build` | pass | 1,991 modules；仅既有 chunk-size advisory |
| `node --test docs/plan/reviews/cyberbus123-platform-01/dto.test.mjs` | pass，2/2 | 新 reasons 的固定文案与有限恢复；拒绝 credential/storage 额外字段；CyberBus observation age=3000 接受、3001/跨 generation/非法 sample/离线/本机/扩展字段拒绝；unknown/unavailable 无路线推断 |
| 独立 public wrapper host probe | 前置安全用例 pass；F1 blocked | 非 canonical/错误/symlink root、root AAD 拷贝拒绝、同进程冲突、restart、missing/模拟 locked key、损坏 marker/blob；Existing/FirstInstall 均不生成替代 key。最终 fsync 契约断言为 red |
| Android API36 `javac -source 8 -target 8` | pass | 两个原样生产 Java；仅 bootstrap classpath advisory |
| `javap -s -private` | pass | private constructor；四个公开方法 descriptor 与约定一致，见下表 |
| Android build-tools 36.0.0 D8 `--min-api 26` | pass | 真 SDK android.jar 编译/DEX，非 shim 编译 |
| 隔离 Gradle 9.6.1 / AGP 9.3.1 / Kotlin 2.2.10 / JDK17 `--offline --no-daemon :notes-auth:assembleRelease :notes-auth:lintRelease` | pass | **64 tasks executed**，真实 release library AAR 和 lint；Tauri 2.12.5 来自本机 Cargo registry，plugin 源码来自审阅 commit；没有运行 Tauri init、应用构建或安装 |
| release AAR 内容/consumer keep rule | pass | JNI class、SecureVault、原 Kotlin plugin、`proguard.txt` 均存在；不等价于最终 APK R8 后 JNI 实调 |
| committed core Cargo/vendor 与 finalizer | blocked，F2 | 明确区分真实 core 输入和 native account fixture，无合并操作 |
| 精确提交 source export | blocked，F3 | `index.html` 首错，62 项 baseline mismatch |
| 实际 platform manifest 清点 | 部分 pass / 集成 blocked | 两个旧 helper 二进制均不在 files，runtimeAssets=[]；**notes-cyberbus 与 vendor/cyberbus 均尚未包含** |
| 历史 `scripts/verification/account109-status-dto.test.mjs` | 24/25，既有失败 | timeout 文案断言不符；`baseline-dto.mjs` 对父提交原样 TS 在隔离路径重跑亦 24/25、同一失败，不改历史测试 |
| `git diff --check` | pass | review 提交前检查 |

JNI descriptor 实际读取结果：

| 方法 | descriptor |
| --- | --- |
| static `lock` | `(Landroid/content/Context;Ljava/lang/String;Z)Lcom/local/notesauth/CyberBusSecureStore;` |
| `load` | `()[B` |
| `save` | `([B)V` |
| `close` | `()V` |

隔离产物 SHA256（临时编译产物，已随 owned temporary directory 清理，不作可分发 APK）：

- release AAR：`83032b513254f84a8ca28ec12f298d0299c108f259b8dcc264c367457be33e04`
- DEX：`fe57b9d2c5dc97e3649570dd88d35f82f955fab3c981e3ecbb293abf159f7750`

API 兼容性额外核对了 Android 8 / API26 libcore 的 `UnixFileSystem.standardFileAttributeViews`、`UnixFileSystemProvider.getFileAttributeView`，含 `posix`/`unix`，没有把 `unix:nlink` 当成未经核查的 host 专属 API。来源：[UnixFileSystem](https://android.googlesource.com/platform/libcore/+/android-8.0.0_r1/ojluni/src/main/java/sun/nio/fs/UnixFileSystem.java)、[UnixFileSystemProvider](https://android.googlesource.com/platform/libcore/+/android-8.0.0_r1/ojluni/src/main/java/sun/nio/fs/UnixFileSystemProvider.java)。源码核对、lint 和 D8 仍不证明各设备文件系统/Keystore 运行行为。

## 存储与 IPC 审阅边界

`SecureVault.java:51-67` 在 FirstInstall 下拒绝 marker/blob/key/临时文件证据；Existing 要求 marker/blob/key 全部存在且可解密。读写失败 poison 当前 owner，未发现删除 key、自动 fallback 为新安装或明文 store。host round-trip、错 key、missing/corrupt、同/跨 JVM 锁、根路径 AAD、hardlink/symlink、旧密文回滚和三阶段 fsync 异常恢复均已执行；这些结论不能延伸为真实 Android key invalidation 已通过。

`SecureVault.java:113-165` 对临时文件 `force(true)`，同目录 `ATOMIC_MOVE`，再 directory fsync；pending/current marker 把后续恢复限制在已知旧/新密文。未发现非 atomic move/无 fsync 的 fallback。F1 是 public wrapper 创建根目录时的父目录问题，不应被上述三次子目录 fsync 注入测试通过掩盖。

root 是 app Context 的 canonical no-backup 目录加 `/cyberbus`，package alias 为安装级 singleton；load/save 无路径参数。代码及 Tauri command/capability/invoke handler 审阅未见新 vault/密钥方法暴露给 JS；Java 公共类没有 `@Command` / `JavascriptInterface`，R8 keep 仅使 JNI 可达。**当前 account 分支还没有通过这条 JNI 创建链调用它**，后续必须核对实际 ClassLoader、GlobalRef、异常清理及 drain 后 close；不能把“未暴露 JS”误写成“Rust JNI 集成已验”。

一个安装 vault 跨账户保留，本身不按用户 workspace 改 root；这是合理的安装身份生命周期，不能为账户切换重新 provisioning。host 模拟 key locked/missing 只验证错误控制流。用户 A/B grant、设备目录分区及退出后 A 数据不会被 B 恢复，取决于 core/account 的持久记录和认证 owner，当前无法仅凭 Java 不透明 byte[] store 证明。

## 集成验收门槛（当前均未通过，不新增平台实现归责）

1. 合并审核后的 core/account/vendor，修复 F2、完成审核过的 manifest/第三方 ownership，严格 committed export；在独立导出目录执行 locked Cargo/前端/Android release APK 构建，检查最终 APK 不含 helper、R8 后类/签名存在，以及 macOS 打包不依赖 retired helper。Gradle app 配置 `src-tauri/gen/android/app/build.gradle.kts:37` 与 staging `scripts/publish/stage-packages.py:94` 的拒绝规则已查，**不是最终产物验包**。
2. 真实 Rust → application Context ClassLoader → JNI → AndroidKeyStore，核对 StoreMode 与 firstInstall 一致；异常正确映射 Conflict/Storage、没有 Existing→FirstInstall 降级；shutdown/drain 后释放 owner，临时 secret buffer 清零，不进入 renderer/logs。
3. 使用隔离测试 app/资料目录验证设备 API26+ 与目标真机的 GCM/Keystore、锁定或不可用/失效 key、restart、missing/corrupt marker/blob、first provisioning 中断、atomic rename/fsync 与恢复。F1 修复后复核；不把本 review shim 或作者之后准备的脚本本身当真机通过。
4. 真实账户 A→logout→B→restart→A，核对同一安装身份持久、grant 不串用、目录和 workspace 按账户/产品分区、异账户拒绝；不能依靠单 vault 或 host key fixture 推断账户隔离。
5. account native DTO 实际序列化到前端：确认 registry UUID 与 SDK ID 的职责、有限 providerReason/transportGeneration 语义、暂停仍发现、未知结果不自动登录/重放。现有 TS 接受 registry UUID，尚未测试未来 account 输出。
6. 合并后的真实 Logto、多端 authenticated transport 和完整笔记/附件同步按设计第 69 行验收，不能用旧 SDK 记录、host vault 或单 library release 通过替代。

本 scope 的 DTO、host vault 主要安全控制、Java/JNI 编译契约、release AAR/lint、helper 拒绝策略已有可复核 pass；F1 需平台修复，F2 需对齐已提交 core 的集成发布契约。**本 review 为 blocked；不宣称组合迁移、真机安全生命周期或最终发布通过。**

复跑入口均在 `docs/plan/reviews/cyberbus123-platform-01/`：`public-wrapper-probe.py`（当前预期 red/exit 1，F1）、`integration-inventory.mjs`（成功复现 F2 时 exit 0，非集成 pass）、`dto.test.mjs`、`baseline-dto.mjs`、`android-build.py`。这些 fixture 不属于产品/发布 manifest。
