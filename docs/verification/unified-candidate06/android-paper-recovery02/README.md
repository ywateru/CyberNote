# Android paper recovery02 准确包交付

2026-11-04。恢复run `android-attempt01` 构建退出0，收集退出0，`ready=true`。当前不同作者独审result记录881项全部通过，结论限定为保全APK字节和源码/签名/模型证据来源。本README只汇总现存材料，没有重测或设备操作；独审说明的最终封存由reviewer/root负责。

## 准确来源与包身份

- source HEAD：`347660b352f6becb1f52a9c79fdf5372b50f1f12`。
- 产品238项，聚合：`560f9826b44320f184493f8f522a2cfefaf78a7e4e7c1faad8fa001e1190583d`。
- 完整输入302项，聚合：`2131ac2abe616b6599b2f7c77665ec095874b2c37cbb2e8be2b5450e4dcffc3f`。
- 新恢复freeze SHA256：`0ceacbb6463f459cd6e56bfcda5a1d83036092d632293fee4d6c6c983c904752`。
- 固定命令：`pnpm android:build --debug`，耗时17.985秒；本轮nonce：`be868ada6cd34ea59ec6fd5ef859e0fd`。

准确保全包为 [android-original.apk](/Users/water/work/2026/Apple-Notes-Clone/artifacts/unified-candidate06/android-paper-recovery02/android-attempt01/android-original.apk)。

| 项目 | 结果 |
|---|---|
| 字节数 | 177,445,114 |
| APK SHA256 | `843e0c01aad154872851664ced574e1fa07544d8fcf874022698c37a3ee160f8` |
| 签名 | 既有收集时apksigner退出0，v2验证通过，唯一签名者 |
| 证书SHA256 | `e71ec0b1b626c9e54c7b4a1517ba1c12703d86364c17100658d954a94e6bec79` |
| ABI | 仅 `arm64-v8a` |
| OCR模型 | 25个，共2,490,310字节，全部匹配冻结AAR记录 |

该签名证书与candidate04记录相同，仅证明包级升级证书条件；没有通过本次收集证明实际升级安装或数据兼容。完整ZIP成员、模型与签名原始日志见收集结果和产物目录。

## 恢复原因与离线证据

旧 `android-paper-build02/android-attempt01` 底层构建退出0，但复用configuration cache且缺少本轮 `CANDIDATE06_OFFLINE=true`，旧runner正确拒绝成功，原失败仍成立。恢复使用新复制工具链，仅在Android有效GRADLE_OPTS追加configuration-cache=false：

```text
-Dorg.gradle.daemon=false -Dorg.gradle.configuration-cache=false
```

本轮原日志第40、41行均为 `CANDIDATE06_OFFLINE=true`，未出现 `Configuration cache entry reused`。离线标记门槛没有放宽；配置缓存/依赖缓存未删除。输入、工具、环境及补充资源在构建和收集前后均一致，构建最低可用空间76,287,528,960字节。临时offline init由工具在本次进程组停止后按身份核验移除。

原失败APK由本次输出隔离完整保全到 [prior-outputs/application](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/android-paper-recovery02/android-attempt01/prior-outputs/application)；旧结果和日志不改写。旧失败包与本轮新包字节相同，新run仍通过源路径构建前为空、原子保全与新生成文件身份核验建立来源。ready属于本次恢复证据链，不能倒推旧attempt通过。

## 证据入口与验收范围

- [新root授权](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/root-authorization-android-paper-recovery02.json)、[新输入冻结](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/android-paper-recovery02/input-freeze.json)、[冻结摘要](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/android-paper-recovery02/freeze-summary.json)、[恢复工具说明](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/android-paper-recovery-preparation02/README.md)。
- [本轮原始构建日志](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/android-paper-recovery02/android-attempt01/build.txt)、[构建结果](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/android-paper-recovery02/android-attempt01/result.json)（SHA256 `4be3619edfc568c8780b7154d233275c3f44bb1bd2747258d6cef5b7f135eaa6`）。
- [输出隔离](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/android-paper-recovery02/android-attempt01/output-isolation.json)、[新生成输出](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/android-paper-recovery02/android-attempt01/generated-outputs.json)、[收集结果](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/android-paper-recovery02/android-attempt01/collection/result.json)（SHA256 `0c4314c793d6776450136cbac98bb408d59014194854e6e3e12cb6a5b8ffd5f1`）。构建和收集的前后输入清单保留在同一attempt目录。
- [不同作者独审结果](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/android-paper-recovery-independent02/result.json)（当前881/881，SHA256 `4a8d5163efd64d4cae1d30d915fe651e1179973d38c25955be5330f610ccc2ce`）、[独审执行记录](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/android-paper-recovery-independent02/command.json)、[独审适配身份](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/android-paper-recovery-independent02/adaptation.json)。独审将当前APK的v2证书DER与既有apksigner日志相连，没有重新执行密码学签名验证、平台构建或设备命令。
- [旧失败结果](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/android-paper-build02/android-attempt01/result.json)、[旧失败日志](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/android-paper-build02/android-attempt01/build.txt) 保持原样，未从旧失败收集ready。

**ready不等于设备runtime通过。** 本交付覆盖APK来源、字节、签名日志、模型与ABI条件；没有安装、启动、实际升级、首次离线OCR、系统输入法、Back、录音、持久化、纸张选择原生交互、iOS或像素一致验收。原始冻结摘要的FROZEN ONLY仍是冻结阶段库存记录，后续成功状态以本次构建/收集及独审为据。

本README仅新建交付索引，没有修改产品、工具、既有manifest、冻结、失败材料或独审结果。
