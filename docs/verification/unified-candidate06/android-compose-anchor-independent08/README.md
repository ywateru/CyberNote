# Android08 独立核包

PASS / READY STOP。403 项有限包门槛通过，零失败。报告：`docs/plan/reviews/android-compose-anchor-independent08.md`。

固定源标识 `182464bcc3055caadcd78fe4c7ce1a0ec31eea6a`，304 产品和 323 输入与 Mac13 完整冻结相同。准确 APK 179247354 字节，SHA256 `a7ba557478e42da0a7f0e387a772bf764b067bfe082553e765603ca700385632`。

`verify.py` 一次完成 388 项来源、全部 ZIP 成员、arm64 ELF、模型、输出隔离和签名核验；`package-checkpoint.json` 保留检查点。`verify-embedded-assets.mjs` 有界解压实际原生库中的 Brotli 前端资源。CSS / JS 与准确 dist 全字节相同；478 字节 HTML 与 dist 的 498 字节有序列化差异，`finish.py` 对全部规范 token、属性、文本和引用核验相同，增加资源和终末门槛后共 403 项。

初次进程查询被宿主权限拒绝，原错误保存在 `owned-group-permission-attempt.json`；仅窄范围只读查询重试，`fresh-owned-group-check.json` 确认 61080 / 61630 两个记录进程组均已结束，没有重跑包检查。初末 351 保护文件和 323 输入身份一致。

没有构建、签名写入、运行、GUI / ADB、安装、数据库、Git、下载或共享缓存操作。无设备升级、实际交互、持久化或像素通过结论。后续运行须由主任务绑定本准确 APK 验收。

证据索引从仓库根解析，包含本目录、新报告与复用的既有纯解析 / 解码源，不含索引自身。旧证据未修改。
