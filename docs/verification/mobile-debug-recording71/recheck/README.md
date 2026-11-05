# 71 独立复审证据（2026-11-06）

受审最终源码 `330da9f49d1f11f35d0c4a8a975b2139b187f034`。正式CLI开始时tree clean，78输入文件SHA **`7a6d19fe4ab9698378e444c9a29704d6152e765e33995bf2e7c9788f6dfc133b`**，每次start/end一致、pageErrors[]。本目录仅是独立复核证据；原[初审失败](../independent/README.md)没有改写。本次不修改产品/runner/任务状态/根文档。结论 [pass](../../../plan/reviews/app-mobile-debug-recording71-recheck.md)。

| 实际命令 | 结果 | CLI耗时（含启动、cleanup前） | 场景耗时 |
| --- | --- | --- | --- |
| pnpm test:debug --out /private/tmp/mobile71-recheck-desktop01 | 全九组100检查PASS，exit0 | 30.096s | recording6.199s；其余见desktop/suite |
| pnpm debug group recording --mobile --out /private/tmp/mobile71-recheck-recording01 | 42检查PASS，exit0 | 18.570s | 9.072s |
| pnpm debug group notes --mobile --out /private/tmp/mobile71-recheck-notes01 | 9检查PASS，exit0 | 11.789s | 2.325s |
| pnpm build | TypeScript+生产Vite PASS，exit0 | 未采总时 | Vite4.63s |
| pnpm debug check-production --production dist --out /private/tmp/mobile71-recheck-production01 | API缺失、URL不能开启、四类marker匹配0，exit0 | 4.271s | — |
| node scripts/debug/cli.mjs script /private/tmp/mobile71-ownproto.json --out /private/tmp/mobile71-recheck-cli-proto01 | 预期INVALID_ARGUMENT，exit1 | 5.838s | — |
| node /private/tmp/mobile71-recheck-negative.mjs | 15项独立检查PASS，exit0 | 各边界见JSON | 失败/成功retry约295/374ms |
| node /private/tmp/mobile71-recheck-entered.mjs | 明确entered=1的late/never谓词2项PASS，exit0 | 约150/150ms TIMEOUT | 期限150ms |

所有session均轮询确认终态；并行运行的耗时只代表本机本次，不是性能保证。构建保留既存大chunk提示。

[negative-proof](negative-proof.json)独立于作者场景：raw七类无效参数拒绝；late true/never predicate/false实际TIMEOUT；never state transport实际TIMEOUT；正常异步延迟true成功。正文故障后先验证无人retry仍APP_ERROR，再用真实DOM Retry按钮验证saving与旧failed共存时idle不提前完成；再次失败须等工作结束才APP_ERROR，成功重试等实际ACK才通过，附件仍一条、owner按成功/失败释放/保留。

[entered-deadline-proof](entered-deadline-proof.json)补充明确predicate已执行，排除仅state耗时造成的假验证。迟到true predicate延迟350ms，never predicate永不settle，两者均在150ms deadline返回TIMEOUT。共享waiter取消不会取消实际产品操作；finally清理runner deadline，迟到poll经guard结束。

[cli-ownproto-rejected](cli-ownproto-rejected.json)使用初审同一输入 `[{"waitForIdle":{"__proto__":1}}]`。CLI exit1是预期拒绝，无效对象未被传输改写为空对象。probe源码作为txt保留以复现，不是新产品入口。

mobile目录保留本次源码初始/保存失败/保存后的HTML、布局、PNG及media/retry证明。完整其他状态图仍在此前development/fixes目录，身份各自记录；不冒称旧截图来自新commit。首次录音累计5.332792秒、127987帧、256018字节实际可解码；暂停预览及保存重挂载真实播放越过首段，4秒后能量249.93；没有只依据时钟断言文件有效。

Chrome156.0.8078.80，mobile390×844、desktop1280×800，系统/存储边界明确为isolated-js-protocol-fixture，固定440Hz合成媒体，真实App/RecordingPanel/RecordingSession/编码/正文ACK。不操作现有Mac应用、Android模拟器/设备、真实麦克风或用户音频，不安装或编译原生包。生产检查由runner显式注入平台fixture只为启动测试，bundle自身没有debug/fake入口。原版无HTML，截图自比不证明原版像素一致；Rust持久化/Android WebView/系统权限/硬件音质不在本证据范围。
