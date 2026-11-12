# Final106 Mac 原生 live08 作者记录

2026-11-10。本轮新增**真实中文SVG画廊缩略图和返回备注定位通过的作者证据**；长媒体首次播放前因Mac锁屏停止，非完整native验收。前轮冻结报告不变。原始文件、动作事实与SHA见`artifacts/final106-mac-runtime-live08/evidence-manifest.json`，待不同reviewer有限独核。

## 准确入口与自有数据

fresh只读进程检查无其他CyberNote，初始可用9,959,927,808B；以CUA完整路径启动`artifacts/releases/20261110-modernization106/CyberNote.app`。随后唯一入口PID63791精确指向该包。实际设置AX再次确认0.1.0、`2026-11-10 08:05:59.823 UTC`、revision bf26dae17f97+modified、完整74c0a8bb…指纹；过滤字段保存在`01-identity.txt`。正常关闭设置，继续已有自有`FINAL106-Mac-runtime`，不新建备注、不编辑用户正文。

## SVG普通导入、缩略图及定位

本次系统Open选择器直接恢复在`final106-runtime-fixtures`目录，实际可访问条目URL是批准的`chinese-thumbnail106.svg`。选该行后点击可访问**Open按钮**，未使用前轮失败的GoTo/Return循环。产品出现该图片附件和正常保存状态，备注原标题保留。shared SVG为557B，SHA`88cf9c9c8cda214866de874d07c36de71272a8ef3e33f81e0f9a0fb5398baf7a`。

证据分别保留，不能互相替代：

- `02-list-thumbnail-roi.png`：真正笔记列表的小型非空缩略图，能看到文字笔画与106；小卡有裁切，不声称完整两行文字在列表均可读。原全图为`02-svg-note-and-list-thumbnail.png`，仅限本地审查。
- `03-gallery-thumbnail-roi.png`：真正附件画廊卡片，两行“中文附件 CyberNote”“缩略图验证106”完整清楚，下方文件名、自有备注标题、557B均可见。不是原件预览或正文大图。
- 从画廊点附件选项时旧菜单ID曾失效，fresh AX后直接点击实际所属备注按钮“FINAL106-Mac-runtime 在备忘录中显示”，回到同备注。`04-return-selected-roi.png`显示同标题与图片橙色选中边框，`04-gallery-return.txt`保留过滤AX；证明返回/滚动定位及选中，不把菜单失效称产品功能失败。

## 长媒体范围与硬停止

父级批准后创建3个精确owned symlink普通chooser入口，指向冻结WAV与2个MP4，目标大小/SHA在`media-chooser-entries.json`，没有复制大原件。3个链接路径数据共260B。系统chooser AX显示的是owned symlink路径；其内部是否canonical到真实路径未被观察，不虚构。

通过正常chooser选`long-90min.wav`行并点Open，产品成功在同自有备注出现长音频卡。激活前`05-audio-inactive.png`保存当时状态；真实AX显示播放按钮44、disabled波形slider46值0/0:00及“时长未知”。唯一首次`app.click(44)`返回CUA硬错误：**The Mac is locked and automatic unlock could not unlock it.** 因而没有证据证明点击已触发音频激活，更没有时长加载、时间推进或90%seek通过；不将锁屏当媒体产品失败。立即停止全部UI输入，未重试/解锁/改权限，CUA completion_summary已调用。

两MP4尚未导入，所有视频激活/播放/seek均not run。麦克风/完成录音刷新与实体触摸板未测；原FORMAT102、IME原因和双端native长媒体验收均未关闭。没有新build、诊断包、Store修改或页面脚本。

## 保留与后续清理

本轮产品导入记录为**1个SVG+1个WAV**，原文件合计86,400,601B，受管副本由正常产品导入建立；未查询opaque受管路径/IDs或直接读取Store，不能声称物理磁盘占用精确等于此数。实际WAV画面已出现，未独立核受管副本SHA/磁盘保存完整性。两个原件的导入后SHA与原记录完全一致。3个symlink保留供续验，冻结原件不动；链接以后可精确unlink，受管附件只能通过产品按自有备注精确管理，禁止rm附件目录或全清垃圾箱。

安全ROI省略私人侧栏。完整原生截图仅限本地独核，不公开用户正文；报告不复述其他备注内容。锁屏后无后续UI动作或播放停止尝试，因为播放激活未被确认，不能猜测其状态。本轮到此冻结，等待本人解锁及后续明确gate。
