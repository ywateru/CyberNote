# 71 独立复审：pass

2026-11-06。受审源码 `330da9f49d1f11f35d0c4a8a975b2139b187f034`，开发已停止、正式运行开始时tree clean。按主仓库权威任务合同1–8复核。独立agent未修改产品/runner实现，未使用作者旧运行替代最终提交复跑。原[初审blocked报告](app-mobile-debug-recording71.md)及失败证据完整保留，其结论针对旧源码62e5ed25；本报告给出修复后的最终判断。

## Findings 与阻塞关闭

没有发现本任务范围内新的blocking finding。初审三项均关闭：

1. **真实保存重试与旧失败并存：closed。** `src/App.tsx`仅在DEV显式debug模式跟踪真实`retryAttachments`完整Promise，正文/附件/刷新仍调用原handler；`src/debug/runtime.ts`先等实际active/busy/saving终态再查残留failed/error，没有删除失败检查，也没有预先清失败记录。独立探针使用真实DOM按钮，保存延迟260ms：期间failed1/saving1/busytrue且idle尚未settle；再次失败约295ms后APP_ERROR、saving0/failed1、owner保留；下一次成功约374ms后ACK、pending0/failed0/saving0、owner释放且附件仍1。无人重试时APP_ERROR仍保留。正式手机组42项全部通过。
2. **等待deadline覆盖await：closed。** `scripts/debug/runtime.mjs`真实Node deadline与poll Promise竞速，每个await后guard，finally清理deadline并阻止迟到poll继续。独立实际runtime探针明确记录predicate已进入：350ms后true与永不settle两种predicate均在约150ms以TIMEOUT返回；另一探针75ms期限下false/late/never全部TIMEOUT，永不settle的state transport约60msTIMEOUT。正常异步延迟true约71ms成功；未把Promise真值当完成。取消等待不强行取消底层原操作，保留真实产品生命周期。
3. **raw idle own字段严格校验：closed。** helper以JSON字符串跨Playwright传输，在页内parse后复用原API校验。独立raw null/false/0/空串/普通未知字段/own __proto__/own constructor七项均INVALID_ARGUMENT。与初审完全同一CLI脚本 `[{"waitForIdle":{"__proto__":1}}]` 现在正确exit1/INVALID_ARGUMENT；完整错误捕获含精确源码指纹，未成功noop。初始化也已复用相同idle envelope。

## Gates

| Gate | 结果 | 实际证据与界限 |
| --- | --- | --- |
| 动作与真实HTML能力一致 | pass | 手机idle取消、active禁用Done/playback、paused播放/seek/skip/继续，active close保存实际通过；桌面idle close与checkpoint保存中canFinish=false但close可用且等待最终ACK均实测。 |
| 手机完整录音/异常/重试 | pass | 最终源码42项、exit0、pageErrors[]；设备拒绝、play失败重试、附件失败重试、正文失败无人重试/再次失败/成功ACK与去重覆盖。 |
| 累计媒体真实解码及后段播放 | pass（Chrome合成媒体） | 256018字节WAV、127987帧/24kHz、5.332792秒、RMS0.08839、4秒后能量249.93；暂停预览及重挂载已保存卡实际播放>4.1秒，原A单卡且B不变。非真实设备音质结论。 |
| 共享等待与严格输入 | pass | 独立15项及entered谓词两项；正式desktop contract同时新增反例；CLI own字段按预期拒绝。 |
| 桌面完整九组回归 | pass | 100项、exit0、pageErrors[]；含真实A录音/B编辑、暂停checkpoint累计、保存中close、模拟native close/quit及重试。OS事件为fixture。 |
| 手机notes回归 | pass | 9项、exit0、pageErrors[]；真实编辑器/保存/锁定UI等，后端仍JS fixture。 |
| TypeScript/生产构建/入口排除 | pass | pnpm build exit0；fresh dist check-production exit0、API缺失/URL不可启用/四类marker匹配0。保留既存大chunk提示，未编译原生。 |
| 证据身份/历史/访问边界 | pass | 所有CLI 78输入SHA `7a6d19fe4ab9698378e444c9a29704d6152e765e33995bf2e7c9788f6dfc133b`，start/end一致、gitDirty=false；初审失败保留。无现有设备/原生应用/真实mic/用户录音操作。 |

实际耗时、完整summary、suite、media/retry proof及独立probe见 [recheck证据](../../verification/mobile-debug-recording71/recheck/README.md)。

结论 **pass（任务71限定的命令/DOM/合成媒体验收与三项修复）**。仍须root整合后全量回归；不将此结论扩大成Android WebView、Rust Store持久化、原生系统关闭、硬件音质或苹果原版像素级一致通过。完整Mac/Android产品目标继续开放。
