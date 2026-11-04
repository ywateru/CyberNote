# Android folder fixes package06 — independent review

2026-11-05（本地日期）：**PASS / STOP**。本轮准确 Android06 包门槛通过，首次 385 项检查无失败；交回 root 保数据升级及实际运行验收，不代表原生选择把手、冷启持久化或原版像素通过。

源码身份 `de372d31e0578a7f2619413c0abde6a8439bb3c6`，freeze `74ebef00dc96fd4bbd39ed1df3e7d3d08ffb7d3f0824b8e1647f3f85a827c7a0`。九字段授权、root 冻结复核、构建/收集结果及四份完整前后快照一致。320 个明列输入和 301 个产品文件逐字节复核，聚合一致，结束时仍保持；20 个本轮作者/产物证据文件初末相同。遵守禁 Git，source ID 的证明限于固定记录链和当前精确字节，未独立读取提交对象。

准确 APK 179,247,354 字节，SHA256 `8609231ff310ffef028c62b20f9774bcb2968f15d21a95ddf87d3f4eb98951ac`。逐流读取全部 1066 个 ZIP 条目校验 CRC/hash，无重复名称；4 个实际 ELF 均为 ELF64 little-endian AArch64，ABI 仅 arm64-v8a。25 个 OCR 模型共 2,490,310 字节，逐模型与冻结 AAR 模型清单及 collector 相同。fresh apksigner 验证 exit0、v2 true、唯一证书；独立解析 APK-v2 DER 证书 SHA256 `e71ec0b1b626c9e54c7b4a1517ba1c12703d86364c17100658d954a94e6bec79`，与旧准确 Android05 保全包相同，支持既有升级身份。

真实本轮原日志第 73/74 行均为 nonce `4590f8eb464b42c1a39c5c4062793b1e` 的 offline=true/workers=2/configurationCacheJvmProperty=false 标记；没有缓存复用/下载记录，原生日志含准确 aarch64 APK 完成。576 字节临时 init 用纯函数按本次 nonce 独立重建后 hash/身份匹配清理记录，准确路径已不存在。旧 Android05 APK 完整保全，旧/新 inode 29389444/29437255 不同；新 APK 准确最终路径和 dist 完整身份匹配。构建和收集所有已记录进程组当前均无残留。

证据：docs/verification/unified-candidate06/android-folder-fixes-independent06/；只读 verifier 共用兄弟 mac-folder-fixes-independent10/verify.py，APK-v2 纯解析函数复用此前已审独核脚本，均入索引。未改源/工具、构建、启动、GUI/ADB、设备、数据库、下载、Git 或遍历/清理共享缓存，只读取准确最终产物路径。缓存/SDK 环境和 AAR 模型采用冻结记录，未重探共享缓存；嵌入压缩前端未独立解包重建。证书兼容不能替代设备升级或原生运行验收。资源释放 STOP。
