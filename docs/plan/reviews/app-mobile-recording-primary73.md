# 73 初次独审：blocked

2026-11-06。受审冻结源码`0843c54f16ed92ff33535bbe4fa89247e148ab18`，独立树开始clean；baseline3534acaf。产品改动仅17行mobile中央按钮CSS，RecordingView字节未改。未修改产品/runner；只保存独立证据和probe。

## Findings

1. **P2 / blocking — 手机保存卡重挂载验收未等真实媒体准备，进度控件会因src变化消失。** 合同6要求手机recording42实际通过。首次组在22项后exit1，dom入口报`Selector must identify exactly one HTML element`。最小独立因果probe：真实App用合成流录1.5s并保存，fixture设`read`延迟600ms，B→A后API/idle完成时已有title但audio.src仍空；点击title后进度input=1。读附件完成使src变blob，`Editor.tsx:90`的AudioPlayerSession以`key={src}`重挂载，input=0，随后dom.fill精确复现同一UNAVAILABLE。`scripts/debug/mobile-recording.mjs:256`附近在重选A后直接点title/填range，没有等待非空src/metadata准备。应只修runner在点击前有界等待同卡真实媒体就绪，并用延迟read在原suite验证后段播放；不能仅等title存在、重复点、固定sleep、吞掉错误或改产品播放器寿命来让此局部CSS任务过测。证据见remount-proof/probe。

## 验证结果与限制

- 手机notes9 PASS exit0；生产build exit0（Vite4.60s）；fresh production exclusion PASS exit0（1.245s）。
- 手机recording首次22项后失败，exit1，CLI13.636s。前部累计存储字节已真实解码，不能由此替代后续播放/重试通过。
- 桌面九组summary/suite记录100检查PASS、35.976s，但清理阶段进程66895在2分以上观察时仍活着。独立visual进程66856也在2分以上存活未summary，只取得全部mobile样本及after首个desktop样本。按root当时允许有界清理own进程的指令，给两者SIGTERM，工具确认**均exit143**。之后root报告开发同类进程最终自然exit0，所以本报告不把独立的长停留推断为永久泄漏、生产缺陷或必现cleanup失败；本轮终态/六桌面完整隔离证据仍不足，后续修复后须自然完成复跑。原summary不能追认为本轮exit0。
- 部分visual样本的独立Python重算支持三态局部改善：buttonMAE idle31.538→26.036、recording15.924→10.185、paused37.331→10.999；两阈值轮廓IoU均提高/XOR减少。暂停coreMAE36.664→2.664，glyph仍19.870；idle核心和recording glyph没有改善，保留残差。该量化不替代完整visual脚本结束/六桌面验收。
- 原始PNG的raw paused主色255/190/187，Chrome色管canvas读为255/186/183；图片含cICP01010001、cHRM与gAMA，Pillow info不显示cICP。两管线分别记账，不混用raw参考与browser clone计算误差。完整784×1680截图经Chrome高质量全帧drawImage→224×480，无裁图拉伸。
- 首个desktop idle/light样本独立Pillow全图RGBA差0、HTML与全computed相同，其余5态未取得本轮完整前后结果，不扩张为六态通过。

正式CLI均78输入SHA`091afbbd7df88f5da1f8f0b92d54ba7fb99101cc4aaed62c7c82d66629bfad1f`，start/end一致、gitDirty=false，pageErrors[]。视觉脚本的7输入独立指纹因未最终summary，不声称完整freeze证明。所有已启动session已终态（两条143如上），独立remount与color probe均自然exit0。

结论 **blocked**。修复媒体准备等待后按新冻结源码重跑完整命令、六桌面严格隔离和手机触达键盘矩阵；保留本轮失败与143历史，不能用后来成功回写。证据：[mobile-recording-primary73-independent](../../verification/mobile-recording-primary73-independent/README.md)。本轮无设备/原生App/真实mic/用户音频操作，原版全局像素目标仍open。
