---
id: app-mobile-debug-recording71
scope: mobile-command-recording-validation
status: done
depends-on: [app-debug-automation70]
---

# objective

补齐用户要求的手机录音命令驱动验收。沿用任务70真实App/RecordingPanel/RecordingSession/保存队列及隔离合成媒体，建立可重复运行的手机录音组；修复命令能力与真实控件动作不一致、异步错误被误报成功的问题。不是新增录音呈现方式或重设计手机UI。

# context

- docs/testing.md、docs/debugging.md、docs/ui/recording-mobile.md
- docs/ui/recording-desktop.md（桌面侧栏不得退化）
- docs/plan/tasks/app-debug-automation70.md
- src/RecordingPanel.tsx、src/App.tsx、src/debug/
- scripts/debug/{cli,runtime,platform,scenarios}.mjs

# contract

```text
pnpm debug group recording --mobile
  -> real App -> mobile RecordingPanel -> real RecordingSession
  -> synthetic device -> real encoding -> attachment submission -> body ACK
  -> rendered mobile HTML / controls + isolated backend journal checked
```

1. `--mobile group recording`选择专门手机场景，桌面原九组保持覆盖。不要把桌面侧栏断言搬进手机或取消其他手机组的明确限制。
2. `recording.open/action`与实际控件能力一致：手机初始close可取消；采集中close按已有流程收尾保存；手机finish须遵守真正Done按钮条件；禁用动作明确UNAVAILABLE，不能成功noop。桌面同类初始close也应能调用既有local.close取消会话；在途保存按原关闭Promise等待，不能用canFinish误挡关闭。复用真实handler，不修改状态/DB来实现命令。
3. 命令/idle等真实异步完成，申请设备、pause preview、finalizing、附件写入及正文ACK不得提前成功。真实错误要APP_ERROR，并保留可重试会话；失败不能靠app.dismissError假装修复。调试inspection只DEV开关启用，生产无全局/模拟入口。
4. 至少覆盖初始HTML及禁用态、空会话取消、开始、暂停、继续排除暂停时间、暂停预览播放/暂停与seek/skip能力、完成正文ACK、原A归属和单卡、重新打开已保存卡、采集中关闭、设备失败、预览失败重试、延迟附件/正文保存失败及重试去重、资源释放。仅按实际产品行为断言，不能把暂停当桌面checkpoint；媒体必须实际可解码，不用假Blob/仅时钟自证。
5. 保留初始/录制/暂停/失败/保存后紧凑HTML/布局快照与PNG，可与保存的原版录屏标注对照；不以自比截图声称原版像素相同。输出覆盖数、耗时、准确源码身份、失败历史和仍未验证边界。
6. 不操作现有Mac应用、Android设备/模拟器或真实麦克风；不读取/复制真实录音。不安装/构建原生包，不制造全量缓存。默认backend仍明确为JS protocol fixture，不能声称Rust持久化或Android硬件通过。
7. 恢复开发时实测本机Playwright的waitForFunction未等待异步predicate，Promise真值会提前结束等待。统一scripts/debug内异步状态等待须改用真正await条件的共享有界轮询，并以恒false超时及延迟true正例证明等待有效；桌面录音同类等待一并修复。仅修本统一runner，不扩散修改历史验收脚本，不把历史最终断言通过追认为等待机制已验。
8. 独审实证的三项必须关闭：状态轮询deadline覆盖await state/predicate（迟到true不得成功，永不settle也须超时）；raw idle参数通过JSON字符串保留own `__proto__`等字段供原API严格校验；真实重试保存仍在途时，idle等待其终态再判断残留失败，未恢复或再次失败仍必须APP_ERROR，不能删除failed检查或直接清错冒充恢复。

# path

src/RecordingPanel.tsx、src/App.tsx及必要src/debug合同；scripts/debug；docs/debugging.md、docs/testing.md及本任务紧凑证据。若发现产品行为错误先记录证据，修复须保持现有保存所有权/访问/ACK不变量，不放宽校验。

# verification

开发提交后交由另一agent独立复核。类型检查、前端生产构建及入口排除；手机录音/笔记实际组，桌面全九组回归；独立负例证明无效动作、异步错误及延迟确实被观察。根整合后再次完整测试。真实WebView、设备音质与原版像素仍开放。

# delivery

2026-11-06：开发修复330da9f4，独立复审4b0c8cda通过，主工作区整合122e5075后再次通过桌面100、手机录音42、手机notes9、TypeScript/生产构建及生产入口排除。见[最终复审](../reviews/app-mobile-debug-recording71-recheck.md)与[根整合](../../verification/mobile-debug-recording71/integration/README.md)。初审三项阻塞及两次失败历史原样保留。本任务仅命令/DOM/合成媒体验收与已证边界修复完成，完整产品/原生硬件/原版像素目标继续开放。
