# Final106 Mac 视频live10有限独核

2026-11-11 Asia/Shanghai（证据日期为2026-11-10 UTC）。**接受首个faststart视频激活、96秒时长、初段推进及一次86.8%后段定位的有限证据；后段推进/明确暂停未验，tail-metadata视频未运行。** 本审只读冻结小型文件与安全ROI，没有UI、设备、构建、导入、Store访问或大原件hash。上一轮live09文档窄复核已完成并保留接受，不重复核包。

清单8项长度/SHA256全部匹配，实际mtime亦与清单一致；清单自身SHA256为`702f3f7b2d1f13c2ae3612fdacbdeb837679090a2f04b213ba7911268eccd417`。独核结果在`artifacts/final106-mac-videos-live10-independent/check.json`。准确106路径/延续PID63791为作者本轮绑定记录，未据此声称独立重新采样进程身份。

持久证据与作者即时事实分别如下：

- `02-faststart-playing.txt`实际保留自有标题、WK原生`Pause`、normalized slider0.631及`Duration: 1 minute, 36 seconds`，支持96秒时长与播放态。初值0及点击激活时序为manifest作者即时事实；0.631×96约60.576秒，与初段推进范围相符。
- 安全01ROI为00:00测试帧；安全02ROI已是01:36、末端slider和播放三角形。后者并非0.631/Pause同一瞬间截图，不能拿其证明暂停态。彩色测试帧实际可见；ROI于15:20生成，原图/AX于14:32/14:41保存，派生时间不能替代采样时间。
- `03-faststart-postseek.txt`只有`[slider: 录音波形进度]`，不含视频后段数值，不能单独作为seek成功证据。`04-faststart-observed.txt`实际保存视频`Play`、normalized0.868、Elapsed1分23秒及Duration1分36秒，支持后段位置已到86.8%。0.868×96=83.328秒，与显示83秒相容；不是90%或精确86.4秒。
- staleID58报invalid、fresh setValue0.9未改变结束值、一次截图坐标点击(2066,1225)以及AX Play55后仍未推进，是manifest/作者动作记录；没有各次独立raw工具转录。无效AX动作不计seek成功；04持久状态与作者所记一次后段点击结果一致，但不扩大成完整逐动作日志证明。
- `06-lock-error.txt`明确标注作者转录工具错误，并非独立导出raw日志。只接受最终指针Play点击(1130,1227)被Mac锁定拒绝、随后停止的有限记录。最后持久确认是此前Play/0.868，锁屏后的播放状态未知；不得称拒绝动作启动了播放，亦不把它判为媒体产品失败。

因此未取得后段继续推进、明确暂停验收或tail-metadata视频导入/播放证据，完整原生媒体矩阵仍开放。不从UI卡片推断受管副本SHA、物理占用、Range/RSS、可听输出质量或全部操作历史。183154878B只是作者记录的557B SVG+86400044B WAV+96754277B MP4原件长度总量，260B链接也是记录值；本审不重新读取受管路径或原件。原FORMAT102、IME原因、麦克风和实体触摸板不据此关闭。作者冻结文件未改，所有UI均保持停止。

## live10最终窄文档复核

2026-11-11 Asia/Shanghai。**接受本次窄文档更新**。只读对比`artifacts/final106-readme-delivery/live10-document-update/`的3份before与record：README仅增加live10有限段，准确限定激活/96秒/初段推进/86.8%定位，后段播放、暂停及tail未验；双方本人正常解锁为续验前提。marker、OFL/来源及其余README内容保持。

Mac manifest仅改`validation`及`documentationUpdatedAt`，原`verifiedAt`和所有包字段保持；新增说明明确锁定错误是作者转录而非独立raw日志，不宣称产品失败或完整原生完成。Android manifest逐字不变。README/Mac/Android当前SHA256分别为`140bfb0b852217b563c24b03723ec859e98c308f81f9d8dff88d68a02e77a60a`、`74a1cc742ed0dc24c611f1aabf415349d1716517911b01ee4d37ab8b3c90b433`、`d2148a4509afd3949efc440b922c1d529fdd75e7faa1c86abad05756f60ae669`，全部匹配record.after。4份状态文档最新首段同样只接受partial并保留双方认证前提、未完成整体目标。未逐历史行扩审，未重hash包、测试、构建或操作UI/设备。停止。
