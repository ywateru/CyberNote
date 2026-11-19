# Settings121 宿主整合作者验证记录

日期：2026-11-19。作者验证，**不是独立验收或 delivery pass**。用户已将冻结树分派给独立审查者；本文只记录已经完成的命令和证据，不重复运行重型构建。

## 源码与环境

- 工作树：`/Users/water/work/2026/.cybernote-worktrees/settings121-integration`；分支 `codex/settings121-integration`。
- 公共宿主阶段：`6a0e3de100d1119d9b8bf022a38223101c78efaa`。
- 本轮可独立复核冻结点：`dfc5c8415cae07db52610c93eba73ea22f20b507`；其父提交 `1d57e360475453b0b97613e995eaa4174cbd8927` 已导入 updater 5f060a01 修复。
- 冻结后身份修复又由用户导入，写本记录时 HEAD 为 `b5d3c22b23c9ed416dcbeebea8d94f898d398e8c`。**本文的完整 native build / frontend build 证据没有外推到这次后续导入**；后续只复用缓存做需要的增量验证，不建 fresh target。
- macOS arm64；Node `v22.16.0`、pnpm `10.15.0`、rustc `1.97.1 (8bab26f4f 2026-07-14)`、cargo `1.97.1 (c980f4866 2026-06-30)`。
- `node_modules` 链接至用户授权的根仓库依赖目录，只复用依赖；未读写用户笔记、真实服务凭据或账户库。
- 共享原生缓存：`/private/tmp/cybernote-settings121-native-target`。native/check/harness 都沿此缓存，无每树 fresh Tauri 缓存。sidecar 脚本自有输出例外见下。

## 已完成命令、结果及准确范围

所有命令 cwd 均为上述 integration 树。

| 命令 | 结果 | 源码 / 证明范围 |
| --- | --- | --- |
| `pnpm typecheck` | exit 0 | `dfc5c841` 干净冻结点另存专用日志；实际 `tsc --noEmit` |
| `pnpm version:check` | exit 0 | 同冻结点；frontend/Tauri/Cargo `0.1.0` 一致，Android 派生 package.json |
| `git diff --check` | exit 0，空日志 | 同冻结点，干净树；不等于独立代码审查 |
| `pnpm build` | exit 0；2009 modules；Vite `6.4.5`，最后一次 1.69s | `1d57e360` 上提交前的产品输入，随后原样提交为 `dfc5c841`；包含真正 `preferences-menu`。产品指纹见下。存在 >500kB chunk 提示，不伪称无警告 |
| `node scripts/bundle-mcp.mjs` | exit 0；真实 release sidecar，59.37s | 最初四模块公共接线阶段运行。脚本实际 `cargo build --locked --release --manifest-path <本树>/crates/notes-mcp/Cargo.toml`，自身强制 `CARGO_TARGET_DIR=<本树>/src-tauri/target`、默认 jobs=2；不是空 binary。后续 native 构建复用该实际 sidecar；未在这轮改 MCP 源码 |
| `CARGO_TARGET_DIR=/private/tmp/cybernote-settings121-native-target CARGO_BUILD_JOBS=3 cargo check --offline --locked --manifest-path src-tauri/Cargo.toml --lib` | exit 0；最新日志 10.18s，41 项 lib 警告 | updater 5f 修复导入后的 `1d57e360`；生产公共宿主输入与随后 `dfc5c841` 一致；是正常 handler 的实际 crate check |
| `CARGO_TARGET_DIR=/private/tmp/cybernote-settings121-native-target CARGO_BUILD_JOBS=3 cargo check --offline --locked --manifest-path src-tauri/Cargo.toml --lib --features access-boundary-proof` | exit 0；10.29s，43 项 lib 警告 | **历史阶段结果**：`3c04224b` 上未提交的公共宿主开发中检查，早于最终 `6a0e3de1` 和 updater 5f 导入。该日志没有保存当时完整产品指纹，不能声称最终 `dfc5c841` 或后续 HEAD 的 proof feature 已复跑。最终两表注册源码保留在 lib.rs，待后续必要增量检查/独审 |
| `CARGO_TARGET_DIR=/private/tmp/cybernote-settings121-native-target CARGO_BUILD_JOBS=3 cargo build --offline --locked --manifest-path src-tauri/Cargo.toml` | **exit 0；2m 27s；41 项 lib 警告，无编译/链接错误** | `dfc5c841` 完整 native 编译和链接。默认 dev profile，含真实主程序和 native library；不是 release package / installer，不再重复全构建 |
| `CARGO_TARGET_DIR=/private/tmp/cybernote-settings121-native-target CARGO_BUILD_JOBS=3 cargo test --offline --locked --manifest-path src-tauri/src/settings_host/harness/Cargo.toml --lib settings121_` | **6 pass / 0 fail / 206 filtered out**；0.12s | 最终公共 Session/Store/quit 实现提交于 `6a0e3de1`，这些输入在 `dfc5c841` 不变。直接编译生产模块，测试只用临时库，无 Tauri、真实账户、网络或 native window；不运行过滤掉的历史全套测试 |
| `node scripts/verification/settings121-integration/actual-app.mjs` | **桌面 1280×800 / 手机 390×844 均 pass**；各 JSON errors=[] | 最终脚本/前端提交于 `dfc5c841`。实际 App、Preferences、AccountSettings、SyncSettings、四模块 UI；显式合成 native invoke、设备、文件选择器边界。真实产品入口与 handler，**不等于 native commands 运行验收** |

最初 `--locked` 拒绝的确切原因是主 Cargo.lock 的直接 `sha1` 引用在多版本锁中需要消歧。仅改为 `sha1 0.10.7` 后实际 offline/locked check 通过，没有删除校验或无关升级。updater flate2/crc32fast 是用户后来导入的真实依赖；不将其算作作者重解依赖。失败日志在迭代中被成功结果覆盖，本文不伪造仍有该失败原始日志。

## 构建输入、产物身份

生产 Vite 构建时仍有待提交公共改动，`dist/build-info.json` 原值保留：

```json
{
  "schema": 1,
  "version": "0.1.0",
  "releaseVersion": null,
  "mode": "production",
  "builtAt": "2026-11-19T09:14:55.297Z",
  "target": "web",
  "sourceRevision": "1d57e360475453b0b97613e995eaa4174cbd8927",
  "sourceFingerprint": "30b5406e0696287749234826749cbcc12464fb4a44d428de013051e274761967",
  "sourceDirty": true,
  "inputCount": 1238,
  "releasePreparedAt": null
}
```

在干净 `dfc5c841` 执行 `sourceIdentity(process.cwd())` 得到同一 `sourceFingerprint` 和 `inputCount=1238`，`sourceDirty=false`。这证明该 frontend build 的**产品输入内容**与冻结提交相同；不把它的嵌入 revision/dirty 标签改称干净发布构建。`releaseVersion=null` 时实际 UI 展示保守版本比较提示。后续身份修复导入后，当前 fingerprint 可能变化，不以旧包冒充新构建。

| 本机产物 | 大小 | SHA-256 |
| --- | --- | --- |
| `/private/tmp/cybernote-settings121-native-target/debug/notes-clone` | 242790032 bytes | `a7fc7b453bd649edbfeb2f46f8c4b179d3d23c7befba9026a1b8eeaeb0eec272` |
| `<integration树>/artifacts/bundled-mcp/cybernote-mcp-aarch64-apple-darwin` | 8294592 bytes | `0d662506f19c51f08ce88637b12a5833812fb2a573cc16324db9edf3fe968f17` |

上述产物未提交、未安装、未启动读用户库；没有创建 Release、推送或分发。共享 target 会在未来增量编译后变化，摘要只绑定本次已完成产物。

## 6 项真实 Store / Session 证明

1. 两个文档窗口的 quiet probe/prepare/held-media ACK；录音目标受保护时推迟，捕获普通 archive 不初始化 sync identity，参与窗口变化拒绝旧 scope。
2. import 仅一窗 ACK 不得捕获恢复副本；两窗 ACK 后可 stage 当前内容，再走 Session finish 的 additive import，原实体保留、冲突复制。
3. 仅便携设置变化也提交并发布 `CommittedChange.kind=settings`；保留其他本机设置；真实重开保留值；缺失 cloud-setting trigger 时 Store 拒绝重开。
4. inbox-only receive 不提升 application_generation，但改变完整 cloud generation；安装封存期间普通写入/save intent 被拒绝，释放后可写。
5. 两个不同既有 workspace 经真实 cloud StorePort 规范化、receipt-only 收件，再新建完整媒体 scope + quiet apply；附件原字节相同、双方原 identity 不变，旧媒体凭据在新收件后 stale。
6. 安装退出回执必须收齐每窗 seal，再收齐每窗 save；旧 ID、窗口集合变化、失败 ACK 和失败后的迟到成功不能授权退出。

注意第 3 项针对**当前 Cloud 模块旧 owner 结构**，不能关闭独立 Cloud C2 finding；模块修复后必须按新 appearance/presentation owner 接口做增量适配及针对性重验。

## 实际 App 证明及产物

入口均由真实组件操作，native/device 边界通过脚本明确注入；并无 production client 注入或生产 fallback success。

- 未登录的账户页仍能调用 cloud context/status，不要求 CyberBus grant。
- AccountSettings 的“查看冲突（1）”实际 onConflicts → 账户内 conflictsOnly SyncSettings → 选择/确认 → `sync_command resolve`。断言不出现/不调用 pair、startHost、createInvite、resume。
- LocalBackupSettings 的立即备份 → invoke；普通导出和加密导出/导入经真实选择器调用、密码表单、immutable preview/确认载荷到 native invoke。手机 privateOnly 不显示“更改文件夹”。
- 更新按钮 →真实 SoftwareUpdateSettings 检查 invoke，显示发行身份缺失提示；Android unsigned 不显示安装按钮。
- 真实 quit 事件 listener 的 seal/save ACK；保存成功后保持 `.app[inert]`，旧取消 ID 不解冻，原操作取消后恢复。脚本不退出实际进程。
- readiness 在 workspace 与协调 listeners 就绪后发 invoke；未模拟原生 updater 的 PID/helper ACK 完成。

输出目录 `/private/tmp/settings121-integration-app/`，包含 `desktop.json` / `mobile.json`（各 23 个设置宿主相关 invoke、errors=[]），以及 `desktop-backup.png`、`desktop-update.png`、`mobile-backup.png`、`mobile-update.png`。截图是 actual App + fixture，不是原生 WebKit/WebView 或像素一致性验收；未提交大型图片。

## 日志清单

以下为已经完成后核对的本机日志；均保留于独立绝对路径，不把后续覆盖日志解释成本轮旧证据。需要后续运行时使用新文件名保全这些记录。

| 路径 | bytes | SHA-256 |
| --- | --- | --- |
| `/private/tmp/settings121-integration-typecheck.log` | 113 | `1e1bc889434b9e7d90a900823df7634e11b3e35bc94871077e06bbb7e8538833` |
| `/private/tmp/settings121-integration-version-check.log` | 212 | `7b5ac36f5c5f3474e8fe072bc7a431a3c7c3562ca1f0e5dcff880a13c3efe980` |
| `/private/tmp/settings121-integration-diff-check.log` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `/private/tmp/settings121-integration-frontend-build.log` | 1001 | `4ba52042e782cc88aa9219618dfbc2a6edd57a364c01592ee1d9aadfa33855a2` |
| `/private/tmp/settings121-integration-native-check.log` | 20388 | `042a84d0d9a0e371e2003d272e18b7e6e507cb1d7142a5636c7e26298af336ea` |
| `/private/tmp/settings121-integration-proof-check.log` | 20890 | `7a477bc292028163eab13062ce309e421b1e30f8656f437065be62d3b445c250` |
| `/private/tmp/settings121-integration-native-build.log` | 36056 | `662aee0682afdb680a7437ba137d721d080086c3bcfcf0f00bced185f48a0818` |
| `/private/tmp/settings121-integration-store-tests.log` | 1015 | `c9bc825fc5779c28b86e4cfde712a2e5f99fed5ffcc81005675dfeaab06a4cc9` |
| `/private/tmp/settings121-integration-browser.log` | 518 | `13b09d97ac96e0e791590af624a824c1113b9097c1f4ab90a547cb08a2d2357a` |

sidecar 初次命令输出直接记录在会话工具结果，未另存独立日志；成功标记 `Bundled MCP prepared: aarch64-apple-darwin`，实际产物摘要见上。typecheck/version/diff 专用日志在 `dfc5c841` 冻结点为补齐 receipt 重新执行，均 exit 0；没有因此重跑完整 native build。

## 未测与尚未关闭的边界

- 没有真实 WebDAV/S3/GitHub 用户服务、CyberBus 登录/跨设备传输或系统 Keychain 数据访问；host fixture 不替代这些验收。
- 没有启动当前 native 主程序验证真实 Tauri 多窗口、ContentResolver、native IME/剪贴板/麦克风、macOS WebKit、Android WebView/实体设备。
- 没有在真实已安装 bundle 上执行更新替换、旧 PID 退出、新 PID ready ACK、回滚/重启；安装 helper 模块已有独立测试/审查归其回执，本作者构建记录不外推。
- 没有生成本轮 release `.app`/APK、签名/公证或 staging 发布资产。Android unsigned APK 不可安装，UI 仅允许模块定义的下载能力。
- Cloud C1–C5 修复及 owner API 尚待用户导入；当前稳定 public host 已分范围冻结，最终 Cloud 接线仍需适配。updater 5f060a01 的独审通过由用户告知（630d9b31），不代替本树公共 quit/ready 独审。
- RID1/RID3 后续身份修复已导入 `b5d3c22b23c9ed416dcbeebea8d94f898d398e8c`；本文原有 source/build 结果不宣称覆盖该新构建输入。后续复用现有 target 做增量，不 fresh build。
- 独立公共宿主三路审查进行中。本作者不是这份实现的最终独立验证者；发现修复将以新 SHA、新增量日志补记，不改写本轮历史结果。

整合目标持续进行；此 receipt 供 root 汇总已完成证据、避免无意义重复重型构建。独立复核入口为 `src-tauri/src/settings_host/README.md`、`harness/Cargo.toml`、`scripts/verification/settings121-integration/actual-app.mjs`。
