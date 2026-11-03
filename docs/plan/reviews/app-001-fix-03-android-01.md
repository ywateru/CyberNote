---
id: app-001-fix-03-android-01
task: app-001-fix-03
baseline: d9a5be5
result: p1-ordinary-save-blocked-old-webview
date: 2026-11-03
---

# FIX03 Android 真输入有限验证 01

**P1：默认生产 APK 在 Android 11 / WebView 91 上无法保存真实输入。** 创建备忘录并通过原生触摸、系统输入写入合成文本后，界面出现 `crypto.randomUUID is not a function`；锁定及冷启动矩阵尚未到达，不计为通过。已向主任务及开发报告，等待统一安全 UUID 兼容修复后复验。

## 产物与环境

- 来源提交 `d9a5be5`，生产保存语义 `b5dcfa8`；默认构建，无 proof 面板。
- APK `src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk`，300,948,122 字节，SHA256 `3cb26e23b6d86dc3c8fe25bfa8a614e72b704fc6b40621f286960d312f853291`。
- `adb install -r` 更新已有 `com.local.notesclone`；随后从已安装 `base.apk` 流式读取校验，大小与 SHA256 均一致。未清除应用数据、未导出私有笔记或令牌。
- `emulator-5580`，Android 11 / API 30 arm64 GMS；实际 User-Agent 为 Chrome/WebView `91.0.4472.114`。
- 实际页面 `http://tauri.localhost/`，`isSecureContext === true`，`crypto.getRandomValues` 是函数，`crypto.randomUUID` 为 `undefined`。因此不能把失败归因于非安全上下文。

## 实际操作与失败路径

1. 原生触摸“新建备忘录”，再触摸实际编辑器标题。
2. 通过 `adb input text` 写入 `QA FIX03 Android 20261103`，发送原生 Enter，再写入 `PRIVATE-FIX03-ANDROID-SAVED-2026`。此次 Enter 未分开标题，实际文档已原样记录。
3. 页面显示错误横幅 `crypto.randomUUID is not a function`。`src/bridge.ts:57` 的生产 `registerSaveIntent` 在原生请求前调用该缺失 API，真实编辑触发的保存登记因此失败。
4. 只读读取实际 `.tiptap.editor.getJSON()`、selection、环境及错误文本，并保存截图。没有注入 React、编辑器或桥接状态，没有使用 proof 请求替代输入。

当前合成文档仍在编辑器内存中；其完整 JSON 已留在证据中，**未声称其已经持久化成功**。没有强停、冷启或卸载该失败现场，避免丢弃尚未保存的合成输入。修复后需重新真实输入并证实持久化。

## 有限结论与后续

| 检查 | 结果 |
| --- | --- |
| 默认 APK 与实际安装文件一致 | pass |
| 实际生产界面无 proof 面板 | pass（仅本次可见界面） |
| 真实新建及输入 | 已执行 |
| 普通自动保存 | **fail / P1** |
| 正确/错误密码、编辑后关闭全部锁定、正文/Undo/分享撤权 | not-run，被保存失败阻断 |
| 强停后仍锁定、解锁后正文保全 | not-run，被保存失败阻断 |
| Back / focus 同步及无白屏 | not-run |
| Mac 双窗口、时序证明及像素一致 | 本轮不覆盖 |

统一 ID 兼容实现应使用 `crypto.getRandomValues` 或原生密码学随机源，保留 UUID v4 格式及强随机性；不要降级为 `Math.random`。修复覆盖生产所有 ID 入口后，用新默认 APK 的实际安装身份重新执行本轮有限矩阵。

证据：`docs/verification/qa-fix-03/android-d9a5be5/`。`actions.jsonl` 是原生操作时间线；`entered.png` 是失败现场；`save-failure-environment.json` 是实际环境与完整合成文档。初始 snapshot helper 的 editor selection 路径不正确，`entered.json` 的 selection 为 null；最终环境文件使用实际 editor 实例读取并保留 anchor/head。

一次早期组合命令包含不必要的私有数据归档，自动审批以可能导出私人笔记/令牌为由拒绝，整条命令未执行。已移除此操作，后续只执行更新安装和安装文件校验，没有重试归档。
