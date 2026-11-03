# FIX04 独立有限主路径证据

日期：2026-11-03。冻结 f3071f3，安装 APK d5c6f59b79031d1e103f418450e6cbd9d7fa8e8fc085263fab3d23d6b3e04d21。独立报告：`docs/plan/reviews/app-001-fix-04-01.md`。

- 身份：source-verification.json（80 git + 11 本地生成输入）、preserved-apk.json、installed-dependency-verification.json、installed-apk-final.json；冻结 Editor/PM 摘录保留原始字节。
- 动作：native-actions.jsonl 为 collector 原生动作时间与参数；响应不在该日志内。真正冷启动响应保留 cold-lifecycle.json，恢复动作与响应保留 restoration-actions.json。collector.mjs 仅从冻结工具改端口为9239；passive-observer.js 原样复用，未开启 Debugger。
- 真空段落：empty-paragraph-before；长停留 empty-long-marked/idle/committed；快候选 empty-fast-before/marked/committed。marked→idle 73.5297 秒，快候选快照到提交0.4972秒。
- 正文中部：middle-ready 是清洁基线；middle-before 是较早的 LatinIME 仍 composing 快照。middle-long-marked/idle/committed，marked→idle77.7964秒。
- 取消与混输：cancel-marked/after-delete；mixed-chinese-marked/committed、mixed-ascii-mode、mixed-committed、before-cold。
- 冷启动：cold-lifecycle、cold-start、cold-target-row、cold-opened；完整 JSON 相等且 probeAbsent=true。不是浏览器演示或证明面板。
- 恢复：original-input-settings、trime-before-restore、trime-restore-dialog、trime-restored-disable 的 XML/PNG，restored-input-settings、restoration-actions；四项系统设置精确恢复本轮起点，真实 UI 恢复 Disable。forward9239清理动作在日志末尾。
- finite-assertions.json 保存本轮完整 JSON/预编辑身份/时长/设置/安装不变断言；SHA256SUMS.txt 为此目录除其自身外的文件哈希。

本轮有限主路径通过，已知格式/后台残留及**第二次打开选择 grid-large 后**选区31..35→1..1失败仅继承开发记录；取消纸张在两包均保留选区。本目录不表示完整 FIX04 或像素通过，没有全程录屏，没有读取原生 marked range，也没有 Mac GUI 操作。早期错误 Trime Activity、未先启用就 ime set 等失败尝试保留原始日志，不算通过。
