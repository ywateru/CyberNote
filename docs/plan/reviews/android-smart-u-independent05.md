# Smart U09 Android05 准确包独立核查

**结论：pass，仅准确 Android05 APK 的来源、完整输入、实际 init 执行、输出隔离、完整包、ABI、模型与签名门槛。** 精确源提交 `e482dac285a1e2b66f88bac035824b7c98e832a7`；没有确认的 P1/P2/P3 blocking 或 non-blocking finding。设备安装、实际升级、运行、输入、首次离线 OCR、音频、持久化和像素一致性仍须分别验证。

独立证据位于 `docs/verification/unified-candidate06/android-smart-u-independent05/`。`verify.py` 首次运行退出 0，686 项身份/完整性断言通过，耗时约 3 秒；这些是包来源与完整性断言，不是 686 项产品功能测试。完整 stdout/stderr 与命令记录保留，没有 reviewer 失败或重试。仅新增本报告与独立证据；没有修改产品、规范工具、作者证据、旧失败记录、Mac09 封存或签名，没有 stage/commit。

## 准确授权、冻结及输入

root 授权 `smart-u-device09-preparation/android-build05-authorization.json` 的 SHA-256 为 `c6dd1cd54f0be54381658d7a713d13f5887a65a37afed93f0fe46d3e287446e9`；freeze SHA-256 为 `189ee0d17005187bdfc9902f969de3dd724f3a619f1d637f3b3abd09f48544c2`。授权的 stage/source/run/artifact 目录、301 项产品路径与 320 项完整输入路径，与准确 freeze 和作者记录逐项相符。冻结摘要与 root START 记录指向同一文件身份；freeze、build、collection 时间顺序相符。

独立重算当前 320 项源/已列生成/补丁依赖输入，完整聚合为 `abf3f38aceb7cc93100e27ca3bca1848d3d12bba5999835d2a501346522efab6`；其中 301 项产品聚合为 `b02f0a58b0ff5bc31cb9d09437fd73b32645b5f198d781336196fe2060b75897`。301 项实际产品字节与本次精确 git blob 一致，也与已独审 fix13 的 `8e8fe7e320e34a2b9c27bf7c7e794662ad988da4` tree 相同。

构建前后、收集前后四份完整输入快照除采集时间外均与 freeze 完全相同，涵盖产品、完整输入、7 份规范 Python 工具、版本记录、选定父环境、实际构建环境、OCR cache 模型记录与 supplemental distribution/overlay 身份。7 份规范工具的实际字节匹配 freeze，且相对已独审 tools14 提交 `93e0e13da6e3e0efe2450684f9f909e795aeda6b` 未变。没有重跑 capture 或版本探测、遍历 cache、重新读取缓存 AAR/分发包；这些外部缓存身份的前后结论以冻结和四份完整记录的一致性为限。

构建环境确为固定 SDK/NDK/JDK/cache/overlay，`CARGO_NET_OFFLINE=true`、`CARGO_BUILD_JOBS=2`、Android `GRADLE_OPTS=-Dorg.gradle.daemon=false -Dorg.gradle.configuration-cache=false`。记录的实际子进程覆盖与 freeze 完全一致。本次未改变生成 Gradle 工程、wrapper、依赖或锁。

## 真实离线 init 与资源门槛

canonical 子命令准确为 `pnpm android:build --debug`，原始日志包含 `node scripts/android.mjs build --debug`、Tauri aarch64 APK 入口及 `Finished 1 APK at:`。build exit 0、elapsed 24.279 秒、deadline 600 秒，minimum free 68,968,034,304 字节；自有进程组已结束且无剩余成员。没有 error、invalidated、offlineMarkerMissing、cleanupError、stopReason 或 groupCleanupError；全部 15 项输入比较及 supplemental 标志为真。

完整原始 `android-smart-u-build05/android-attempt01/build.txt` 的第 73、74 行均精确为：

```text
CANDIDATE06_OFFLINE=true workers=2 configurationCacheJvmProperty=false nonce=a1c0326678524738aa1cd9c99796afe8
```

独立重新解析完整日志，只有这两条 marker，nonce/offline/workers/JVM 属性和 markerCount=2 与 runner 结果一致；没有任一种 configuration-cache 复用句式或下载提示。本次日志提供实际执行当前 init 的证据，补足 tools14 纯 Python 检查不具备的真实启动链证据。JVM 字段仍准确表述为属性值；该单次通过不能外推所有 Gradle 配置或后续构建。

临时 init 身份为 576 字节、SHA-256 `d511be1f1d6177054b134b2032f5f0fd007b8b0ff459d2f1fe805fa79c58d833`，路径包含本次 nonce；删除前检查普通文件及 device/inode/bytes/SHA 与创建记录完全相同，记录 `temporaryGradleInitRemoved=true`。本次 reviewer 未访问或修改 init/cache。

build result SHA-256 为 `8869531ccdfd68313317744efef79f0c9210a4af501b88bf877e7726560fbf27`；collection result 为 `37689109403e751a52b4f6e600354253b772e051fc3042d9b9b29067fedb5af9`。collection 的 buildResult 字节身份、nonce、授权源、聚合和 freeze 全链相符，ready=true；全部输入比较及 supplemental 比较为真。

## 新旧输出与完整 APK

原输出先按 canonical 规则原子改名；`output-isolation.json`、`generated-outputs.json` 与 build 内嵌记录一致，固定源路径在执行前被记录为不存在。独立读取 prior APK 和完整 prior dist，文件字节、权限、目录列表、device/inode 都与隔离前快照相同；当前生成 APK 和完整 dist 也与新输出快照逐项相符。

旧输出确为 Android04 未接受包，inode `29383214`；本次新输出为 inode `29389444`，同设备且 inode 不同。二者恰好字节相同，均为下述 SHA，但保留了独立的旧输出隔离与新输出生成身份。Android04 的 exit0/offlineMarkerMissing=true 结果和原始日志保持原字节，未被本次追认。

| 准确实物 | 字节 | SHA-256 |
| --- | ---: | --- |
| `artifacts/unified-candidate06/android-smart-u-build05/android-attempt01/android-original.apk` | 179,247,354 | `a6f94fe3c397a6078116c5f2d6c3190ae5091afa214b7005307973f57ef96322` |

完整保存 APK 与本次新固定输出、buildOutputIdentity、generated snapshot 及 collection apk/preservedApk 身份相符。独立流式读取所有 ZIP 文件成员，校验解压 CRC 与 SHA，1066 项记录完全相同且没有重复名称；没有解压落盘或只查部分资源。4 个 `.so` 的 ELF 头均为 ELF64、小端、AArch64，实际 ABI 只有 `arm64-v8a`，包括 `libnotes_clone_lib.so`。

25 个 bundled OCR 模型共 2,490,310 字节，名称、大小和 SHA 与 freeze 中 AAR 模型记录以及 collector 逐项相同。没有重新读取缓存 AAR；该结论不能替代设备首次离线识别。

## 独立签名与历史保全

作者 apksigner 命令与 `command-01.txt` 原始输出准确相符，exit 0、v2=true、单 signer，且自有进程组已清空。reviewer 另执行一次新的、30 秒上限的只读 `apksigner verify --verbose --print-certs`：exit 0，v2 签名验证通过，单 signer，证书 SHA-256 为 `e71ec0b1b626c9e54c7b4a1517ba1c12703d86364c17100658d954a94e6bec79`。完整输出与耗时保存在 `fresh-signature-check.json`，未重签名。

另从当前 APK v2 block 直接解析证书 DER，并核对既有 candidate04 完整保存包的当前字节及 DER，证书身份相同。这建立证书兼容性，不代表实际设备已成功升级，也不重新推断当前安装状态。

开始独立冻结的 110 项作者/历史文件在结束逐项重算后全部不变，涵盖新 Android05 证据和包、旧 Android04 失败证据与保全输出、tools14 作者及独审资料、Mac09 原封存及独审记录。两个完整 Mac09 app 的实际文件列表和聚合也与原 collection 一致。最终输入核对另确认当前 320 项输入和 7 份规范工具未改变。

未执行 build、Gradle、工具版本或产品功能测试；未操作 GUI、ADB、安装、用户数据库或原版 Notes，未修改共享 target/cache。只读取了明确授权的最终 APK 输出路径和相关保存产物，没有遍历 target。未独立解码 Tauri 内嵌压缩前端或重新构建。后续设备、原生输入、音频、持久化和像素门槛继续由 root 按有限范围开展。**STOP；共享 target/cache 未获取或使用，已释放。**
