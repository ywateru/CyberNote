# 录音主控件73主工作区整合

2026-11-06，结论 **PASS（本任务源码与浏览器范围）**。开发最终提交f7d18b79，独立复审最终提交920827f4；主工作区产品合入4d98704c，复核文档合入8f47a65c。全部命令在4d98704c实际执行至自然exit0，随后8f47a65c仅合入审查与证据，产品及runner输入diff为空。未用summary代替进程结束，未signal/强制退出这些根验收进程。

| 根实际命令（均由`/usr/bin/time -p`包裹） | 检查 | 含清理wall | 最终退出 |
| --- | ---: | ---: | ---: |
| `pnpm test:debug --out /private/tmp/notes-primary73-root-integration/desktop` | 桌面九组100 | 49.87s | 0 |
| `pnpm debug group recording --mobile --out /private/tmp/notes-primary73-root-integration/mobile` | 手机录音43 | 14.23s | 0 |
| `pnpm debug group notes --mobile --out /private/tmp/notes-primary73-root-integration/notes` | 手机笔记9 | 4.48s | 0 |
| `pnpm build` | TypeScript及生产构建 | 5.11s | 0 |
| `pnpm debug check-production --production dist --out /private/tmp/notes-primary73-root-integration/production` | API/URL/bundle排除 | 4.99s | 0 |
| `node scripts/check-mobile-recording-primary73.mjs /private/tmp/notes-primary73-root-integration/visual` | before/after各18手机+6桌面 | 50.17s | 0 |

根命令分批并行执行，上述单条时间不能相加当整体耗时，也不是后续性能保证。桌面CLI内计时24.425s，最终wall49.87s，说明清理仍有额外开销；不把CLI runtime长清理残差写成已修。完整命令、退出证明、开始/结束身份及指标见[result.json](result.json)，原始日志同目录保留，build既有大chunk提示也保留。

全部App/CLI的78输入指纹为`62cf6dae5bdd04d08c3aa67756950c0cfad068a04752f7f39dd98f2fceb03c44`，gitDirty=false、start/end一致、pageErrors=[]。视觉七输入为`105edc90f2f4f8b64010ed36f6372430a8f9958b48eead929106d63332ce9f78`，start/end一致、errors=[]，与最终开发/独审相同。原报告、首轮blocked、22项后的失败、独审初轮SIGTERM143及后续自然通过均保留，不能追认为首次通过。

手机保存卡读取延迟600ms时，根实际等待708.879ms，观察同一HTMLAudioElement的src/currentSrc相同、readyState4、duration5.221583s、尚未展开，才单次展开并跳转后段播放。[就绪证明](mobile-remount-readiness.json)和[合成音频证明](mobile-media-proof.json)保留。修改的是测试等待门，产品AudioPlayer/Session/保存逻辑没有改变。

根视觉量化与最终开发报告逐字段精确一致：暂停内芯MAE36.664→2.664；完整按钮初始31.538→26.036、录制15.924→10.185、暂停37.331→10.999，两阈值外圈IoU/XOR均改善。六桌面同props浅深样本的HTML、rect、全部computed属性与PNG严格无差；手机三尺寸/两主题/三态触达及几何保持。根[完整暂停样本](root-mobile-paused-392x840-light.png)和[224×480投影](root-projection-paused.png)保留。完整原/旧/新图见[开发证据](../README.md)，独立重算见[独审](../../../plan/reviews/app-mobile-recording-primary73-efficiency-recheck.md)。

原图是有损录屏，raw PNG与浏览器色管读取分开记账；未修的红色/暂停字形、抗锯齿与全局UI残差保留。这里只授予中央按钮局部改善。24状态是实际共享View的受控合法投影；152项App检查仍使用显式合成硬件和JS协议fixture，不证明Rust真实持久化、Android WebView/IME、系统生命周期、硬件音质或完整原版像素一致。没有操作原设备、麦克风、用户录音或原版笔记，没有生成原生新包。下一项[真实Rust录音落盘74](../../../plan/tasks/app-debug-recording-rust74.md)继续补存储边界。

收尾：确认开发和独审最终提交均已为主线祖先后，删除本轮73两个隔离工作区及已合入分支；随其清除工作区dist和TypeScript中间文件；runner的临时Vite缓存由正常cleanup释放。主工作区共享node_modules/.pnpm仍存在，根dist为本轮已验的有用生产构建保留；原始参考、已提交证据、其他历史工作区与Rust共享缓存未清理。六条根命令原始.log显式纳入版本管理，避免被全局忽略规则遗漏；完整根临时输出仍在`/private/tmp/notes-primary73-root-integration`供按需复核。
