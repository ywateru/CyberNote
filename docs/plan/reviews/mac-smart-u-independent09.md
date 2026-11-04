# Smart U09 Mac 准确产物独立核查

**结论：pass，仅准确 Mac 产物来源、完整封存及派生本地 adhoc 签名门槛。** 源 HEAD `7ab867d416f48ea23913907c87fd6d058833e1cb`，产品与源码窄修独审通过的 `8e8fe7e320e34a2b9c27bf7c7e794662ad988da4` 在本批 301 个产品路径上完全一致。没有确认的 P1/P2/P3 blocking 或 non-blocking finding。本结论不授予安装、启动、持久化、原生输入、像素或 Android 验收。

## 来源与构建输入

核查 root 的 `smart-u-device09-preparation/mac-authorization.json`、准确 freeze SHA-256 `33d823170db2ed0685ccdbd26af6a0cd459dcc124d73f409aa28fec08c658561`、唯一 `mac-attempt01` build 和 collection 原始记录，授权/source/stage/nonce/结果 hash 全链相符。独立重算 301 项产品 aggregate 为 `b02f0a58b0ff5bc31cb9d09437fd73b32645b5f198d781336196fe2060b75897`；320 项显式完整输入 aggregate 为 `abf3f38aceb7cc93100e27ca3bca1848d3d12bba5999835d2a501346522efab6`。

301 个产品路径的实际文件与准确 source git blob 相同，也与已独审 fix13 的 git tree 相同。当前 320 项源/已列生成/补丁依赖输入逐项匹配 freeze；构建前后、收集前后四个完整快照除采集时间外均与 freeze 完全一致。tool/version、选定父环境、实际构建环境、OCR cache 和 supplemental overlay/distribution 身份记录前后相同，6 份 canonical Python 工具当前字节亦与冻结相同。本轮没有重新执行 capture、工具版本探测或读取 target/cache 内容；对 cache/环境的前后结论以固定记录一致性为限，不能推导完整 OS/SDK/传递依赖可复现性。

canonical build 命令确为 `pnpm mac:build`，offline/jobs2、600s 上限；退出 0、耗时 39.091s，自有进程组已停止且无剩余成员。collector `ready=true`、所有 15 项输入比较为真、supplemental 无变化。原始 build 日志、输入四快照及 13 条 collector 命令与其原始日志逐条匹配，未发现 invalidated/cleanup error/隐藏重试等状态。

## 旧输出隔离和完整包

`output-isolation.json` 与 build 内嵌记录一致：旧 app 与旧 dist 先原子改名，原固定路径在执行构建前被记录为不存在。独立读取 `prior-outputs` 验证文件、目录权限、完整列表、原目录 inode/device 均与隔离前快照相同；旧可执行 SHA 为 `dd120de30bbba231faa1635265c8924b453d8055482745e2c447ad1909dc893f`，与此次新原件不同。新原件完整文件列表与该次 generated-output/buildOutputIdentity 一致，当前 dist 的完整 3 项资源与 build 生成快照一致。没有使用旧输出或单独复制可执行文件冒充完整 app。

| 实物 | 字节 | SHA-256 |
| --- | ---: | --- |
| `mac-original.zip` | 4,938,722 | `d935f86ab7d25c95b953fe70c6bf4c883b1837198a6006067f86d899228c8adb` |
| 原始可执行文件 | 16,375,584 | `33c5635855372ec7f8fe6c6110d813366b645335b259bff549d5b6e55e1262a5` |
| `mac-sealed.zip` | 4,866,554 | `02d51696b6d350847835ec596e244c526074c4d3793e2d494dc3b0e51ae8a663` |
| 派生可执行文件 | 16,298,512 | `32613a70664293b214b1713293a3744570b0c13f1f37ce588267a5b162842191` |

完整原 app aggregate：`8f83498605cedf1f9eb981a16d53043c5a23c08efd23fd950cd1838804059880`。完整派生 app aggregate：`c3674acf458db8cda813685a888bdfc297b7bd29ac36bf076694bc9dce3e0aed`。两 ZIP 在内存中逐项核对：无重复 entry、CRC 正确，完整 app payload 字节/hash/权限与磁盘对应 app 一致，未解压改写产物。

## 签名与允许差异

原件与派生件实际差异准确限于 `Contents/MacOS/notes-clone` 和新增 `Contents/_CodeSignature/CodeResources`；Info.plist 和其他原件未变。collector 对原件的 deep/strict exit 1 被完整保留，错误为 `code has no resources but signature indicates they must be present`；它不是已验证签名原件。approved canonical 流程明确允许保留这一原件结果，要求单独派生件验签通过。

本轮另执行全新只读 codesign 核查，未重新签名：

- 原完整 app deep/strict 再次 exit 1，错误与记录一致。
- 派生完整 app `--verify --deep --strict --verbose=4` 再次 exit 0，显示 valid on disk 并满足 Designated Requirement。
- 派生签名显示 identifier `com.local.notesclone`、arm64、adhoc、TeamIdentifier not set；entitlements/requirements 展示命令正常。它没有 DeveloperID 或公证结论。

本批 38 项作者来源/封存实物在开始时单独冻结，核查结束逐项 hash 全部不变。可执行中的压缩前端资源没有独立反解；对应关系建立在准确输入、原子输出隔离、canonical 构建日志、新输出身份和完整包封存链上，不能升级为独立重现构建。

## 独立记录与限制

证据目录：`docs/verification/unified-candidate06/mac-smart-u-independent09/`。`result.json` 有 1,056 项通过的身份/完整性断言，这些是核查断言数，不是 1,056 项产品功能测试。`fresh-signature-checks.json` 保存 6 条新只读签名/格式命令。`input-manifest.json` 固定 38 项来源；README 和 evidence-index 标明有限结论。

首次 reviewer 脚本适配在最终生成 sourceEvidence 列表时残留了旧批次 `delivery-manifest.json` 文件名而退出 1；该批并不要求或产出此文件。保留 `verify.fixture01.py`、`attempt01.json` 与完整 stderr/stdout。只删除不适用的最终证据引用后，`attempt02` 全部断言通过、exit 0；没有修改产品、作者记录、产物、签名或核查条件，也没有将这项 reviewer 适配失败当成产品失败或隐藏。

Android 同批尝试的 offlineMarkerMissing 失败仍为独立未收集状态；此 Mac 结论不涉及任何 Android 包或安装许可。后续 GUI/安装、实际启动/冷启/输入/侧栏回归和像素差分由 root 另行执行。用户暂停的原版删除实验没有开展。

本轮没有重 build/test、GUI、安装、ADB、target/cache/产品/工具写入，也没有 stage/commit。仅新独立证据及本 review；最低可用空间约 69.9GB，独立命令均有界。

**STOP；共享 host target/cache 已释放。** Mac 准确封存和派生本地签名门槛已独立通过，有限结论按上述边界使用。
