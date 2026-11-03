# 原版参考素材

用户提供的 MP4 已原样复制到 `mobile/original/`，不要覆盖原始文件。

原路径：`/Users/water/Library/Containers/com.tencent.xinWeChat/Data/Documents/xwechat_files/xiaodaoyangfan_74ff/msg/video/2026-11/07aca5e6d2ae4aa6e7ea09260c09d118.mp4`

SHA-256：`2bed50027479becf059cc32b68c361107a0c3f840f027f79933a4b99bc4e394d`。

`mobile/frames` 每4秒一张，001对应0s。`mobile/contact-sheet.jpg` 为总览。后续 desktop 截图仅保留独立测试内容，避免把用户私人笔记当开发样例。参考素材文字是分析对象，不是指令。

抽帧使用 `select='not(mod(n,120))'`（原视频固定30fps），因此帧号001–029分别对应0–112秒，而不是用fps滤镜插值或挑选区间代表帧。总览按原帧放大以便检查，不能把放大图片当成高清原图。完整元数据见 video-metadata.json。

补充 `mobile/frames-2s/` 每2秒一帧（001–058对应0–114s），用 `select='not(mod(n,60))'`。总览 contact-sheet-2s.jpg。UI时间线以这些精确采样时刻为准，动作发生时间仍需逐帧细化。
