# Android paper build02 离线证据恢复工具 02

本目录复制当前 `../preparation/` 的 common.py、freeze-inputs.py、run-build.py、collect-outputs.py，供不同作者审查后由 root 指定新授权、新冻结和独占恢复 run。此次仅开发与受控检查，没有冻结新输入、运行版本命令、平台构建、签名、安装或设备操作，也没有读取/写入 target 或 Gradle cache。

## 问题与唯一运行差异

原 `android-paper-build02/android-attempt01` 底层 `pnpm android:build --debug` 退出0，日志复用 configuration cache，未输出本轮 init 的 `CANDIDATE06_OFFLINE=true`。原 runner 以 offlineMarkerMissing 拒绝成功；本目录不改写该结果，不从失败 attempt 收集 ready。

新 common.py 只将 Android 有效环境中的：

```text
-Dorg.gradle.daemon=false
```

改为：

```text
-Dorg.gradle.daemon=false -Dorg.gradle.configuration-cache=false
```

`evidence/tool-diff.patch` 保留精确差异。其余 common.py 字节不变，freeze-inputs.py、run-build.py、collect-outputs.py 与原文件逐字相同。Mac 有效环境不受影响。输出隔离、全输入比较、offline init 与日志标记门槛、资源保护、进程归属与清理、失败拒绝收集、签名/模型/ABI规则全部保留。

这是单次构建的 Java 系统属性设置；不删除配置缓存，不改项目 gradle.properties，不清理依赖或产物。它是否在实际恢复构建中产生本轮离线标记，必须由后续原始日志证明；本目录的受控检查不能代替该运行证据。

## 官方依据

2026-11-04 查阅 Gradle 官方文档（页面显示9.6.1）：

- [Enabling and Configuring the Configuration Cache](https://docs.gradle.org/current/userguide/configuration_cache_enabling.html)：说明可以通过 `-Dorg.gradle.configuration-cache=false` 为特定构建禁用配置缓存，即使属性文件全局开启它。
- [Build Environment Configuration](https://docs.gradle.org/current/userguide/build_environment.html)：说明 GRADLE_OPTS 为运行 Gradle 的 JVM 提供参数，并将 `org.gradle.configuration-cache` 列为配置缓存开关。

这些文档仅为实现依据；执行授权来自 root 的本任务。`evidence/official-reference.json` 记录来源与范围，没有保存整篇外部文档。

## 文件身份

原始输入读取时准确 HEAD：`62244d445b19321a3fe773ffa074563c56970595`。

| 文件 | 原始 SHA256 | 新 SHA256 |
|---|---|---|
| common.py | e2beeea6317faa01eb4330cd86fd107548c32400f492f0907306fd709574654d | 11dfce693463a5ffa9272199d5b1a8c1241a10c6cac1444b17a91f7a1a56bb54 |
| freeze-inputs.py | 01ed7127603ff6637f78044c45577827967e5e7c22cd0875ec9dd54008dbf683 | 01ed7127603ff6637f78044c45577827967e5e7c22cd0875ec9dd54008dbf683 |
| run-build.py | 7b1ff0d7cafa24e56220632c30a2ccb3d44c4b9ecfdffad74460ba82604b1abf | 7b1ff0d7cafa24e56220632c30a2ccb3d44c4b9ecfdffad74460ba82604b1abf |
| collect-outputs.py | 41937111248283f7c9c35d7723773c1ce99dc2703ad328d5b7b35d5175db3b3b | 41937111248283f7c9c35d7723773c1ce99dc2703ad328d5b7b35d5175db3b3b |

`evidence/reference-inputs.json` 封存旧 preparation 全部文件、两平台旧 freeze/summary 和 Android attempt01 的原始日志、结果与输入/输出隔离证据，共33文件。受控检查确认其摘要与字节数未变。本轮不复制或改动旧失败 APK；它由下一次另行授权的 runner 输出隔离保全。

## 本轮检查与后续入口

`python3 -B docs/verification/unified-candidate06/android-paper-recovery-preparation02/check-recovery.py` 已退出0，结果见 `evidence/controlled-check.json`：

- 五个 Python 文件语法可解析；四个运行工具满足上述精确字节等价。
- Android 有效 GRADLE_OPTS 精确包含 daemon=false 与 configuration-cache=false，Mac 原环境不变。
- 此环境检查仅在测试作用域模拟 Path.exists=true，避免访问 SDK/cache；禁止该作用域启动子进程。没有对生产工具运行时作 monkey patch，不证明实际工具存在或 Gradle行为。
- offlineMarkerMissing/error/invalidated/cleanupError/groupCleanupError/stopReason 仍阻断成功。
- 33 个历史文件身份不变；238 个产品文件与旧冻结逐文件相同，聚合仍为 `560f9826b44320f184493f8f522a2cfefaf78a7e4e7c1faad8fa001e1190583d`。

检查结果采用独占创建，已存在时拒绝覆盖。源码等价意味着未改的现有安全边界继续存在；未重复运行旧进程/低空间/签名测试，未调用任何实际 Gradle 工具。本目录新增检查脚本也位于顶层，未来新 freeze 会使用原有 `glob('*.py')` 将全部五个 Python 文件身份记录进 tools。

后续必须使用本目录的 freeze-inputs.py、run-build.py、collect-outputs.py，配合 root 另发的新准确 HEAD/产品聚合/完整输入清单及独占 run 授权。新 freeze 包含有效环境变化与本目录实际工具字节，因此不可沿用旧 freeze SHA。既有 README 的600秒限制、2GiB保护、离线/归属/收集门槛仍适用。

`evidence/tool-manifest.json` 封存本目录除自身以外的文件身份，最终开发提交只包含本目录。
