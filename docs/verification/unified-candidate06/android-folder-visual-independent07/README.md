# Android07 独立核包

PASS / READY STOP，391 项有限包门槛通过；报告 `docs/plan/reviews/android-folder-visual-independent07.md`。

`verify.py` / `attempt01-command.json` 保存一次完成387项来源、归档、模型和签名核验后的进程查询权限失败，失败未覆盖。`finish.py` / `finish-command.json` 只继续记录进程组和初末身份4项检查；`result.json` 含最终391项断言及准确产物身份。`fresh-signature-check.json` 是本轮 apksigner 原文，`fresh-owned-group-check.json` 只保存本轮已记录进程组查询结果。345项初末证据和322输入均未变。

准确 APK 179247354 字节，SHA256 e19965fd97c45ac3184e569777146d68b4d312bd561bbb2862d27ad93c6a86c6；1066 ZIP成员、四个arm64 ELF、25个离线模型2490310字节、唯一证书与准确旧06相同。源码身份由授权、冻结、原日志和明列输入字节支撑，未独立读取Git对象。没有应用测试、构建、启动、GUI/ADB、安装、数据库、下载或共享缓存操作。证书和核包通过不能替代设备升级、实际交互或像素验收。

索引从仓库根解析，含新报告和复用的旧纯APK-v2解析源，不含索引自身。旧证据未修改。
