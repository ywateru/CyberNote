# Android13：手机录音时间轴60准确离线构建

2026-11-05。准确源 `a236b311d7d6dcb33b0ee4f16977ebe2d2adf8ac`，含已合入的手机游标/轴标签60；产品 **334** 文件聚合 `2fe1f3489557095dae5d61f1076e12f8b98d265a3ea86bf36dbff989132fc7a3`，完整 **353** 输入聚合 `3020f04a710133efca6a94919b48024fc24361447465f6805a2a10e8c47cc550`。本轮授权见 [android-authorization.json](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/recording-wave60-preparation/android-authorization.json)，其SHA256为 `09e05467f67957deddcbf4d25a76f8a4e24b04049f98c36d621769297cf77a32`。原Android12完整333/352底表所有路径均保留，仅加入 `scripts/check-mobile-recording-wave60.mjs`。没有包含另树63后续源码。

先只读准备，root确认另树native编译已停止后才freeze；root直接核对冻结SHA、head、计数及两聚合完全一致后明确START。记录见 [root-freeze-review.json](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/android-recording-wave-build13/root-freeze-review.json)：复核发生于START之前，此文件在collection之后补写，没有伪造文件写入时点。实际入口仅使用既有 `freeze-inputs.py`、`run-build.py` 和 `collect-outputs.py`，没有改写产品、工具、依赖或配置。root在build/collect完成前保持准确trackedHEAD/输入不变；native slot在collection结束后立即释放。

冻结 [input-freeze.json](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/android-recording-wave-build13/input-freeze.json) **337844字节**，SHA256 `67e9f04668c9d4e9049249d3326f9faf4ea84adff644e92914f665888a5df01e`；摘要见 [freeze-summary.json](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/android-recording-wave-build13/freeze-summary.json)。源码/授权/完整输入前后计数与聚合一致；76插件文件、14生成输入、5补丁依赖和fixture例外均沿旧清单保全。

本轮唯一attempt为 **attempt01**，nonce `572a6803590d4035899986a6763db898`，固定命令 `pnpm android:build --debug`。北京时间2026-11-05 **14:44:38–14:45:05**，子命令elapsed **24.289秒**，exitCode=0。`ownedGroupStopped=true`、无残余自有组成员；没有timeout、下载提示、stopReason或清理错误。构建前后全部15项输入比较true，`supplementalInputsUnchanged=true`。

本次 [build result](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/android-recording-wave-build13/android-attempt01/result.json) SHA256 `e26f98668e602d11bc3ecc66c6da0d91a9f1c5e0b2433efec17d3aa2e6bcc006`；原始日志见 [build.txt](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/android-recording-wave-build13/android-attempt01/build.txt)。此前固定APK（Android12 SHA `533369f55e8fd927abbe9f5fff17468798db954566488b530d22c689253779f6`）和dist按既有流程原子保全到本attempt `prior-outputs/`，不是清理target/cache。固定输出路径确认不存在后才启动，完整隔离/新生成身份见 [output-isolation.json](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/android-recording-wave-build13/android-attempt01/output-isolation.json) 和 [generated-outputs.json](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/android-recording-wave-build13/android-attempt01/generated-outputs.json)。dist字节可与先前root准确60前端构建相同，来源仍由本次隔离和新生成身份核验。

Android实际环境固定SDK `/Users/water/Library/Android/sdk`、NDK27.2.12479018、Java17、`/private/tmp/notes-scan-gradle-home`、只读overlay `/private/tmp/notes-lifecycle-cache-overlay-01/overlay-ro`，`CARGO_NET_OFFLINE=true`、`CARGO_BUILD_JOBS=2`、`GRADLE_OPTS=-Dorg.gradle.daemon=false -Dorg.gradle.configuration-cache=false`。只复用既有完整Gradle distribution。两条实际日志证明均为：

```text
CANDIDATE06_OFFLINE=true workers=2 configurationCacheJvmProperty=false nonce=572a6803590d4035899986a6763db898
```

runner/collector按当前nonce重新解析，markerCount=2，无配置缓存复用。临时init `candidate06-offline-572a6803590d4035899986a6763db898.gradle` 的device/inode/size/SHA均保全，SHA `50092f3751029ad4ffd559bd9e505d5cba1e14f333e1acaff0bc49735e95567f`；自有组停止后核对身份再删除，`temporaryGradleInitRemoved=true`。不由此声称完整SDK/操作系统/全部依赖可重现。

collector北京时间 **14:45:26–14:45:29** 完成，**ready=true**。收集前后全部15项比较true，补充输入不变；重新核对实际子进程环境、当次offline日志、隔离记录、保全旧件与当前新件。[collection result](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/android-recording-wave-build13/android-attempt01/collection/result.json) SHA256 `39ffc45eeba199a51e535fd30a6f40636ace520ed825bb9ffd540f676e14a7d4`。

准确封存APK：[android-original.apk](/Users/water/work/2026/Apple-Notes-Clone/artifacts/unified-candidate06/android-recording-wave-build13/android-attempt01/android-original.apk)，**180721914字节**，SHA256 **`60aa7ff23ccc91e18fd027b1bb0a9d1ce21b01410275b86f05cccee40f15358b`**。副本与本次新固定输出逐字节身份相同，未复用旧Android12 APK作为新产物。逐ZIP成员SHA均在collection result。

实际ABI仅 `arm64-v8a`；25个离线OCR模型共 **2490310字节**，逐个与冻结AAR一致，`ocrModelsExactlyMatchCachedAars=true`。既有apksigner验签exit0、v2=true、唯一签名者，证书SHA256 `e71ec0b1b626c9e54c7b4a1517ba1c12703d86364c17100658d954a94e6bec79` 与candidate04一致，原始 [command-01.txt](/Users/water/work/2026/Apple-Notes-Clone/artifacts/unified-candidate06/android-recording-wave-build13/android-attempt01/command-01.txt) 保留。日志中的既有Vite大chunk和AGP旧选项/DSL提示均保留，未为消除提示修改产品。

**本轮仅构建与封存，没有安装、启动或操作手机应用。** 没有ADB、设备交互、GUI、麦克风、用户数据库、音频采集/播放/导出、转写、保存恢复或像素验收；用户要求保留的原Android13秒失败File现场完全未触及。包ready仅覆盖冻结来源、APK、ABI、模型与签名门槛，不代表首次断网OCR、真实录音或完整像素通过。不同作者后续独立核包另出记录，本说明不代写独审结论。

[evidence-index.json](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/android-recording-wave-build13/evidence-index.json) 纳本run说明、冻结与attempt/collection记录，以及本平台同名artifact的APK/命令日志；排除自身和prior-outputs，旧输出完整身份继续由output-isolation/result保全。
