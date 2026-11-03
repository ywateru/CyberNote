# ec6b6dc Android 扫描独立证据

独立补审：[app-004-scan-plugin-03](../../../plan/reviews/app-004-scan-plugin-03.md)。正常会话目录运行阻塞已关闭；仅 native harness 范围通过。

- `identity.json`、`installed-apk.json`：冻结源码、交接 APK/AAR 与实际安装包的独立 hash 核对。
- `device-before.json`、`harness-before-clear.tar`：设备原网络值与清数据前 harness 文件保全。
- `fresh-offline-preconditions.json`、`network-first-launch.json`：仅清 harness 数据、首次启动前断网的命令和读回。
- `ocr-first-offline-1793694404871.tar` 及同名目录：实际首启中文/空白 OCR，status=pass；ready manifest 与原始图。
- `perspective-pdf-1793694462767.tar` 及同名目录：真实透视、页序、旋转和两页 PDF，status=pass。
- `independent-pdf-check.json`、`poppler-pdfinfo.txt`、`poppler-page-*.png`：用 Poppler 重新渲染导出 PDF，独立采样及视觉核对；8 点每通道误差 0–1。
- `path-boundary-1793694646305.tar` 及同名目录：10 项边界全过、同 Java File 系统别名与外部哨兵原文保全。
- `*-start.txt`：对应冷启动输出；不是独立通过依据。
- `network-restored.json`：原值 airplane=0、wifi=1、data=1 已恢复并读回。
- `evidence-sha256.json`：本目录其它证据文件的大小及 SHA256，便于后续完整性复核。

保留原始 tar，安全解压时校验成员解析后路径始终在此证据目录内并拒绝软/硬链接。所有内容为受控合成夹具，不包含用户笔记。此前失败证据在上级 `host-copy-device-20261103/`，未覆盖。
