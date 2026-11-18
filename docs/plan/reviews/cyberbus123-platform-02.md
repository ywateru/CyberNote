# cyberbus123-platform 独立 review 02

2026-11-18。结论：**pass（本次两项 blocking 修复）**。review-01 的 F1、F2 均关闭；本次未发现新增 P1/P2/P3 blocking。**最终组合发布仍 blocked / 未验收**，不把输入兼容性、host fixture 或 library AAR 通过记为账户集成、真机 Keystore 或完整 export 通过。

审阅提交：`a4c85d3242a4a792b6374696a507e678b4672047`。真实 core 输入：`2b24104a294223382b9bff1aae793dd6e4b7aa61`。在 `codex/cyberbus123-platform` worktree 独立读提交差异并执行 CLI；只新增本报告及旁目录 fixture，不改产品、不重写 review-01、不刷新 manifest、不合并 core/account、不 spawn、不使用线上/设备/原 Notes。前次 baseline audit `a52f03de` 已交付，本次不扩展其实现范围。

## Findings 复核

| Finding | 原级别及门槛 | 本次结果 | 设计及代码位置 |
| --- | --- | --- | --- |
| F1：父目录 fsync 失败后重试绕过屏障 | P2 / blocking | **closed / pass** | 设计 `docs/architecture/cyberbus-migration-20261118.md:33`；`plugins/tauri-plugin-notes-auth/android/src/main/java/com/local/notesauth/CyberBusSecureStore.java:28`、`:35` |
| F2：真实 core vendor path 被拒绝、源树/ownership 缺失 | P2 / blocking（integration 输入契约） | **closed / pass** | 设计 `:63`；`scripts/publish/cyberbus-manifest.mjs:16`、`:30`、`:42`、`:54`、`:76`；`scripts/publish/notices/cyberbus/runtime-source.json:1` |
| F3：既有 62 项 manifest 哈希不匹配 | P2 / nonblocking 于本模块；blocking 于最终 export | **open / blocked（既有集成门槛）** | `scripts/publish/manifest.json`；`scripts/publish/policy.mjs:129`；详见 `cyberbus123-baseline-inventory.md`，不重复扩大审计 |

### F1：关闭依据

父目录 fsync 已移到“目录是否新建”的分支外，在每次 `firstInstall` 上执行，先于 Keystore load/key 创建和 SecureVault provisioning。遗留空目录、前一次 mkdir 后 fsync 失败的重试，以及并发 mkdir 路径都经过该屏障。没有加入删除 key/marker/blob、重置安装或弱化存储的 fallback。

独立 `cyberbus123-platform-02/fsync-retest.py` 从 Git 读取 **a4c85d32 原样生产 Java**，复用未修改的 review-01 Java harness 与 host shim，再增加持续失败三次的控制：每次只有父目录 fsync 尝试，均返回 storage；没有创建 key、install/vault、临时文件或 owner.lock。解除故障后，父目录屏障先执行，单次生成 key、保存成功；Existing 重开保留同一记录。预先存在的空目录也先执行父目录 fsync。

成功 provisioning 的计数为 **父目录 1 次、子目录 4 次**。原 harness 的 `successful child-directory fsync count=5` 标签实际统计全部事件，故保留原 fixture、不据此误称子目录五次。旧脚本固定读取 b74eeb63：本次重跑仍 **exit 1**，父目录 0、子目录 4，末尾相同 F1 断言失败；这是保留的故障正控。旧脚本、Java 和旧报告相对 `94d0dd25` 逐字节无改动。

原 harness 的 root validation/AAD、missing/模拟 locked key、corrupt marker/blob、FirstInstall 不自动重置、争用及 restart 也在新代码上通过。host shim 使用合成 provider，真实 host NIO/AES/文件锁仍执行；**不证明真实 Android Keystore、key invalidation 或断电耐久性**。

### F2：关闭依据

独立 `cyberbus123-platform-02/inventory-retest.mjs` 使用 core **2b24104a 的全部 9 个 adapter 文件和 30 个 vendor 文件**，不是复制作者的 adapter 占位内容。加载的 finalizer/policy/export/provenance 字节与 a4c85d32 Git 对象比对。native Cargo、account 文件及 native lock 明确是隔离 fixture：native lock 借用真实 adapter lock，**不声称它是合入账户后的 application lock**。

独立断言通过：

- `cyberbus` 精确本地路径 `../../vendor/cyberbus/crates/cyberbus` 被接受；auth/protocol/transport Git 来源和 revision、两份 lock 中 local runtime 与唯一 SDK 包检查通过。
- 30 个 vendor 文件与 provenance 清单路径集合及 SHA256 完全相同，包括 extensionless MIT/APACHE licenses、README patch 记录和 runtime 源码；9 个 adapter 输入全部加入结果。
- adapter 声明为 project-authored/reserved first party；vendor 声明为原 upstream `https://github.com/osd-pub/CyberBus.git`、revision `359465e83bd74b571a963f3d1fdc238f50169919` 的 third party，保留两份许可证；重复 finalization 不重复 owner，删除的 migration pin 会移除。
- 14 个负控按预期拒绝：缺 license、改 runtime、加 vendor 文件、改 patch 记录、兄弟 runtime 路径、auth Cargo 错 pin、native/adapter lock 各自错 source pin、缺 auth lock 项、重复 local runtime、冲突 vendor owner、旧 CyberGrid 生产依赖、未审核 adapter 文件、无关 source pin 不匹配。
- 无关 pin 没有刷新。仅保留 `account-auth` 被动类型依赖的 fixture 被接受，未据 crate 名称误判双 grant owner。

`runtime-source.json` 的 reviewedPatchCommit 仍为 c3ea6dc7；独立 `git diff --exit-code c3ea6dc7 2b24104a -- crates/notes-cyberbus/Cargo.toml crates/notes-cyberbus/Cargo.lock vendor/cyberbus` 无差异，因此该 provenance inventory 与最新 core 的这部分输入兼容。没有据此评审 core 内部实现或背书全部后续 core 行为。

生产 sole grant owner 的门槛在 `scripts/publish/README.md:181` 明确保留：account reviewer 仍须追踪实际 startup/restore/callback/logout（包括别名/包装），确认只有 SDK owner，无旧 AuthClient/token provider/grant.json owner。finalizer 通过仅证明清单契约；移除依赖名的误判不等于已证明生产账户 owner 唯一。

## 本次 CLI 结果

| 命令/检查 | 结果及范围 |
| --- | --- |
| `python3 docs/plan/reviews/cyberbus123-platform-01/public-wrapper-probe.py` | **expected red / exit 1**，固定 b74eeb63 的 F1 正控；前置安全用例 pass |
| `python3 docs/plan/reviews/cyberbus123-platform-02/fsync-retest.py` | **pass / exit 0**，原 harness 对固定 a4c85d32 变绿，新增持续失败、恢复及空目录控制通过 |
| `node docs/plan/reviews/cyberbus123-platform-02/inventory-retest.mjs` | **pass / exit 0**，最新 core 9+30 文件、ownership、14 负控 |
| `node --test plugins/tauri-plugin-notes-auth/*.test.mjs scripts/publish/*.test.mjs` | **34/34 pass，0 skip**；包括 21 项 host vault contract、DTO/IPC 检查、helper/发布 policy 测试；不是生产 export |
| `python3 docs/plan/reviews/cyberbus123-platform-02/android-build.py` | **pass**；固定 a4c85d32，API36 android.jar 编译、javap、D8 min26、隔离 offline Gradle release AAR + lint，64 tasks executed |
| AAR class/keep rule、JNI descriptor | **pass**；类、SecureVault、NotesAuthPlugin 及 consumer keep 存在；`lock(Context,String,boolean)`、`load()[B`、`save([B)V`、`close()V` 未变 |
| `node scripts/publish/cyberbus-manifest.mjs`（无 `--write`） | **blocked / exit 1（预期集成门槛）**：当前 platform HEAD 没有合入 adapter/account，报 `Merge committed core/account migration inputs first`；未执行 full export |
| 只读 committed pins 对比 | a4c85d32 与 b74eeb63 为同一组 **62** baseline mismatch；旧 helper 二进制仍不在 files、runtimeAssets=[]；无刷新或 export |
| 旧 review/fixture 保留、`git diff --check` | **pass** |

Android 使用 JDK17、SDK/build-tools36、Gradle9.6.1、AGP9.3.1、Kotlin2.2.10，Tauri2.12.5 本机 registry 源码。仅现有 Java bootstrap classpath/AGP/Kotlin deprecation advisory，build/lint 无失败。隔离产物随临时目录清理：

- release AAR SHA256：`4e1fee6244320a1ab036ee860ebba7dcc6f287bc9d0caf2a3ed2fb7515e26496`
- DEX SHA256：`cdb6c1e3aa15d20c107c84e8ba97bab08406fd6b4b19db4fc853b6c7d0c57b67`

## 最终集成与手动验收边界

本次没有执行全量 baseline export、回填 62 哈希或补 baseline 依赖缺漏。严格 `readInventory` 仍检查无关 pin，不会因 F2 修复自动完成 baseline。integrator 应按已交付 baseline audit 审核并提交合法清单更新；然后在真实合并的 core/account/platform committed tree 上执行 finalizer、完整 export、导出目录的 locked Cargo/前端构建与最终 APK/macOS 产物检查。当前 standalone finalizer 先停在缺 core/account，不能把它写成已跑到 baseline hash 检查或最终发布已通过。

UI/设备部分仅留手动验收说明，状态均 **未执行 / pending integration**；必须用隔离测试 app 和合成资料，不能操作原 Notes：

1. API26+ 与目标真机经真实 Rust→Context ClassLoader→JNI→Keystore 调用，核对 minified release APK 中类/签名、Existing/FirstInstall 映射与 drain 后 close；检查 key 锁定/缺失/失效、marker/blob 缺损和中断重试均显式 storage/conflict，设备身份不静默重建。记录最终 APK SHA、设备/API 和实际结果，禁止把 host shim 当真机证据。
2. 在账户界面用隔离 A/B 测试账户验证 A→退出→B→重启→A；安装身份稳定、workspace/资料按账户分区，B 不能恢复 A grant/数据；失败不能自动改为 firstInstall。UI 状态不得显示 secret/path 或虚构成功。
3. 结合 account owner 独审核对登录/回跳/恢复/退出只有 SDK 一条生产链；JS invoke/capability 不增加 vault/key IPC。模块静态检查通过仍需确认真实集成边界。
4. 真实多端网络、同步结果及 UI 操作按设计第 69 行交验证 agent 验收；本次 library release、DTO 与输入清单结论不覆盖该项。

**交付判定：a4c85d32 的两项平台 blocking 修复可交付；F3 与实际账户、真机、组合构建/最终 export 门槛继续保留。**
