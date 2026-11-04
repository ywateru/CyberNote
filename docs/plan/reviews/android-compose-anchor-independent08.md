# Android compose anchor package08 独立核包

**PASS / READY STOP。** 403 项有限包门槛通过，零失败，未发现新的 P1 / P2 核包阻断。该结论支持主任务继续绑定准确 APK 的保数据升级及运行验收；不代表实际交互、原生选择、键盘、持久化或原版像素验收通过。

本轮固定源标识为 `182464bcc3055caadcd78fe4c7ce1a0ec31eea6a`。304 产品聚合 `6b1cda6557ff292326617bd2fdf8750ba37d700eb460e2d6cdb1ac2da80848ad`；323 输入聚合 `0769da604be0d4d3087771b948477e9c96c45992f0e75b81298465cdaa9d290e`。完整产品和输入成员与 Mac13 冻结逐项相同。源码标识由 root 指定；本独审未读取 Git 对象，使用九字段授权、root 冻结复核、四份完整快照、原始构建和采集记录及当前全部 323 明列文件字节支撑来源关系。

冻结 SHA256 `2e2c4ebe4d434ad73f7aa1492b95e60190130c5127738d8993f19489c7bb64a9`；授权 SHA256 `a74155b8c71c84b5741764ff34c495de91b44f5d36e513827eb21cb62b04c288`；构建结果 SHA256 `b503e1847917cd1ea719fb3527f59a2188e18b70f203eca6541a9c0a4226d660`；collector SHA256 `94d33d04157762c95f849813a74ace05d1b4fd01cc2cfd20049b6a51c73a0f63`。root 复核时间先于真实 build START，构建和采集记录的 nonce、冻结、聚合、产物身份与完整时间顺序均对应。

准确包路径为 `artifacts/unified-candidate06/android-compose-anchor-build08/android-attempt01/android-original.apk`，179,247,354 字节，SHA256 **`a7ba557478e42da0a7f0e387a772bf764b067bfe082553e765603ca700385632`**。保存副本与真实准确最终输出相同，新 inode 29578486，与旧 Android07 inode 29522276 不同。准确旧07包及完整保全输出身份保持；前后 dist 的目录身份不同，完整树、模式和文件字节与各自记录相同。

全部 1066 ZIP 有效成员逐流校验 CRC 和 SHA，无重复名称，与 collector 全清单相等。四个 .so 均有 ELF64 little-endian AArch64 头，ABI 仅 arm64-v8a。25 个 OCR 模型合计 2,490,310 字节，逐文件大小和 SHA 与冻结 AAR 模型清单及 collector 相等。共享缓存未遍历、重新探测或清理。

实际 `lib/arm64-v8a/libnotes_clone_lib.so` SHA256 `f20b7cd18675c9571ca69906582b1cc082459f93fa981fd15d7c2518c79112e7`，与已流式读取的 APK 成员身份相同。沿既有独审方法在资源文件名后最多 32 个候选偏移做有界 Brotli 解码，保存完整解压文件。CSS 为 67,171 字节，SHA256 `edec1dbfce2ad941bd9f66fbadcf2821852463341fcb07a59ce2936dfde52ca8`；JS 为 968,181 字节，SHA256 `9d8e413f4f8e547779949f72100c0de34ccfafaf99537e39f59b1b99fa05336d`，均与准确 dist 全字节相同。HTML 解压为 478 字节，SHA256 `a5e0d579cdd3f191f022b69355672e3927ea6d20555e8303c37e04b3041981a8`，与 498 字节 dist 存在 doctype、空白、void tag、空布尔属性的序列化差异；全部规范 HTML token、tag 顺序、属性值、非空白文本、注释和准确 CSS / JS 引用完全相同，未将 HTML 说成字节相等。解码与结构检查不执行原生库，也未独立重建前端。

新鲜只读 apksigner exit0，v2 true，唯一签名者。既有纯 APK-v2 解析函数独立提取的唯一 DER 证书 SHA256 `e71ec0b1b626c9e54c7b4a1517ba1c12703d86364c17100658d954a94e6bec79` 与准确旧 Android07 包相同。签名兼容支持后续升级尝试，不能证明设备上的实际保数据安装或运行。

真实日志第 73、74 行均为 nonce `953d1fffad4a48b5af33a7fe5441d704` 的 offline=true / workers=2 / configurationCacheJvmProperty=false 标记，记录真实 aarch64 APK 完成；构建耗时 27.328 秒、exit0，无下载或复用配置缓存日志。临时 init 通过既有纯函数重建为 576 字节，SHA256 `aa2be3df9b8eb3d3d19d09142e6bc4d25adb14a0754a9f9bbc13c78a9233dfc8`，与清理前完整身份相同，准确路径已移除。七个 canonical 工具与冻结字节相同。SDK、环境、模型和缓存记录在完整快照间比较，不声称完整 OS / SDK / 传递依赖可重现构建。

包检查一次完成 388 项并保存检查点。首次查询进程表在宿主层被拒绝，错误保留；随后仅进行已授权的窄只读进程组查询，确认 61080 / 61630 均无剩余成员，不保存无关进程信息，也没有重复包检查。嵌入资源及最终保全检查增加 15 项，最终 403 项通过。351 初始保护文件和 323 当前明列输入终末身份一致。

只写 `docs/verification/unified-candidate06/android-compose-anchor-independent08/` 和本报告。没有构建、签名写入、运行、GUI / ADB、安装、用户数据库、Git、下载或共享目标 / 缓存操作。本包不能替代后续真实设备升级、文件夹页新建点击、编辑器 / 键盘交互、持久化和原版截图对照。证据目录含原脚本、签名原文、完整断言、Brotli 解压资源、HTML 规范 token、初末保全、进程查询和仓库根相对路径索引。
