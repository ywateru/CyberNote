# 80/81 组合独立验证

最终状态：**SOURCE-READY**。产品源码 `ad3a069f8b28f88533d91a7ee3269c992f6f30f9`，122 项 sourceFingerprint `0818145c2f31dc49b58cba93ba30711747e82c405cdb6bc0923b14bc92457ab9`，最终运行前后相同。持久审查报告：`docs/plan/reviews/app-ui-hierarchy8081.md`。

| 检查 | 自然结果 | 完整 wall |
| --- | --- | --- |
| 精准独立组合 DOM 与官方 macOS drag JS 事件链 | exit 0 / 38 checks / pageErrors=0 | 5.309649s |
| 精准 controller（最终文件逐字未变） | exit 0 / 20 tests | 0.202691s |
| 生产 ObjC 隔离 AppKit harness 编译 / 运行 | exit 0 / exit 0 | 1.058441s / 0.606882s |
| 新增真实 Rust 模型测试（default=false / true roundtrip） | exit 0 / 1 passed / 25 filtered | 31.374019s |

两个 controller blocking、首次统计失败隐藏备份入口、保存禁用按钮后 BODY 焦点导致 Escape 无效，均已关闭为 FIXED-VERIFIED。最终流程保留成功后直接 Escape 原失败步骤，并验证错误后 Tab/ShiftTab/Escape、取消后直接 Escape、原字节保存、保护预览层、无 snapshot 恢复入口和真实分类导航。

- `dom-final/result.json` 是最终完整结果，`focused-dom-command.json` 是准确命令及完整退出记录；`run-focused-dom.mjs` 为实际独立驱动，SHA 与 result 对应。
- `dom-final/` 含 source-before/after、3 组 screenshot/HTML文本/snapshot、成功后的 Escape 真实 BODY 焦点诊断；`preservation-map.json` 逐文件校验13份原始临时输出 bytes/SHA。
- `final-source-identity.json` 记录最终冻结文件，逐字映射已通过 native/model 六输入，controller 文件亦与已通过20项准确 SHA 一致，未无谓重跑。
- `native/` 保留真实 AppKit 与 Rust 命令、环境、全日志、输入身份及结果。大 binary 仅在 `artifacts/ui-hierarchy8081/verification-extract/native/`。
- `frozen-static-identity.json` 记录修焦点前的74108461身份及官方 Tauri2.12.5 drag fixture 与本机 Cargo 源码逐字相同。
- `dom-attempt01/02/03/`、对应命令日志及 `run-focused-dom-attempt01/02/03.mjs` 保留真实失败。attempt01 为独立驱动写 `.html` 经已有 symlink 被 Vite watcher 观察而 reload；attempt02/03 为真实焦点问题，未追认为通过。修后实时输出使用临时目录及 `.html.txt`，关闭 runtime 后才归档 docs。

浏览器的 window/dialog IPC、文件系统 inventory 是 synthetic，macOS drag 为准确官方 JS 与生产 React DOM 的事件链；52px chrome 为 CSS 几何模拟。真实 AppKit harness 是独立生产 ObjC/NSWindow/field editor 运行，drag 只覆写计数；两类证据分开。没有完整 WKWebView/Android设备或苹果原版像素通过结论。未启动已安装应用、原版 Notes 或真实麦克风，未触原 Android 未保存录音现场。共享环境均已交还，未 stage/commit。
