# candidate06 专用构建工具

本次交付仅为工具开发，尚未冻结产品输入、运行版本命令或执行平台构建。工具作者工作树 `/private/tmp/apple-notes-candidate06-tools-01`，基线 `4dbdbd25238c430f7800cb286b642577a09ccf50`。完成后交不同作者审查，由 root 合入；实际构建以 root 后续指定的精确主线 SHA 为准。

## 来源与差异

只读参考主工作树 `docs/verification/unified-candidate04/preparation/common.py`、`capture-outputs.py`、`seal-mac.py`、`recovery-preparation-01/run-android-recovery.py`、`capture-android-recovery.py`、`recovery_common.py`，以及 `mac-candidate05-wide-toolbar-build-01/monitor-build.py`。原文件和历史证据均未修改。`evidence/reference-tools.json` 保存其本次读取的字节身份。

06 去掉04的旧 SHA、279 项不变和旧 Mac 引用约束；改为 root 提供的准确 SHA、产品路径/聚合与完整输入路径清单，并让 Mac/Android 各有独立的冻结文件。保留全源码与锁文件、两个 Android 生成文件、插件忽略资源、五个已补丁依赖文件、工具字节、工具版本、父环境、有效环境、OCR AAR/25模型和补充 overlay 的前后比较。另记录已复用的完整 Gradle distribution 字节；不宣称完整操作系统、SDK 或全部传递依赖可重现。

工具不会追随 HEAD，不生成扫描注册，不调用下载/安装，不复制 target 或 node_modules，不修改/清理依赖缓存。运行时仍使用原共享锁 `/private/tmp/notes-unified-candidate04-build.lock`，与旧 runner 互斥；该锁只约束合作工具，root 必须串行安排所有共享 target/Gradle cache 操作者。`--exclusive-target-and-cache` 是 root 的操作来源声明，无需另向用户确认。

## root 提供的授权文件

每个平台独立一个 JSON，且只接受下列九个字段。路径必须为实际主工作树下规范绝对路径；清单必须为排好序、无重复的完整相对文件路径，不能传 `HEAD`、`latest` 或省略产品聚合。

```json
{
  "schema": 1,
  "stage": "mac",
  "root": "/Users/water/work/2026/Apple-Notes-Clone",
  "sourceHead": "<root指定的40位小写SHA>",
  "productAggregate": "<root指定的64位产品聚合>",
  "productPaths": ["<root产品文件清单，每个路径单列>"],
  "inputPaths": ["<完整产品、锁、生成、补丁依赖与插件资源输入清单>"],
  "runDirectory": "/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/<root指定的唯一平台run>",
  "artifactDirectory": "/Users/water/work/2026/Apple-Notes-Clone/artifacts/unified-candidate06/<root指定的唯一平台run>"
}
```

`stage` 仅 `mac` 或 `android`。示例含占位符，不能直接执行。产品聚合算法为按路径排序后逐行 `sha256 + "  " + path + "\n"` 的 SHA256。完整输入清单应保留前次冻结的所有依赖/生成条目，再加入本轮新增的产品文件；不能仅由 git tracked 清单代替。工具强制包含全部 tracked 产品/锁/配置、两个生成文件、忽略插件资源和五个指定的补丁依赖文件，拒绝缺失输入和脏 tracked 工作区。其他由 root 指定的依赖输入按清单逐一保全。未跟踪的产品路径被拒绝，新 run/evidence 在 docs 下不属于产品输入。

## 精确命令

以下命令只在 root 后续授权实际构建后执行。以主工作树为当前目录；`AUTH` 与 `FREEZE` 分别替换为授权 JSON 的实际绝对路径和 root 复核的冻结文件 SHA256。此处是来源控制，不是新增用户审批流程。

```sh
python3 -B docs/verification/unified-candidate06/preparation/freeze-inputs.py --authorization AUTH
python3 -B docs/verification/unified-candidate06/preparation/run-build.py --authorization AUTH --freeze-sha256 FREEZE --attempt attempt01 --exclusive-target-and-cache
python3 -B docs/verification/unified-candidate06/preparation/collect-outputs.py --authorization AUTH --freeze-sha256 FREEZE --attempt attempt01
```

Android 构建命令另带 `--allow-scoped-gradle-offline-init`。freeze 会启动 node/pnpm/cargo/rustc/Java 的版本命令；本次开发检查没有执行 freeze。运行只调用固定入口 `pnpm mac:build` 或 `pnpm android:build --debug`，没有任意命令、编译 flag 或 proof 开关。

有效环境明确固定 SDK `/Users/water/Library/Android/sdk`、NDK `27.2.12479018`、Java `/opt/zerobrew/opt/openjdk@17`、Gradle cache `/private/tmp/notes-scan-gradle-home`、`CARGO_NET_OFFLINE=true`、`CARGO_BUILD_JOBS=2`。Android 另固定 `GRADLE_RO_DEP_CACHE=/private/tmp/notes-lifecycle-cache-overlay-01/overlay-ro` 与 `GRADLE_OPTS=-Dorg.gradle.daemon=false`；不继承当前28.2 NDK为有效版本。完整 distribution 与 `.ok` 复用现有 wrapper 链接，缺失时失败，不获取网络资源。

Android 在已选 cache 的 init.d 独占创建带随机 nonce 的 `candidate06-offline-<nonce>.gradle`，设置 offline=true、maxWorkerCount=2；要求原始日志出现 `CANDIDATE06_OFFLINE=true`。清理在共享锁内进行，必须 device/inode/size/SHA 与普通文件身份一致，删除前重核 inode；被替换/修改/变成符号链接则保留并失败。

## 资源与成功条件

每个输出阶段及0.2秒构建轮询检查至少2GiB空闲。构建固定600秒 deadline；收集命令共享600秒预算。捕获下载提示时也停止，只有本轮创建的会话进程组可被终止，先TERM等5秒再KILL；已退出的 leader 不再发送信号。失败 result 允许在空间保护触发后以小 JSON 保全，避免保护本身丢失错误；不继续写候选产物。所有 run/attempt/收集目录使用独占创建，拒绝覆盖。失败产物、原始日志、退出码、stopReason、清理错误保留。

收集要求 exitCode=0，没有 error/invalidated/offlineMarkerMissing/cleanupError/stopReason，完整输入前后一致且 `supplementalInputsUnchanged=true`；还核 stage/SHA/产品聚合/完整聚合/freeze SHA/attempt/固定命令/nonce，实际前后输入文件及刚完成输出的字节身份。不能拿另一次的结果或已被下一次构建替换的输出授予 ready。收集前后再核完整输入及补充输入；失败 ready=false。

平台新产物位于 `<artifactDirectory>/<stage>-<attempt>/`，原始命令日志同目录，收集证据在 `<runDirectory>/<stage>-<attempt>/collection/`。源输出仍为主工作树 `src-tauri/target/release/bundle/macos/备忘录.app` 与 `src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk`。

- Mac 保全完整 `mac-original.app`、`mac-original.zip`；从原件派生完整 `mac-sealed.app`、`mac-sealed.zip`。原签名状态逐项记录；衍生副本必须 adhoc 签名及 deep/strict 验证成功。完整文件/链接比较只允许主可执行和 CodeResources 改变；原件不能改变。是本地 adhoc，无 DeveloperID、公证、TCC、启动或像素结论。
- Android 保存 `android-original.apk`，逐 ZIP 成员哈希，要求实际 ABI 仅 arm64-v8a、25 个离线模型匹配冻结 AAR，apksigner 验签成功且签名证书唯一并等于04的 `e71ec0b1b626c9e54c7b4a1517ba1c12703d86364c17100658d954a94e6bec79`。任一不满足都保全失败包而拒绝 ready；不安装、不启动。

candidate05 已有有限实际运行证据。06 写入新元数据后不能对同一活动数据库降级至04/05。构建 ready 仅指上述字节和签名条件，设备、原生输入、真实收音、保存恢复和像素仍需分项验收。

## 本次开发验证

`python3 -B docs/verification/unified-candidate06/preparation/check-boundaries.py` 为受控 Python-only 检查。7项覆盖语法、显式参数与输出路径、冻结字节/独占写、init删除归属、超时只停自有进程、模拟低空间/下载提示及失败/身份错配阻断收集。未运行 Rust/Gradle/版本命令/平台构建/真实签名/设备操作。

`evidence/check-attempt01.txt` 保留 canonical 临时路径失败和已退出子进程组信号失败；02 修正路径后仍暴露已退出进程信号问题；03 修正只对尚存活的 leader 停止后全部通过。工具语法和受控安全边界通过不代替实际平台工具差异审查、实际构建和独立审查。`evidence/tool-manifest.json` 保存本轮工具、说明与检查记录的字节身份；manifest自身不纳入自身聚合。
