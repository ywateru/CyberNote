# candidate04 验证准备

状态：**PREPARED ONLY / NOT BUILT / NOT A SOURCE FREEZE**。本目录准备验证流程与脚本，没有执行预生成、产品输入冻结、Mac/Android 构建、产物复制、签名、下载、清理、GUI 或设备操作。最终源码 SHA 尚未获主任务指定；OCR 明文 state 清理问题的修复与独立复核、UI 文案校准均为前置。本目录不是 candidate04 已通过的证据。

## 当前只读发现

`current-resource-audit.json` 记录当时可用空间 **3,331,870,720 B（约 3.10 GiB）**；项目与 `/private/tmp` 同一卷，改用该临时目录不能增加空间。距脚本 2 GiB 停止线只有约 1.10 GiB，不能据此承诺两个平台均可完成。每个后续阶段都会重新检查；不足时停止，保留已生成文件，不自动清理缓存、历史证据或 target，不复制整个 target。

两个当前生成文件均缺少 `tauri-plugin-notes-scan`：

- `src-tauri/gen/android/tauri.settings.gradle`
- `src-tauri/gen/android/app/tauri.build.gradle.kts`

扫描插件源码已注册，故必须先执行**另行授权、有原始记录的正常生成前置**，审查生成变化，然后才指定最终 SHA 和冻结。不能手写插件注册到生成文件，不能在最终构建中悄悄接受生成变化。`capture-inputs.py` 会拒绝缺少注册的状态。

扫描插件 Android 默认源码来自 `android/src/main/java`、`res` 和 manifest。插件独立验证的 `src/deviceFixture/java` 不是正常主应用的默认 source set。OCR 模型来自既有 MLKit AAR，而不是假定仓库中存在的 `src/main/assets`：选择缓存 `/private/tmp/notes-scan-gradle-home` 下已找到 25 个模型成员，共 **2,490,310 B** 未压缩数据。只读审计保存了 AAR 和模型成员的 SHA-256。主目录默认 Gradle 缓存缺少直接中文 OCR AAR，不能默认沿用该缓存。

缓存存在不证明全部依赖能离线解析；缺少依赖必须失败并记录，不允许下载补齐。`play-services` 名称也不等于模型远程加载，最终以 APK 实际成员字节及后续运行证据为准。当前审计不证明运行时首次离线识别成功。

## 文件用途

| 文件 | 用途 | 当前执行状态 |
| --- | --- | --- |
| `common.py` | 路径、哈希、环境、输入范围、空间与比较辅助 | 仅供只读审计导入 |
| `resource-audit.py` | 只读审计源码路由、既有模型与资源 | 已执行一次，结果为 `current-resource-audit.json` |
| `preflight-generate.py` | 精确 SHA 下正常 tauri-build 生成/check，保留前后生成文本和结果 | 未执行 |
| `capture-inputs.py` | 主任务指定最终 SHA 后冻结列明输入 | 未执行 |
| `run-build.py` | 串行、离线、精确输入约束下执行一个构建尝试 | 未执行 |
| `capture-outputs.py` | 保存完整原始 app 或 APK 及内容、签名证据 | 未执行 |
| `seal-mac.py` | 从保留原始 app 另建完整本地 adhoc 签名副本 | 未执行 |
| `syntax-check.json` | 七份 Python 脚本的 AST 解析记录 | 已通过；没有构建或编译 |

## 待主任务授权的顺序

1. 修复与独立复核通过，由主任务指定**预生成使用的精确 40 位 SHA**，确认没有其他构建使用共享 target/cache。
2. 另行授权运行 `preflight-generate.py`，保存新目录中的原始输出与两个生成文件前后全文/哈希。
3. 主任务审查所有生成变化；若修改了已跟踪文件，解决并提交后再指定**最终精确 SHA**。不得把预生成之前的输入当作最终冻结，也不得声称变化的生成文件输入未变。
4. 运行最终输入冻结。此后只要源码、列明资源、生成文件、补丁、工具版本或记录的环境变化，该候选即失效。保留失败证据，重新评审后使用新 run 目录，不能覆盖原冻结。
5. 构建 Mac，保存完整原始 app、ZIP 和原始签名记录；再从保留原始 app 生成完整 adhoc 副本，严格验证并保存另一份 ZIP/身份。原始副本不得修改。
6. Mac 保留和封装通过后才能串行构建 Android；保存 APK、逐成员身份、模型一致性和 APK 签名结果。
7. GUI、安装、运行、离线识别、权限和像素对比属于之后单独安排的验证，本脚本组不执行这些动作。

以下均为**未来命令模板，不是已执行记录**；替换占位符前需要主任务的上述决策。新建目录与尝试名必须唯一。

```sh
python3 -B docs/verification/unified-candidate04/preparation/preflight-generate.py PREGEN_SHA NEW_PREFLIGHT_DIRECTORY --execute-authorized-preflight

# 审查生成变化并获最终 SHA 后：
python3 -B docs/verification/unified-candidate04/preparation/capture-inputs.py FINAL_SHA NEW_RUN_DIRECTORY/source-inputs-before.json
python3 -B docs/verification/unified-candidate04/preparation/run-build.py mac FINAL_SHA NEW_RUN_DIRECTORY attempt01
python3 -B docs/verification/unified-candidate04/preparation/capture-outputs.py mac FINAL_SHA NEW_RUN_DIRECTORY attempt01
python3 -B docs/verification/unified-candidate04/preparation/seal-mac.py FINAL_SHA NEW_RUN_DIRECTORY

# 额外审查并授权临时离线 init 方案、串行所有同缓存 Gradle 使用者后：
python3 -B docs/verification/unified-candidate04/preparation/run-build.py android FINAL_SHA NEW_RUN_DIRECTORY attempt01 --allow-scoped-gradle-offline-init
python3 -B docs/verification/unified-candidate04/preparation/capture-outputs.py android FINAL_SHA NEW_RUN_DIRECTORY attempt01
```

## 正常生成前置的候选机制

本机缓存 `tauri-build 2.6.3` 源码表明：`TAURI_CONFIG` 被标记为 rerun-if-env-changed；设置 `TAURI_ANDROID_PROJECT_PATH` 时，正常 build script 调用生成器，根据 `DEP_*_ANDROID_LIBRARY_PATH` 写出上面两个 Gradle 文件。因此脚本提出以下候选命令：

```sh
cargo check --manifest-path src-tauri/Cargo.toml --target aarch64-linux-android --locked --offline
```

该命令显式设置 `TAURI_ANDROID_PROJECT_PATH=<项目>/src-tauri/gen/android`、`TAURI_CONFIG={}`，使用正常生成器，不手改生成文本。它是真正可能编译的 Cargo check，**尚未运行或验证其结果**；环境触发是否足以让当前构建缓存重跑生成器，必须由实际输出确认。失败、缺少生成注册或其他生成变化均应保留，不能据此放行最终冻结。脚本不会自动提交或处理生成差异。

## 离线与环境

脚本保存父进程环境与实际覆盖值，不能把两者混同。当前拟使用：

| 环境 | 实际值/规则 |
| --- | --- |
| `ANDROID_HOME` | 当前已有 `/Users/water/Library/Android/sdk` |
| `NDK_HOME` | 父环境无有效目录时明确回退已有 `ndk/27.2.12479018`；当时父环境指向缺失的 28.2 目录 |
| `JAVA_HOME` | 当前已有 `/opt/zerobrew/opt/openjdk@17` |
| `GRADLE_USER_HOME` | 明确改为已有 `/private/tmp/notes-scan-gradle-home` |
| `CARGO_NET_OFFLINE` | `true` |
| `CARGO_BUILD_JOBS` | `2` |

SDK 36、apksigner 36、上述 NDK/Java/cache 必须已存在。默认产品 features；拒绝预存的 `TAURI_CONFIG`、proof、target 和 Rust flags 等相关覆盖。临时预生成覆盖不会进入最终冻结环境。工具版本和父环境也参与构建前后比较。本目录不声称冻结了整个 SDK、OS 或所有传递依赖。

本机 Tauri CLI 2.12.4 的 `android build --help` 将 `-- <ARGS>` 描述为传给 runner，不能未经验证就断言 `-- --offline` 会传到 Gradle。候选 Android 方案因此要求额外显式参数 `--allow-scoped-gradle-offline-init`：仅为本次尝试以独占创建方式写入选定缓存的 `init.d/candidate04-offline-<attempt>.gradle`，设置 `gradle.startParameter.offline=true` 和最多 2 个 workers，记录文件身份，并要求原始构建日志出现 `CANDIDATE04_OFFLINE=true`。缺少标记则候选失败；没有在线回退。

**该临时 init 会影响同一 Gradle cache 的其他 Gradle 使用者，须在执行前由主任务显式审查，并串行所有该 cache 使用者。** 脚本自己的非阻塞锁只能协调遵循同一锁的 candidate04 脚本，不能协调外部 Gradle 进程。脚本最终只删除本次成功独占创建的 init 文件，不覆盖或删除任何预存文件。目前没有创建此 init，也没有修改缓存配置。如果不接受该方案，应先另行审查等价离线机制，不能静默在线运行。

## 输入与证据边界

最终冻结将继承 candidate03 列明的所有输入，包括生成 Android 和 patched dependency 路径；缺失旧路径直接失败，不能悄悄从清单移除。新增范围覆盖当前 `src`、`src-tauri`、`scripts`、`assets`、`patches`、所有 `plugins`，以及根 package/锁/config。notes-ui 与 notes-scan 插件额外递归列出忽略的 Rust/build/guest/native Android/macOS/resources/models/permissions/locks 等文件，排除 target、build、cache 等输出。OCR 既有 AAR 及其中模型字节另行记录。

每个尝试使用新目录，日志独占创建。失败构建、失败签名、模型不匹配和生成输入变化必须留存。阶段性失败不等于候选通过；构建成功也不能掩盖前后输入差异。成功身份文件每个 run 仅允许创建一次；若已创建后需重做，使用新 run，不能覆盖旧身份。

Mac 原始构建可能只有链接器签名，其严格签名验证失败也要如实记录。`seal-mac.py` 独立保存完整 adhoc 衍生物及严格验证结果，只允许可执行文件和 `CodeResources` 出现签名变化，其他变化中止。它不等于 Developer ID、notarization、TCC 授权或运行通过。

APK 证据逐项哈希实际 ZIP 成员，涵盖 native libs、manifest、DEX、配置与资源；模型成员须与冻结时缓存 AAR 的模型路径、字节数及 SHA-256 完全相同，apksigner 验证必须成功。APK 模型存在仍不能替代设备上的冷启动、断网首次识别和交互验证。

当前已执行检查只有只读资源审计与 Python AST 解析。`vm_stat` 可读；受限制的 `sysctl` 未提供总内存/CPU，不据此断言内存容量或资源故障。
