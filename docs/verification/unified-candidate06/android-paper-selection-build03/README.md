# Android paper selection build03 — exact source delivery

本次准确来源与Mac sidebar build05相同：`093986d170ef279fbce0f66e59891fd5f94aecad`。使用root新审查的Android独立freeze和已冻结recovery02工具，串行执行一次attempt01并成功收集，没有安装/设备/GUI操作。

## Frozen inputs and command

root授权 `../root-authorization-android-paper-selection-build03.json` SHA256 `68edde9e7ae7d605879914c5312c71012ddbb4662170545a1906a6d6f6dbe8bc`；`input-freeze.json` SHA256 `39190998b264a76345eebe66bcd39642ff4c512f1422ec65b88399b644369d9d`。

238产品aggregate `c888cc902f9f05da636c827c2b030200732967bcfd4fb52743000e877333bc60`，302完整输入aggregate `aa8a862312b923f56bb4046dbacd780175a79bf080991647a38e5d121392ea28`。App/CSS/toolbar来源保持原已独审版本；整个构建期间未改变tracked inputs、暂存或提交。

执行原 `android-paper-recovery-preparation02/run-build.py`，`--attempt attempt01 --exclusive-target-and-cache --allow-scoped-gradle-offline-init`，并在成功后运行该目录原collect-outputs.py。由于已知OS进程检查限制使用明确授权的require_escalated；没有改工具或绕过进程清理机制。

实际固定命令 `pnpm android:build --debug`。NDK27.2.12479018、CARGO_NET_OFFLINE=true、CARGO_BUILD_JOBS=2、Gradle daemon=false/configuration-cache=false。作用域限定且有身份记录的Gradle init启用offline=true与maxWorkerCount=2；原始build.txt含 `CANDIDATE06_OFFLINE=true`，完成后仅该临时init按inode/字节/hash核对后移除。保留旧输出和共享缓存，没有下载/升级/清理。

## Build and collection

`android-attempt01/result.json`：exitCode0，elapsedSeconds33.804，全部15项inputComparisons为true，supplementalInputsUnchanged=true。ownedGroupStopped=true、remainingOwnedGroupMembers为空、temporaryGradleInitRemoved=true。构建最低空闲75,096,424,448 bytes，高于2GiB护栏；固定600秒上限未触发。

旧固定APK（SHA256 `843e0c01aad154872851664ced574e1fa07544d8fcf874022698c37a3ee160f8`）和旧dist在 `android-attempt01/prior-outputs/` 保全。canonical runner记录旧路径原子移走、命令前不存在与新输出inode/hash；本次没有以旧包冒充新包。前端保留既有大chunk提示，Gradle保留已有libraryVariants弃用提示。

`android-attempt01/collection/result.json`：ready=true，buildNonce `94b1e94f44f54db8962b06578a9f0d6c`，buildResult SHA256 `310324bb81cd72d7434c11b65aff1d66b8e988c9136f83ed333366cd384be434`。collection全部15项inputComparisons为true，supplementalInputsUnchangedDuringCollection=true。

准确交付APK（相对项目根）：

`artifacts/unified-candidate06/android-paper-selection-build03/android-attempt01/android-original.apk`

- 字节：177445114。
- SHA256：`d6350a35374a8fa05c836e26f361dfb3d4834882fd4a360ad7a7ebbedf2d123c`，与此次固定路径新输出完全相同。
- ABI：仅arm64-v8a。
- OCR：25个模型、2490310字节，与冻结缓存AAR模型逐项完全一致。
- apksigner verify exit0，APK v2签名有效；证书SHA256 `e71ec0b1b626c9e54c7b4a1517ba1c12703d86364c17100658d954a94e6bec79`，匹配candidate04升级证书。
- 所有APK entry身份、模型、签名日志在canonical collection结果与产物目录，交付清单封口本run/artifact全部文件。

## Limits

这是准确APK产物、签名、模型、ABI和升级证书兼容检查。没有安装、真实设备运行、原生输入、首次离线OCR、音频、持久化/重启或像素验收。root与不同作者继续产物独审及设备运行验证。没有改产品/依赖/工具/冻结来源，也没有开始其他平台构建。
