# Final106 Mac 视频 live10 作者记录

2026-11-10，接续WAVlive09但另起证据目录，本轮未完成。仅操作既有自有FINAL106-Mac-runtime。精确106 App路径CUA binding，无构建、设备、正文编辑、权限或新样本。

普通chooser直接恢复owned fixtures目录，选择`video-faststart.mp4` symlink准确行、点实际Open。产品出现该视频播放卡，首次点“播放视频 video-faststart.mp4”进入WK原生控件：初值0，随后normalized0.631（约60.6秒）和Pause，总长1分钟36秒。彩色测试帧实际可见；证明首个faststart视频激活和正常初段时间推进。原文件96,754,277B，目标及SHA已在live08 chooser entries冻结。

首次拟AX设进度时ID58因截图刷新已失效，该动作报invalid，不算seek。fresh AX显示视频已经自然到1/96秒、Play；实际再次setValue0.9未改变该值，保留为无效动作，不称成功。按实际截图只点一次波形条约90%位置（2066,1225），AX变0.868、1分钟23秒，证明定位到**86.8%后段**，不是精确86.4秒或90%。

随后AX Play55点击后fresh AX仍为Play、0.868/83秒，未观察到后段推进。最后一次按可见Play位置（1130,1227）点击返回CUA硬错误：**The Mac is locked and automatic unlock could not unlock it. Ask the user to unlock the Mac manually before continuing.** 立即停止，未解锁/重试/权限变化，completion_summary已调用。最后确认控件为Play（暂停态），锁屏后状态未观察；没有把该拒绝动作当作播放开始或产品失败。

证据：`artifacts/final106-mac-videos-live10/evidence-manifest.json`列8文件/SHA/真实mtime；`02-faststart-playing.txt`为先前真实Pause/0.631/Duration过滤AX，截图取样可能晚于该AX，不能声称同一瞬间；`04-faststart-observed.txt`保存实际Play/0.868。`06-lock-error.txt`由作者逐字转录工具返回的错误字符串和停止边界，**不是独立导出的raw工具日志**，文件及manifest明确该来源。ROI只含自有编辑区；全图限本地独核。未伪造短间隔或持续帧监测。

结论范围：faststart首次激活/96秒时长/初段推进、一次后段定位有实际证据；**后段继续推进与明确暂停验收未完成，tail-metadata视频未导入/全部notrun**。不声称视频全部通过、可听输出、Range字节、RSS或物理输入。原102/IME根因、麦克风和实体触摸板不变。

截至本序列受管导入记录为1SVG+1WAV+1faststartMP4，原文件总183,154,878B；未查询opaque IDs/目录或独立核受管字节，不以原件合计代替磁盘物理占用。三owned symlink260B保留，原件不改；受管记录需以后通过产品精确清理，不直接rm附件目录或清全垃圾箱。本轮停止后无其他UI动作。
