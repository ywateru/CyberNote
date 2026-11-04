# Android paper 离线恢复工具02：独立源码审查

结论：**pass / SOURCE-READY**。审查对象为准确提交 `347660b352f6becb1f52a9c79fdf5372b50f1f12` 中 `docs/verification/unified-candidate06/android-paper-recovery-preparation02/` 的 11 个新增文件。本轮未发现 blocking 或新增 non-blocking finding。此结论只认可窄工具改动及冻结准备，不代表新输入已经冻结、恢复构建成功、APK ready、设备运行或像素验收通过。

任务依据：`docs/plan/tasks/tools-android-paper-offline-recovery-02.md`。本人作为不同于开发者的审查执行者，只读取指定提交、旧工具、指定历史证据、冻结产品文件及官方文档；仅新增本 review 与 `docs/verification/tools-android-paper-offline-recovery-independent-02/` 的自有验证文件。未修改工具或产品，未运行平台构建、版本、签名、GUI、ADB、依赖获取，未触碰 target 或 Gradle cache，未 stage/commit。

## Findings

没有发现本任务范围内需要修复的 P1/P2/P3 项。以下为结论证据及限制，不扩大旧链的既有验收范围。

## 精确提交、复制及历史保全

该提交恰有 11 个新增文件，全部在新目录，当前每个文件与指定提交 blob 相同。新 common.py 第 139 行只把 Android `GRADLE_OPTS` 从 `-Dorg.gradle.daemon=false` 改为 `-Dorg.gradle.daemon=false -Dorg.gradle.configuration-cache=false`，增量 39 字节；删去唯一指定后缀后与旧 common.py 完全相同。三个入口 `freeze-inputs.py`、`run-build.py`、`collect-outputs.py` 与旧链逐字相同。旧四工具也与指定提交父链的原文件相同。

新 common SHA-256 为 `11dfce693463a5ffa9272199d5b1a8c1241a10c6cac1444b17a91f7a1a56bb54`；其余三入口身份保持开发 manifest 的旧值。独立核验 `evidence/reference-inputs.json` 的 33 个历史文件，其大小及摘要全部不变，含旧两平台冻结和 Android attempt01 原始失败证据。旧失败仍为 exitCode=0 但 offlineMarkerMissing=true；未从该 attempt 收集 ready，也未读取或移动失败 APK。

238 个冻结产品输入逐文件不变，聚合仍为 `560f9826b44320f184493f8f522a2cfefaf78a7e4e7c1faad8fa001e1190583d`。开发 manifest 的 10 个非自身条目、完整文件集合及聚合 `ada77824ec6e810432b51ad71a916b2238c685c9ec290d57289ebd60dbe76b41` 独立核验相同。

## 环境及 Gradle 官方依据

受控调用新旧 `effective_environment`（common.py 133–143），只在检查作用域模拟 `Path.exists`，禁止该作用域启动子进程。Android 环境唯一变化为指定 `GRADLE_OPTS`，原 daemon=false 及其余值保留；Mac 字典与旧工具完全相同。该受控检查不证明真实 SDK/cache 存在，也不证明真实 Gradle 执行结果。

官方 current 用户文档说明 `org.gradle.configuration-cache` 开关、`-D` 系统属性优先级和 `GRADLE_OPTS` 的 Gradle client JVM 参数用途。另读取 Gradle **v9.6.1** 官方 `LayoutToPropertiesConverter.java`：其 `defaultProperties` 先读属性文件，再合入当前 JVM 系统属性，支持单次 `-Dorg.gradle.configuration-cache=false` 覆盖项目 `gradle.properties` 的 true。已只读确认项目该属性仍为 true，未修改它；本项目 gradlew 明确将 GRADLE_OPTS 并入 JVM 启动参数。

独立查阅时 current 页面显示 9.8.2，因此没有独立追认开发材料所记的“当时 current 显示9.6.1”。此历史声明保持原样，本次依据额外保存了固定 v9.6.1 源码位置和适用边界。没有据环境字符串承诺真实恢复日志一定输出新 OFFLINE 标记。

独立官方来源记录见 `docs/verification/tools-android-paper-offline-recovery-independent-02/official-reference.json`：

- `https://docs.gradle.org/current/userguide/configuration_cache_enabling.html`
- `https://docs.gradle.org/current/userguide/build_environment.html`
- `https://raw.githubusercontent.com/gradle/gradle/v9.6.1/platforms/core-runtime/launcher/src/main/java/org/gradle/launcher/cli/converter/LayoutToPropertiesConverter.java`

## 新工具冻结的自捕获

common.py 255–263 的 `capture` 仍从 `Path(__file__).resolve().parent` 计算 prep，`tools` 字段对该目录顶层 `*.py` 排序后记录真实字节身份。独立检查从实际 capture AST 取出该字段表达式并求值，确认其完整捕获新目录的五个 Python 文件，包含新增 `check-recovery.py`；没有复用旧 preparation 的工具清单，也没有用未记录 monkey patch 修改未来构建工具。

本轮没有调用完整 capture 或 freeze（它们会执行工具版本与补充缓存检查），没有产生新 input-freeze。未来仍须由 root 提供新准确 HEAD、完整输入清单与聚合、新 run/artifact 边界，运行新目录 freeze，核实真实 freeze SHA 及其 tools/effectiveBuildEnvironment 后再授权独占恢复；旧冻结 SHA 不适用于新有效环境和工具身份。

## 保留的拒绝与资源边界

| 边界 | 新目录代码位置 | 独审结果 |
|---|---|---|
| 明确授权、准确源及全输入/环境比较 | common.py 98–113、221–279 | 与旧链字节等价，未放宽 |
| 新且独占 run、冻结 SHA、共享锁 | freeze-inputs.py 10–28；run-build.py 107–138 | 与旧链相同 |
| 既有最终产物与 dist 的原子隔离及新产物身份 | run-build.py 15–104、143、173–176 | 与旧链相同，无清缓存旁路 |
| 本轮 OFFLINE init、原始日志标记及 owned init 清理 | run-build.py 145–165；common.py 286–308 | 仍要求 CANDIDATE06_OFFLINE=true，未以 exit0 代替 |
| 2 GiB、600秒、下载提示中止、owned process group | common.py 69–73、311–403 | 与旧链相同，未重新执行进程边界测试 |
| 失败结果在任何产物收集之前拒绝 | common.py 282–283；collect-outputs.py 57–76、158–165 | 29 个独立谓词负例及实际旧失败早拒绝通过 |
| 签名、准确升级证书、25模型、单arm64-v8a及收集前后身份 | collect-outputs.py 122–147、175–199 | 与旧链逐字相同，未运行签名或读取APK |

29 个负例涵盖六种失败字段即使值为 false/null 也不得存在，以及非零退出、未停 owned group、缺失产物、补充输入不变未证、空/失败输入比较及必需成功字段缺失。另从实际 collector AST 提取 `validate_built`，确认实际旧 offlineMarkerMissing 失败在任何 attempt 路径读取前即被拒绝。未将这些受控检查冒充构建、真实进程或签名测试。

## 独立验证

`python3 -B docs/verification/tools-android-paper-offline-recovery-independent-02/controlled-review.py` 退出0，结果见同目录 `result.json`。检查后新11文件与原33文件的身份保持相同；自有 manifest 记录本次输出身份，不改根验证清单。
