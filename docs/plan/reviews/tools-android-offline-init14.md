# Android offline init14 工具独立复核

**结论：pass，仅本次工具窄修的源码、参数传递和失败拒绝边界。** 精确复核提交为 `93e0e13da6e3e0efe2450684f9f909e795aeda6b`。没有确认的 P1/P2/P3 blocking 或 non-blocking finding。实际 Gradle 9.6.1、native CLI 中间层传递及新 Android 包仍待另行授权的准确 build05；本报告不把 Python 模拟当成 Gradle、设备或像素验收。

任务契约见 `docs/plan/tasks/tools-android-offline-init14.md` 的 Required bounded correction、Author/review/execution。复核只读产品和规范工具，新写入独立证据及本报告；未 stage/commit、运行平台/版本命令、操作 GUI/ADB、用户数据库、原版 Notes 或共享 target/cache。用户暂停的原版删除实验没有开展。

## 源码与门槛

`common.py:134` 的固定环境只有 Android `GRADLE_OPTS` 从原 `-Dorg.gradle.daemon=false` 增加 `-Dorg.gradle.configuration-cache=false`；与历史 Mac09 freeze 的 Mac 环境逐项相同。`run-build.py:139` 将冻结环境覆盖到实际子进程环境，保留明确覆盖记录。`scripts/android.mjs:9`、`:23` 继续传递父环境，`src-tauri/gen/android/gradlew:241`–`:248` 将 GRADLE_OPTS 解析为 wrapper JVM 参数；这些静态入口证据没有证明 native CLI 中间段或实际 Gradle 已生效。

`common.py:147` 的临时 init 先设置 offline/maxWorkerCount，再断言这两个属性和 JVM `org.gradle.configuration-cache=false`，最后读取实际属性输出本次 nonce。该 JVM 字段准确命名为 `configurationCacheJvmProperty`，没有声称它本身就是配置缓存实际功能状态。nonce 必须是 32 位小写十六进制，独立检查拒绝四种非法值。

`common.py:162` 的共同检查要求至少一条精确当前 nonce 证明，所有含 marker 的行必须一致；拒绝 missing、offline/workers/JVM 错值、旧或混合 nonce，以及 `Reusing configuration cache` 和 `Configuration cache entry reused` 两种句式，大小写不敏感。`run-build.py:164` 对原始日志执行该检查，失败设置阻断标记；即便底层命令退出 0、保留了新 APK 身份，仍不能进入成功收集。

`collect-outputs.py:57`–`:82` 先核准确来源、冻结、命令、实际输出和两份快照，再独立重新解析当前原始日志、核冻结环境与记录的子进程覆盖、比较完整 proof（包含 markerCount）以及临时文件清理。收集阶段没有只相信成功标志或内嵌 proof。既有总收集流程的前后输入及结果哈希/输出身份复核仍保留。已检查的超时、自有进程组、空间、下载、旧输出隔离与文件身份清理逻辑未因本次差异改变。

## 独立行为验证

证据目录 `docs/verification/tools-android-offline-init14-independent/`。`commands.json` 保存三条纯 Python 命令、退出值与耗时，均退出 0，单条少于 3 秒；可用空间约 69.5GB。没有调用 Gradle、pnpm 构建、Java 或其他工具版本探测。

- 重新运行作者受控检查：10 个 runner 场景通过；正常值接受，其余缺失/错值/旧 nonce/混合证明/两类缓存复用/缺失环境开关均拒绝。真实 Python 子进程观察到实际传入环境与当次 init 文本，旧输出身份保留，自有进程组结束，拥有的 init 清理完成。另有 9 项收集记录/日志篡改拒绝通过。
- 重新运行未修改的 7 项安全边界检查，覆盖显式输入与输出目录、冻结字节与禁止覆盖、init 归属及替换、超时仅停自有进程、模拟低空间与下载提示、失败和来源错配阻断。
- 独立 `check-extra-collector.py` 新增 9 个收集场景：第二种缓存复用句式、复用日志大小写变化、当前与旧 nonce 混合、仅改结果 nonce、仅改 proof 计数、保留成功 proof 但移除原始日志、两条相同当前证明、双证明但旧计数、冻结环境和记录覆盖共同改为缺少开关。其中合法双证明在计数相符时接受，其余八项拒绝。额外四种非法 init nonce 均拒绝。新增场景使用真实临时 runner 文件和实际临时输出身份，没有 mock 掉 collector 来源门槛。

这些是边界检查，模拟 marker 明确不是 Groovy 执行证明。即使全部通过，也须在真实新 attempt 观察 init 输出的实际 offline/jobs2/JVM 值、无缓存复用、输入一致、进程清空和身份清理后才能收集。

## 字节与历史保全

开始和结束独立重算 14 项 manifest 内容及精确提交 git blob，manifest SHA-256 为 `a1634e41759706d2e654e71c9196e5654d5230cb0940084a6e62d6a5c3efe0f3`，14 项聚合为 `e4ac8930de9a43a86f53c4a33d6eec088fb4f802db27e2de2c00d40f16e20a3e`。

320 项产品/已列生成/补丁依赖输入与作者前后记录及历史 freeze 相符，聚合保持 `abf3f38aceb7cc93100e27ca3bca1848d3d12bba5999835d2a501346522efab6`。其中 301 项产品聚合保持 `b02f0a58b0ff5bc31cb9d09437fd73b32645b5f198d781336196fe2060b75897`，与 fix13 `8e8fe7e320e34a2b9c27bf7c7e794662ad988da4` 的 git tree 无差异。

6 项受保护记录、Mac09 独审冻结的 38 项作者/封存文件、完整原件与派生 Mac app 聚合、旧 Android prior APK 字节均匹配既有身份。原 Android04 失败日志与结果保持原 SHA，仍未接受；没有用新格式追认旧包，也没有回写旧 Mac 工具 freeze。此轮没有重新验签或检查运行行为。

`input-initial.json` 与 `input-final.json` 保存完整开始/结束身份，`result.json` 和 `evidence-index.json` 汇总本次有限结论与证据身份。本工具窄修可以交 root 固定准确新授权与 freeze，再单独 START Android05。**STOP；共享 target/cache 未获取或使用，已释放。**
