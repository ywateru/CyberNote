---
id: app-001-fix-03-android-03
task: app-001-fix-03
baseline: 20c3014
result: android-uuid-p1-closed-limited-native-flow-pass
date: 2026-11-03
---

# FIX03 Android 最终同源真实回归 03

**20c3014 默认 APK 已在原 Android 11 / WebView91 上完成真实输入、保存、锁定、错误密码拒绝、解锁后修改及强停冷启动回归，补审01的 UUID 保存 P1 关闭。** 仅下列单窗口有限生产流程通过，不代表 Mac 双窗/受控请求时序、输入法组合或像素验收。

## 安装与实际执行

`adb install -r` 保留既有应用数据；源 APK 与安装后的 `base.apk` 均为300,948,314字节，SHA256 `44b6b16d8b6afdb19f08d1a7eafb733a760deba61870339090e6da598f9082d5`。实际WebView仍为91，安全上下文true、randomUUID缺失/getRandomValues可用；默认界面无proof面板。没有改写crypto、React或编辑器状态，合成笔记通过原生触摸、Android系统输入/按键创建和修改。旧失败现场完整留在前轮证据；此次新建独立测试笔记。

实际标题 `QA FIX03 UUID20 Android 20261103`；实际正文 `PRIVATE-FIX03-UUID20-ANDROID-SAVED-2026`，正确解锁后通过真实输入追加 ` EDIT-AFTER-UNLOCK-20`。公开合成密码为 `FIX03-synthetic-only-2026`。

| 有限步骤 | 实际结果 |
| --- | --- |
| 原生新建、标题、Enter、触摸段落后输入正文 | 文档为heading+paragraph，没有旧randomUUID错误 |
| 设置密码/锁定 | 编辑器数为0，显示锁定页 |
| 错误密码 | 明确“密码不正确”，没有加载编辑器 |
| 正确密码 | 标题与完整正文恢复，证明此前保存成功 |
| 已解锁正文真实追加 | 新正文与Undo入口出现，无保存错误 |
| 从设置“关闭所有已锁定的备忘录” | 编辑器数为0，重新进入目标仍锁定，无Undo入口 |
| 锁定态点击共享 | 明确要求重新解锁，没有正文编辑器/共享正文界面 |
| 真实am force-stop、确认PID消失，再冷启动 | PID16193→空→16818，LaunchState=COLD；目标仍锁定 |
| 冷启动正确解锁 | 完整文档与关闭锁定前逐JSON相同，含追加内容 |
| Home后重新聚焦、系统Back | 焦点恢复后完整文档可见，Back返回列表，页面可操作未白屏 |

这是生产真实保存的结果证据；没有用固定sleep推断请求到达，也没有声称本轮控制了在途请求。关闭锁定时编辑器卸载、Undo入口消失及共享拒绝仅覆盖本实例，Mac多窗口与受控早/晚请求另验。

## P3非阻塞观察

正确解锁成功后，前一次错误密码的横幅仍保留，手动关闭后继续验证。正文与授权已正确恢复，没有数据丢失或越权；建议后续成功解锁时清除对应过期错误。当前没有修改生产代码扩大范围。

证据 `docs/verification/qa-fix-03/android-20c3014/`：实际安装身份、环境、原生操作时间线、各步JSON/PNG、冷启动PID、14项有限断言及完整性hash。未清除应用数据、未导出私有存储。保留测试笔记以便复核。
