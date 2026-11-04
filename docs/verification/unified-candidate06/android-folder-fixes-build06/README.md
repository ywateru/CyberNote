# android-folder-fixes-build06 — accurate build and collection

2026-11-05，**BUILD/COLLECT READY；STOP，等待不同作者包独核及root实际验收**。仅使用已审canonical run-build.py和collect-outputs.py、attempt01。Mac10构建及收集完成后才执行Android06；独占共享target/cache。

- 精确source：`de372d31e0578a7f2619413c0abde6a8439bb3c6`。
- 产品301项聚合：`5cf86b16c5dc6f122b9789ee1b5181000616a533a211b8f6099881feab9b6a74`；完整320项聚合：`f8f53954584ba4c7712dc271ddcb515c9faf8be51fcb64838e4ab7236684ad0e`。
- Freeze SHA256：`74ebef00dc96fd4bbd39ed1df3e7d3d08ffb7d3f0824b8e1647f3f85a827c7a0`。
- Build exit0，elapsed 19.361s；600s/2GiB门槛保持，无下载停止或错误。ownedGroupStopped=true、无残留组成员。
- 旧application和dist由工具原子rename到本attempt的prior-outputs；固定原路径在命令前为空，命令后生成新产物。见`android-attempt01/output-isolation.json`及`generated-outputs.json`。
- 构建及收集的输入比较全部true，补充输入保持；原始日志及签名记录保留在attempt和artifacts相应目录。

准确APK：`artifacts/unified-candidate06/android-folder-fixes-build06/android-attempt01/android-original.apk`，179247354字节，SHA256 `8609231ff310ffef028c62b20f9774bcb2968f15d21a95ddf87d3f4eb98951ac`。

ZIP 1066项，实际ABI仅arm64-v8a；25个OCR模型共2490310字节，与冻结AAR逐模型相同。apksigner exit0，唯一debug证书`e71ec0b1b626c9e54c7b4a1517ba1c12703d86364c17100658d954a94e6bec79`，匹配既有升级身份。

offline14本轮证明nonce=`4590f8eb464b42c1a39c5c4062793b1e`，offline=true、workers=2、configurationCacheJvmProperty=false，精确本轮marker 2条；无cache-reuse接受。临时init在工具核身份后删除，temporaryGradleInitRemoved=true，日志由collector重新解析一致。

只新增本run/产物证据；没有源、工具、依赖、锁或环境变更，没有清共享缓存、GUI、ADB、DB、安装、启动或Git mutation。ready仅上述来源/字节/模型/签名门槛；设备、正常/冷重启、实际选择交互及原版像素仍待root验收。
