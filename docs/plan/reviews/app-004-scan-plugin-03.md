---
id: app-004-scan-plugin-03
task: app-004-scan-plugin
baseline: ec6b6dc
result: android-session-runtime-pass-native-scope
date: 2026-11-03
---

# APP-004 独立运行补审 03

**ec6b6dc 的 Android 正常会话目录修复通过独立设备验证，关闭补审 02 的 P1 运行阻塞。** 首次断网 OCR、透视/PDF、10 项路径边界均实际执行并完成。范围是独立 native harness；主应用集成、相机硬件和界面像素一致性未由本轮证明。

证据目录：`docs/verification/qa-scan-plugin/run-ec6b6dc/`。保留此前失败报告和原始 tar，本轮仅增加新结果，没有改写失败历史，也没有修改生产源码或测试共享主 App 的未提交代码。

## 身份及干净首启

独立核对 ec6b6dc 插件源码差异为空；SessionStore、DeviceFixtureActivity、APK、AAR 的大小/hash 全部匹配交接 manifest。54,220,489 字节 APK SHA256 为 `a6942f22e3b1a621513cde16af447b53d0f126c48e881763816b565ebc746b92`，已安装 base.apk 全量读回 hash 相同。见 `identity.json` 和 `installed-apk.json`。

设备 emulator-5580，Android 11/API30 arm64，装有 GMS。先保存此前 harness 文件至 `harness-before-clear.tar`，仅清 `com.local.notesscan.harness` 数据，确认 files 不存在，随后启飞行模式、关闭 Wi-Fi/移动网络，再首次启动 OCR Activity。没有清理主应用数据。前置命令与网络读回分别在 `fresh-offline-preconditions.json`、`network-first-launch.json`。

每个后续场景均先 force-stop harness 再冷启动，未把 top-most intent delivered 当作实际重跑；以下结论均读取 finishedAt/status 和检查内容。

## 实际执行结果

| 场景 | 独立结果 | 证据 |
| --- | --- | --- |
| 首次离线 OCR | airplaneMode=1、activeNetwork=null、GMS=true；中文三行精确匹配“离线文字识别 / 备忘录扫描测试 / 本地保存2026”，347ms；空白 status=empty/text空/lines空，62ms | `ocr-first-offline-1793694404871/result.json` |
| 原始图与会话生命周期 | 两图原始字节相同；ready 使用新 SessionStore 重开一致；冻结夹具实际执行 acknowledge 后 get 得 session_missing，全部完成才写 pass | 同目录 session JSON、冻结夹具及 result |
| 透视校正 | 已知四角修正后红/绿/蓝/黄位置正确，四点每通道最大误差 0–1 | `perspective-pdf-1793694462767/result.json`、原图/校正图 |
| PDF 页序与旋转 | 真实生成两页 118,502 字节 PDF；第 1 页青色竖向 612×842，第 2 页四象限横向 842×645，内容顺时针 90°，顺序经过 movePage 后正确；ready 重开一致 | 同目录 PDF、ready-session、设备渲染 PNG |
| 独立 PDF 核验 | 将实际导出的 PDF 用 Poppler 重新渲染，再用 Pillow 独立采 8 点，误差 0–1；另直接查看两页 PNG，页序/方向/四象限与预期相符 | `poppler-pdfinfo.txt`、`independent-pdf-check.json`、`poppler-page-1.png`、`poppler-page-2.png` |
| 路径边界 | 10 项全过，系统别名接受，越界 token、会话/manifest/资源 symlink、替换根及 cleanup 均按预期拒绝或跳过；外部哨兵原文保全 | `path-boundary-1793694646305/result.json` 和 `outside-sentinel/keep.txt` |

PDF SHA256：`9c0f23061ee20df12d15665e1448847422666c0f198fbae619e38bb1d2021b07`。上述每个设备输出目录均同时保留未经解压的 tar；解压时拒绝路径逃逸和软/硬链接。

## 根因与边界

本轮同一 Java File 直接记录 filesDir absolute=`/data/user/0/com.local.notesscan.harness/files`，canonical=`/data/data/com.local.notesscan.harness/files`，二者不等。正常会话在 canonical 根下创建后 absolute=canonical，原系统别名路径仍指向同一目录；新 Store 可重开。由此补足补审 02 当时尚未证实的别名原因。

修复只先规范受信任的 Context.filesDir，再构造固定受管根；会话 UUID、直接子目录、根/会话 canonical、manifest/资源安全检查仍保留。路径边界实测证明此次兼容修复没有以放开不受信任路径换取通过。

## 释放与剩余范围

测试后 force-stop harness，并恢复原值 airplane_mode_on=0、wifi_on=1、mobile_data=1，逐项读回匹配测试前状态；见 `network-restored.json`。Android 已释放。没有重复此前已独立通过的 Mac 宿主复制测试，其结论仍以补审 02 的范围为准。

此次首次离线只证明带 GMS 的此台 API30 模拟器，不能外推无 GMS 或所有 Android。未测试相机授权/硬件、裁切手势、Tauri WebView invoke、主 Store 事务/崩溃恢复、主 App 插入位置和 UI 像素一致性；这些仍按原集成任务单独验收。
