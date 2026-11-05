# 手机录音中央控件73：局部视觉校准

状态：产品局部校准与独审发现的命令时序修复已开发并冻结，正式回归及独审复验中。本报告不授予原生设备或整屏逐像素通过。

产品变更仅 `src/RecordingPanel.css` 手机媒体查询中的17行：保留已有1px border与所有DOM/控件外包络，叠加2px inset描边；暂停态改为纸面间隔底色与内缩4px、33%红色的伪元素内芯。无RecordingView标记变化；伪元素pointer-events:none。桌面样式与录音Session、编码、归属/保存、Rust/SQLite均无产品改动。

```text
原图稳定状态                 新版投影相同外包络
初始：灰圈 / 浅间隔 / 红圆    灰圈加厚，原红圆保留
录制：灰圈 / 白底 / 红暂停    灰圈加厚，原暂停字形保留
暂停：红圈 / 浅间隔 / 红内填  红圈加厚 / 纸面间隔 / 33%红内芯
```

## 身份与复验方法

产品/工具初次冻结提交 `0843c54f16ed92ff33535bbe4fa89247e148ab18`；旧CSS取自 `3534acaf1475c241895191d93ec839a5428cfc97`。可重放脚本：`node scripts/check-mobile-recording-primary73.mjs OUT --baseline-ref 3534acaf`。脚本将真实共享RecordingView加载同props，before只替换为该提交原CSS；脚本断言View与baseline同字节，全部输入start/end指纹见visual/summary.json。脚本不替换App私有源码，也不打开媒体、原生应用或设备。

最终565b8a15正式视觉来源为 `/private/tmp/notes-primary73-final-scoped-visual`，已自然exit0；df3的旧扫描437.35s摘要另保留regressions/df3e5c42/visual-summary.json，初次0843摘要另保留diagnostics/initial-visual-summary.json。原文件哈希、View/CSS身份、每态HTML/全部computed/rect/PNG哈希、像素样本、点击/键盘/禁用检验均在[visual/summary.json](visual/summary.json)。全部证据的原字节SHA、gzip解压后SHA见[visual-files.json](visual-files.json)。`.computed.json.gz`是原JSON无损压缩，`gzip -dc FILE`可读；没有截断属性或移除差异。

392×840/DPR2实际渲染完整截图为784×1680，再由同一Chrome canvas high-quality drawImage均匀缩至224×480；不单独移动、缩放或配准按钮。另测320×568、280×600，三态各浅/深色，共18手机样本。桌面280×467同props三态浅/深共6样本。浏览器参数为disable-gpu、force-color-profile=srgb；等待fonts.ready、两帧、运行中的有限动画finished（上限500ms）、两帧。该正式运行无待等待动画，记录不是“已证明前次失败来自transition”。

稳定原图原字节复制为visual/original-idle.png、original-recording.png、original-paused.png，分别来自保全研究n0833/n0870/n0960，不重新采样录屏。原视频已在references/mobile/original保全，SHA256 `2bed50027479becf059cc32b68c361107a0c3f840f027f79933a4b99bc4e394d`，本任务未改动或重新提取。原图SHA如下：

| 原图 | SHA256 |
| --- | --- |
| n0833 | 2bef5009608d2ad4fbc920592385f854ae75a5efd84085d4350f53b66f910b5d |
| n0870 | 4b19b7a3ca1bcf7807df1190e4ac90b7e581acc1d8f8a02000d95dc51ff82d39 |
| n0960 | ed3bb1ace0f95af2721de9d600ca077223f2a5684299fe9b48d5f9b8a606d496 |

PNG含gAMA0.45455与cHRM；Pillow不做色管直接采样n0960 ROI[87,422,101,440)模式(255,190,187)，Chrome默认PNG解码后canvas采样为(255,186,183)。本报告区分raw与浏览器采样，全部MAE与mask均使用同一浏览器管线解码原/旧/新，未混用两种数值。新版ROI模式(255,190,187)，旧版(255,240,239)。这些是压缩源/投影的观测，非原生设计token。

## 定量结果

控件半开ROI：初始[95,415,129,448)，录制/暂停[71,415,154,448)。内芯初始[104,423,120,439)，录制/暂停[87,422,101,440)。MAE为同位置RGB绝对差均值；glyph ROI固定[103,425,122,438)，包含字体/暂停字形，不能当作纯内填测量。

| 状态 | core MAE旧→新 | 完整button MAE旧→新 | glyph MAE旧→新 |
| --- | --- | --- | --- |
| 初始 | 11.328→11.328 | 31.538→26.036 | 11.297→11.297 |
| 录制 | 0.333→0.333 | 15.924→10.185 | 55.328→55.328 |
| 暂停 | 36.664→2.664 | 37.331→10.999 | 45.405→19.870 |

轮廓mask仅位于固定胶囊/圆的±2.5px外缘带，灰色要求channel spread<15且max<threshold；暂停红要求r-g>45、r-b>45、g<threshold-40。mask不将内芯追色冒充外轮廓改善。两阈值完整结果保留：

| 状态 | 阈值 | mask XOR旧→新（越低越好） | IoU旧→新（越高越好） |
| --- | --- | --- | --- |
| 初始 | 210 | 135→95 | .1509→.5343 |
| 初始 | 235 | 123→109 | .4434→.5978 |
| 录制 | 210 | 326→50 | .1911→.8775 |
| 录制 | 235 | 338→150 | .3775→.7283 |
| 暂停 | 210 | 198→124 | .4310→.7033 |
| 暂停 | 235 | 241→176 | .4276→.6386 |

[controls-contact.png](controls-contact.png)将三态原/旧/新全帧投影按同一[65,410,159,454)裁剪并nearest放大3倍，仅便于目视；不是独立量化输入。所有图仍存在残差，特别是初始红圆颜色、压缩/轮廓抗锯齿、暂停字形/字号与继续文本；没有因局部误差下降而宣称像素一致。候选inset1与inset2均测试，选择inset2因为三态button MAE与两阈值IoU总体更好；inset1的初始XOR略低于最终档，未当作所有指标单调最优。

18手机状态所有DOM元素rect与旧版严格相同；按钮完整可触达（至少44×44），中心及15%/85%横向点命中，touch、Enter、Space调用真实View动作出口；合法requesting/saving/playing禁用投影不触发toggle。真正App handler与合成媒体语义由下述命令回归证明。深色PNG实际采样（392×840暂停）外圈255/59/48、间隔28/28/30、内芯102/37/36；三尺寸均断言轮廓对间隔有对比，间隔保留纸面色而非硬编码白色。

6桌面样本原始HTML、全部节点rect、全部computed property均相同，实际PNG RGBA以threshold0比较全0差异。完整图/HTML与gzip computed均保留。此结论只覆盖相同props实际View，与原生Apple Notes的HTML无关（原版没有HTML接口）。

## 回归与清理观察

初次正式冻结0843c54f下所有命令实际运行并自然exit0，未强制退出、signal或杀进程。`regressions/initial-freeze/`保留初次摘要与build日志。build通过（Vite build4.55s，仍有既有>500k chunk提示）。production无API/URL无法打开debug/bundle标记0命中。手机recording42、notes9与桌面九组100均通过、零page error；start/end统一源码指纹 `091afbbd7df88f5da1f8f0b92d54ba7fb99101cc4aaed62c7c82d66629bfad1f`，gitDirty=false、sourceInputsChanged=false。

注意CLI summary的elapsed不包含cleanup。原desktop36.091s写PASS后清理很长；00:59:08.138创建日志，01:02:35.787对其进程sample时仍存活，故整条wall用时大于207.6s。退出的精确wall clock没有预先记录，后续轮询已确认自然exit0，不能把36.091s写成整命令耗时。临时阶段trace重跑全部100组后自然exit0，日志创建01:04:24.611、最后cleanup done01:04:58.533（span33.922s）；context/browser/sockets/vite.watcher/client/ssr/ws/vite/server/backend/临时目录全部成对结束，未复现资源无法释放。诊断代码已撤销，未凭猜测改cleanup语义；[cleanup-stage-probe.log](diagnostics/cleanup-stage-probe.log)保留观测。正式visual在finally完成browser/temp清理后才输出最终日志，日志写入span153.235s并已自然exit0。

最早零CSS改动负控曾在desktop paused dark出现3像素、最大channel delta1，后来的pre-settle候选曾computed hash不同。两次pre-freeze失败摘要保留在diagnostics/，不混入通过结果；后者未保存完整属性差分，不能确认它的具体根因。工具改为fonts与有限动画完成后再采样，正式同props6桌面全等；独审仍须评估稳定性。这些诊断摘要来自当时未提交工具，不替代最终冻结脚本复验。

独审在0843c54f上发现saved-card remount测试时序问题，保留[失败摘要](diagnostics/independent-recording-failure.json)、[稍后失败快照](diagnostics/independent-recording-failure.snapshot.json)、[600ms负例结果](diagnostics/independent-remount-race.json)及[probe源码](diagnostics/independent-remount-probe.mjs)。当时B→A后的App idle只覆盖语义动作；附件read尚未完成，audio.src为空，title已出现。此时展开使input出现；600ms后read返回blob，AudioPlayer key={src}换实例使展开状态重置，input消失，随后dom.fill报UNAVAILABLE。不是简单“title未出现”，也不能靠重复点击绕过。

`df3e5c42f65d72cba155b4a22be499b9bdfbeea6`只修runner：B→A前启用600ms read延迟，在单次title点击前，以10s有界条件等待唯一真实card的blob src/currentSrc相同、HAVE_METADATA、有限duration>4及未展开title；真实媒体error立即抛出，随后清除read延迟。新增readiness check并继续原后段播放。因此最终手机组43项；产品录音语义、AudioPlayer实现及cleanup实现未改。视觉工具禁用playing投影的position也改在1100/2600的合法播放区间，正常三态图不变。初次42通过不能否定独审失败。

## df3e5c42最终冻结回归

下列全部命令以外层 `/usr/bin/time -p` 运行，自然exit0；real包含清理，未强退出。App/CLI78输入start/end SHA256均为 `62cf6dae5bdd04d08c3aa67756950c0cfad068a04752f7f39dd98f2fceb03c44`，gitDirty=false、sourceInputsChanged=false。实际原始摘要/日志见[regressions/df3e5c42/](regressions/df3e5c42/)。该df3视觉七输入指纹见regressions/df3e5c42/visual-summary.json，start/end相同。

| 命令 | 结果 | 含清理real秒 |
| --- | --- | --- |
| pnpm build | 通过 | 6.47 |
| pnpm debug check-production --production dist | API/URL/marker排除通过 | 1.80 |
| pnpm debug group recording --mobile | 43项通过 | 16.96 |
| pnpm debug group notes --mobile | 9项通过 | 4.69 |
| pnpm test:debug | 九组100项通过 | 195.48 |
| node scripts/check-mobile-recording-primary73.mjs OUT | 24样本、6桌面严格0diff、18手机动作/深色断言通过 | 437.35 |

600ms read正例真正等待742.020ms后才获得src===currentSrc、readyState4、duration5.226208s，随后单次展开、设置4s、真实播放后段均通过。见[mobile-remount-readiness.json](regressions/df3e5c42/mobile-remount-readiness.json)。整个手机组保留错误/存储重试与延迟ACK；没有用重试DOM点击掩盖remount竞态。

长清理为可复现性能残差，非永久无法释放。只读Vite6源码显示默认optimizeDeps在无entries时会glob历史HTML，close等待discover/scan/optimizer取消；本树含大量研究/验收HTML。最小诊断只显式entries=['src/RecordingView.tsx']时38.31s自然exit1：虚拟JSX bootstrap的react-dom/client未被覆盖，运行时新增依赖优化导致reload，首态mount失效。保留[失败日志](diagnostics/entries-probe.log)、[失败摘要](diagnostics/entries-probe-summary.json)。第二探针补include=['react-dom/client']后，同一24态、相同全computed/geometry/PNG断言自然exit0、real35.47s；[日志](diagnostics/entries-probe02.log)/[摘要](diagnostics/entries-probe02-summary.json)/[诊断源码](diagnostics/entries-probe.mjs)记录精确参数与自身指纹。此结果支持将后续校准脚本的依赖扫描限定为实际View与虚拟入口bootstrap依赖；没有改runtime cleanup或产品依赖。

## 565b8a15限定扫描正式复验

`565b8a154b16f28727f6ba83e6510d311c8f7aea`只给校准脚本createViteServer配置明确`optimizeDeps.entries=['src/RecordingView.tsx']`、`include=['react-dom/client']`，并在summary记录配置/理由。没有改产品依赖、runtime或App/debug78输入；[app-inputs-unchanged.json](regressions/565b8a15/app-inputs-unchanged.json)重算同一78文件SHA仍为62cf6dae…，且相对已完整回归的df3这些路径差异为0，因此不重复不相关App全组。

提交后独立新cache正式visual-only复验自然exit0，外层real **51.16s**（user33.18/sys23.21），[原始日志](regressions/565b8a15/visual.log)保留。七输入start/end指纹同为 `105edc90f2f4f8b64010ed36f6372430a8f9958b48eead929106d63332ce9f78`。最终24样本与18手机触达/动作/深色断言通过；6桌面HTML、所有rect/computed及PNG RGBA严格0diff。三态原/旧/新ROI统计与437.35s旧扫描正式结果逐字段完全相同，故上方表格无需改值。完整最终结果与像素/DOM/无损computed都在visual/。

本次完整校准437.35→51.16s，诊断第二轮35.47s；不同运行仍有wall波动，不承诺固定时间。初次错误entry漏虚拟renderer导致reload的失败同样保留。CLI runtime仍有195.48s长清理性能残差，交后续测试效率任务调查，不混入本次已证明的校准脚本扫描范围修复。

## 范围与限制

Mock只代替设备/IPC：42项命令仍走真实App handler、RecordingPcm累计、保存body ACK、真实浏览器音频解码与后段播放。Rust Store、OS/TCC、原生close/quit、真实麦克风和原设备没有由此证明。原Android约13秒未保存现场不动；不调用ADB、不安装、不打开原生Mac应用、不录制/复制用户音频。听写/转写、iCloud与整体像素目标仍不属于本次通过结论。
