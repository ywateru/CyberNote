# 71 独审阻塞项修复（2026-11-06）

保留[初审blocked结论](../../../plan/reviews/app-mobile-debug-recording71.md)及两次手机最后保存重试失败。先前37项开发通过没有排除该竞态。本页记录修复后的新源码实际结果，等待再次独审，不改写旧失败或自行把审查标通过。

## 源码与变更

本轮测试base HEAD `0e48868c39b187ae40c20add9a2fcffc1d77daf9`，五个待提交源码文件：`src/App.tsx`、`src/debug/runtime.ts`、`scripts/debug/{runtime,scenarios,mobile-recording}.mjs`。全部正式CLI运行均78个输入文件SHA **`7a6d19fe4ab9698378e444c9a29704d6152e765e33995bf2e7c9788f6dfc133b`**，每次start/end相同，pageErrors为空；测试后仅补文档/复制证据，源码未再改变。因此以下源码指纹可直接与修复提交核对，不把旧HEAD冒称新源码commit。

1. `waitForState`使用覆盖整个poll Promise的真实Node deadline。state和predicate的每个await之后还检查期限，迟到true不能成功，永不settle的state或predicate也由外层deadline返回TIMEOUT；最终清理计时器，迟到poll不再继续读取状态。真实runtime[额外探针](deadline-proof.json)：150ms期限，late-true已进入predicate，150ms返回TIMEOUT；never-predicate已进入，152msTIMEOUT；never-state151msTIMEOUT。它们均不是旧的“Promise真值已完成”。共享contract也新增这三类反例，原恒false和延迟true正例保留。
2. raw `waitForIdle`先JSON.stringify，再以字符串交Playwright并在页面JSON.parse，原API原样验证，own `__proto__`不被serializer吞掉。[显式CLI输入](ownproto.steps.json)现在预期exit1/INVALID_ARGUMENT；[失败捕获](ownproto-failure.json)含准确新源码指纹，[9项负例汇总](negative-summary.json)保留stderr真实错误码。原null/false/0/空串/普通未知字段、TIMEOUT与APP_ERROR负例继续通过。DEV初始启动也复用相同idle helper。
3. idle先等待实际active/busy/saving工作结束，再判断残留failed/error，没有删除或清除失败判断，也不拿pendingDocs当在途工作。App在显式DEV调试模式跟踪整个真实retryAttachments Promise，覆盖正文队列、batch提交及刷新之间的间隙，生产恢复流程保持原handler。手机专用组新增无人重试仍APP_ERROR、延迟重试再次失败、延迟重试成功等五项检查。两次[retry-proof](mobile02/mobile-retry-proof.json)都实测旧failed1与saving1/busytrue共存；再次失败在saving0后APP_ERROR且owner保留；成功仅在实际ACK后pending0/failed0/saving0。全过程通过真实Retry按钮，不调用dismissError，不直接修改DB/会话/失败状态。

另补桌面保存中关闭：真实checkpoint尚在store延迟时canFinish=false，但关闭按钮enabled，命令close仍调用local.close，等checkpoint及最终正文ACK后释放owner。只验证既有行为，未新增录音呈现方式。

## 实际验证

所有列出session均已轮询至终态；耗时来自CLI summary，含启动、cleanup前取样。若干命令并行执行，不能作为性能保证。后续独审/根整合应按最终提交复跑。

| 命令/范围 | 结果 | CLI耗时 | 场景耗时 |
| --- | --- | --- | --- |
| `pnpm test:debug --out /private/tmp/mobile-debug71-fix-desktop01` | 九组**100检查PASS，exit0** | 49.207s | recording9.765s；各组见[desktop/suite](desktop/suite.json) |
| 手机录音第1轮 | **42检查PASS，exit0** | 23.438s | 10.880s |
| 手机录音第2轮（同源码重复，针对初审竞态） | **42检查PASS，exit0** | 24.747s | 10.977s |
| 手机notes | **9检查PASS，exit0** | 16.996s | 2.534s |
| `pnpm build` | TypeScript及生产Vite PASS，exit0 | 未采总时 | Vite6.20s |
| 新dist生产排除 | API缺失、URL不能启用、4类marker匹配0，exit0 | 12.266s | — |
| CLI/raw故障边界 | **9项均预期拒绝，CLI各exit1/code正确** | 逐case留证 | — |
| deadline/raw own字段探针 | 4项预期拒绝，probe exit0表示检查断言通过 | 150/152/151ms及own字段拒绝 | — |

手机42项包括原37项全部检查以及新增5项保存重试边界。两次存储音频都用真实AudioContext解码、实际播放后段。当前浏览器Chrome156.0.8078.80，mobile390×844，desktop1280×800。最新局部初始/保存失败HTML/布局/PNG在mobile02目录；本任务其他状态图及初审失败图保留在原目录，不擅改旧证据身份。

没有操作现有Mac应用、Android设备/模拟器或真实麦克风，没有读取/复制用户音频，没有安装/构建原生包。默认仍JS protocol fixture，未证明Rust持久化、Android WebView/系统权限/硬件音质或原版像素一致。旧committed录音revision仍按Undo契约保留。本任务完整产品目标尚未完成，以上只对应命令验收和这三项已证问题的修复。
