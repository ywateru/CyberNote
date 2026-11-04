# Android folder visual package07 独立核包

**PASS / READY STOP。** 391 项准确包门槛通过，无新增 P1/P2 阻断。主流程可以保数据升级并进行实际运行验收；本结论不授原生交互、持久化、选择把手、系统键盘或原版像素通过。

源标识由 root 固定为 `d7423070207684c5a2bb584281350723c44e9d9c`，303 产品聚合 `7c83817061c438c388c9c52e8e0207ffb415a0847f9d0a320c59eac5a63363e5`，322 输入聚合 `ca8f00a42d641cd2693ce43b4794fc03e3c9315a16c7faccdf5d9c59e6f0241f`。完整成员与本轮 Mac12 冻结完全相同。独审没有读取 Git 对象；对应关系来自九字段授权、root 冻结复核、四份完整快照、真实构建及 collector 和当前明列文件字节。

冻结 SHA256 `703b60b51ccc6a8eb98c9460759c7449ec27e38b61ec5091ec29d0ed739867b7`，构建结果 SHA256 `e18851b4e44afbd74aaf0dfc21c24a185ddc3b1ddb504e806054a25d4f31ef8f`，collector SHA256 `6e528483f6e5e5875abed78d14aab063441d2cea99848c93942475dc0134d237`。root 的 Android 冻结复核文件在 build 前创建；核对真实时间顺序及 nonce、输入聚合、结果 SHA 链接。

准确 APK 为 `artifacts/unified-candidate06/android-folder-visual-build07/android-attempt01/android-original.apk`，**179,247,354 字节**，SHA256 **`e19965fd97c45ac3184e569777146d68b4d312bd561bbb2862d27ad93c6a86c6`**。保存副本与真实生成的准确最终路径身份一致，新旧 APK inode 为 29522276 / 29437255；旧 Android06 保全件及其完整原身份保持。

全部 1066 个 ZIP 有效成员逐流读取并校验 CRC 与 SHA，无重复名称，清单与 collector 全等。实际四个 .so 均为 ELF64 little-endian AArch64，ABI 只有 arm64-v8a。25 个 OCR 模型合计 2,490,310 字节，逐模型大小和 SHA 与冻结 AAR 模型清单及 collector 相同。这里只读取最终 APK 和冻结记录，未遍历或重新探测共享缓存。

新鲜只读 apksigner exit0、v2 true、唯一签名者。独立纯解析 APK-v2 DER 证书 SHA256 为 `e71ec0b1b626c9e54c7b4a1517ba1c12703d86364c17100658d954a94e6bec79`，与准确旧 Android06 包相同。该证书兼容门槛支持后续升级验收，不能替代实际设备安装、保数据和启动证据。

真实 build 日志第 73、74 行均为 nonce `a21282ce306d41bda559de91e371bb6d` 的 offline=true / workers=2 / configurationCacheJvmProperty=false 标记，记录真实 aarch64 APK 完成，28.699 秒、exit0；没有下载或复用配置缓存日志。临时 init 按本次 nonce 独立纯函数重建为 576 字节，SHA 和清理前身份记录匹配，准确路径已移除。全部记录构建及 collector 进程组已结束，签名子命令有界完成。七个 canonical 工具与冻结字节一致，没有修改依赖、锁、SDK 或工具。

首次 verifier 一次完成 387 项包检查和新鲜签名检查，最后查询进程表时被当前宿主权限拒绝；原脚本、命令、stderr 和失败记录保留。随后只进行经授权的只读进程组查询及最终保全检查，增加 4 项，合计 391 项通过；没有重跑包或应用测试。进程证据只保存本轮准确进程组的匹配结果，不保存其他进程信息。

345 个初始保护文件及 322 明列输入终末身份保持。只写本独核目录和本报告；没有构建、签名写入、启动、GUI/ADB、安装、用户 DB、下载、Git 或共享目标/缓存操作。嵌入的压缩前端未独立解码重建，源码到产物的结论限于精确冻结、原始日志、dist 和真实输出的对应。后续文件夹页绘制和点击应绑定此 APK 及设备安装身份，继续 task28 的有限实际运行和原版对照。

证据目录：`docs/verification/unified-candidate06/android-folder-visual-independent07/`；含独立 verifier、有限续检、签名原文、完整断言、初末保全和仓库根目录相对路径索引。复用旧独审文件中的纯 APK-v2 解析函数，原文件也列入索引。
