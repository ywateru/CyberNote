# Android12：录音界面58＋59准确离线构建与APK封存

准确源 `fa21657bc116431324d85b18fcbe9e1d328471fb`，产品333文件聚合 `c4af1ea4245c575835070d29a1616190540fd25dd6fbb7d33b924fddb5e4774a`，完整352输入聚合 `f79a1decd907350da75647ce8d6ab8040acb7b482aa91a9b9240c3089c531b85`。本轮准确授权见 [android-authorization.json](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/recording-visual5859-preparation/android-authorization.json)，输入沿Android11完整底表保留并加入58／59两个新检查脚本；76插件文件、14生成输入、5补丁依赖及fixture例外均保全，清单关系见 [准备说明](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/recording-visual5859-preparation/README.md)。

冻结文件SHA256：`1e0aced0d618087fd17ec496d55fc01b92dc4f76370910f5d333ce2222f5c01e`。root先复核 [root-freeze-review.json](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/android-recording-visual-build12/root-freeze-review.json) 再授权本平台attempt01；完整冻结见 [input-freeze.json](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/android-recording-visual-build12/input-freeze.json)，摘要见 [freeze-summary.json](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/android-recording-visual-build12/freeze-summary.json)。本次nonce `c459c9c1deff40baaa5d0fc6bbc10ff2`，构建命令 `pnpm android:build --debug`，exitCode=0，elapsed=44.386s，ownedGroupStopped=true且没有残余自有组成员。构建为北京时间 2026-11-05 13:52:34 至 2026-11-05 13:53:22；收集为 2026-11-05 13:58:17 至 2026-11-05 13:58:21，collector ready=true。

[构建result](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/android-recording-visual-build12/android-attempt01/result.json) SHA256 `203526b9386a62367d3511a06cc659358a4ca3964ded001b92270fb4d7f4eae3`；[收集result](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/android-recording-visual-build12/android-attempt01/collection/result.json) SHA256 `d3069426f4c1c3ff2868e25deacaad85875694d57a063b839e0985e87d778dcb`。构建前后、收集前后全部15项输入比较均true，补充输入不变。原固定输出与dist原子移至本attempt的 `prior-outputs/`，保全前后身份及新生成输出分别见 [output-isolation.json](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/android-recording-visual-build12/android-attempt01/output-isolation.json)、[generated-outputs.json](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/android-recording-visual-build12/android-attempt01/generated-outputs.json)；未通过清理target/cache替换来源门槛。

准确保存APK为 [android-original.apk](/Users/water/work/2026/Apple-Notes-Clone/artifacts/unified-candidate06/android-recording-visual-build12/android-attempt01/android-original.apk)，**180721914字节**，SHA256 `533369f55e8fd927abbe9f5fff17468798db954566488b530d22c689253779f6`。源固定输出与保存副本身份一致；artifact目录为 `/Users/water/work/2026/Apple-Notes-Clone/artifacts/unified-candidate06/android-recording-visual-build12/android-attempt01`。此APK由本次新生成输出收集，未以Android11旧包或原先固定路径的既有文件代替。

本次Gradle真实日志有两条精确当次证明：

```text
CANDIDATE06_OFFLINE=true workers=2 configurationCacheJvmProperty=false nonce=c459c9c1deff40baaa5d0fc6bbc10ff2
```

runner和collector均重新解析该nonce，`offline=true`、workers=2、configurationCacheJvmProperty=false、markerCount=2，没有配置缓存复用。临时init身份为 `/private/tmp/notes-scan-gradle-home/init.d/candidate06-offline-c459c9c1deff40baaa5d0fc6bbc10ff2.gradle`，SHA256 `326194d346c9d729463ad6dcad8c51f8361a5bf4f8c5028b51ef668b916d6594`；自有进程组停止并核对device／inode／size／SHA后删除，result记录 `temporaryGradleInitRemoved=true`。环境固定NDK27.2.12479018、Java17、现有Gradle cache及只读overlay，使用既有完整distribution，不获取新依赖。

APK逐ZIP成员哈希及模型条目保存在收集result。实际ABI仅 `arm64-v8a`，25个离线OCR模型共 **2490310字节**，逐项与冻结缓存AAR匹配，`ocrModelsExactlyMatchCachedAars=true`。[apksigner日志](/Users/water/work/2026/Apple-Notes-Clone/artifacts/unified-candidate06/android-recording-visual-build12/android-attempt01/command-01.txt) 验签exit0、签名者数量1、v2=true；证书SHA256 `e71ec0b1b626c9e54c7b4a1517ba1c12703d86364c17100658d954a94e6bec79`，与candidate04升级证书一致。证书相容只说明签名身份，不表示已经执行升级或安装。

构建日志保留TypeScript／Vite大chunk、Rust既有dead-code以及AGP旧DSL／选项提示；本轮构建成功，没有为消除提示改写产品或配置。收集ready=true的范围是准确APK、ABI、模型与签名／来源门槛。

**本轮未安装或启动新APK，未操作用户明确保留的Android现场。** 没有ADB／设备交互、麦克风、真实音频采集／回放、用户数据库、保存恢复或整机像素验收；不能由包内离线模型推导首次断网OCR成功，也不由证书相容推导升级行为。不同作者独立核包由独立记录给出，本说明不代写其结论。

[evidence-index.json](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/android-recording-visual-build12/evidence-index.json) 仅索引本run的说明／冻结／attempt记录及本平台同名artifact的APK和命令日志；排除索引自身与 `prior-outputs/`。旧输出完整身份继续由output-isolation/result保留，runtime及独立复核目录不纳此索引。
