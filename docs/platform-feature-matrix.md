# Mac / Android 功能对应表

2026-11-11 当前续验：测试机已解锁，不能再以历史锁屏概括当前阻碍。[Android live08/09独核](plan/reviews/app-final106-android-live0809-independent.md)接受新建空笔记时实际完整WeType按键与活动输入连接；设置原图已证明页面曾打开，原“设置无响应”结论及候选点击前“截图精确一致”声明均被RGB复算否定，作者已保留旧派生记录并更正，不能据此证明点击目标、场景切换原因或输入法修复；[Android live11独核](plan/reviews/app-final106-android-live11-independent.md)接受同PID31424/task1294新空笔记→Back隐藏键盘→正文单击→完整WeType键盘恢复；仅此空笔记链通过，非历史原因修复，格式保持尚未复验。旧102失败保留。[Mac live11独核](plan/reviews/app-final106-mac-videos-live11-independent.md)确认faststart定位83.333秒后持续Play/静止，本轮无锁屏错误，后段恢复播放尚未证明；不能沿用live10锁屏原因。[Mac tail live12独核](plan/reviews/app-final106-mac-tail-live12-independent.md)接受附件身份及96秒时长的有限记录，后段播放未通过；附件菜单操作后Pause/00:48与83.333秒帧不一致，原因未明。随后数字正文测试前，前台已变为Chrome/task1296；没有输入/切回，格式分支停止，不改变live11已完成结果。当前不构建、不重装、不改输入法设置；保留用户笔记和附件。下方按各报告历史时点读取。

Mac视频最新：[live10有限独核](plan/reviews/app-final106-mac-videos-live10-independent.md)接受faststart激活、96秒时长、初段推进及86.8%后段定位；后续播放点击再次被Mac系统锁定拒绝，后段推进/明确暂停与tail-metadata视频未验。全部UI停止；Android同一系统认证前提持续，剩余原生验收须本人正常解锁后继续。没有新构建，整体目标未完成。下方为此前时点。

Mac WAV最新：[live09有限独核](plan/reviews/app-final106-mac-wav-live09-independent.md)接受90分钟录音激活、时长、起始推进、作者记录的约91%后段定位及最终结束。AX设置进度无效，后段即时4912.1秒无单独持久AX；01至02相隔18分36秒，不作连续后段采样。以下live08锁定为此前时点；视频仍在分项验收，Android仍需本人正常解锁。

最新设备证据以[Mac live08有限独核](plan/reviews/app-final106-mac-runtime-live08-independent.md)为准：准确106设置身份、中文SVG列表非空缩略图、画廊完整中文与返回所属笔记定位选中已接受。WAV仅导入，播放动作被系统锁定拒绝，时长/推进/seek与两MP4未验；Android106安装身份已核，但仍须本人正常解锁后验证设置UI、IME、格式与媒体。下方“chooser阻碍未执行”和“原生中文缩略图未测”仅适用于较早记录，不代表live08后的当前范围。完整原生验收仍开放。

更新于 2026-11-10。本表描述当前产品源码与已知平台差异；源码实现不等于所有历史安装包具备该能力。README唯一最新入口已更新106，经过[交付F1独立复审](plan/reviews/app-final106-readme-delivery-f1-independent.md)。106稳定Android移动布局已源码整合（446输入/74c0a8bb…），[同源双包已独立核包](plan/reviews/app-final106-packages-independent.md)。[Mac作者有限运行记录](verification/modernization101/final106-mac-runtime-author.md)确认准确启动及设置身份，附件验收因chooser自动化阻碍未执行；[父级后续观察](verification/modernization101/final106-mac-parent-observation.md)另行记录。原Samsung重连后曾发现代码目录缺失，10:29 UTC一次保数据修复安装已成功，设备实际APK摘要匹配106，[安装证据已独核](plan/reviews/app-final106-android-install0304-independent.md)；只确认安装身份，功能仍须分项运行，旧异常原因未知。历史[r2 Mac记录](verification/modernization101/macos-r2.md)与105测量各自保留，[最终验收](verification/modernization101/final-audit.md)仍开放。

| 功能 | Mac | Android | 当前验证与差异 |
| --- | --- | --- | --- |
| 正文、标签、清单、表格、Undo/Redo、本地持久化 | Tiptap + Rust | 同一文档模型 + Rust | 表格95文字转换、往返、一步菜单与保存已源码整合并复审；r2 Mac 实际列标记一次点击直接开菜单，悬停丢失mouseup的因果证据来自受控真实Editor回归 |
| 主导航 | 三栏/列表或画廊、原生顶部工具栏 | 快速双列画廊、单页编辑、底部工具栏 | 桌面与手机保留独立布局；不强求控件位置一致 |
| 格式 | 原生/网页格式菜单 | 目标为常驻格式面板，文字选区后继续设定 | r2实际失败：07面板打开后仅长按正文，08选字成功但面板消失，排除主动关闭；原通过结论已撤回，102窄修进行中 |
| 输入法与窗口变化 | 按桌面焦点策略 | 原生IME桥与视图避让 | 上一次WeType在系统原生空输入框亦不显示，进程重建后恢复；本次重新连机后初始无当前输入连接/显示请求，唯一正文tap即正常显示，同App/IME服务进程未重启，[有限现场独核通过](plan/reviews/app-keyboard-recurrence-live02-independent.md)，历史触发仍未知。106已源码修正Android横屏跨700px误切桌面身份，待新包原生旋转/IME验收；不能当原102原因 |
| 速绘 | 单击编辑、右键菜单、触摸板平移/捏合 | 单击编辑、长按菜单、触屏双指缩放平移 | 35项自动化；r2 Mac 原生纵向scroll有画布变化，横向视觉证据不充分，实体捏合未实测；Android OS注入双指缩放60%→150%，不冒充物理手指 |
| 录音/已保存录音播放 | 非模态录音栏；正文可播放 | 移动录音界面；正文常驻波形 | r2 Android 实际4秒录音停止、保存、播放通过。Mac WAV播放通过，但实际采集遇麦克风授权超时，完成刷新未核验；原完整App保存路径回归仍独立保留 |
| 附件文件、剪贴板图片与 SVG | 受管文件、Finder/系统打开 | 受管文件、系统选择/导出 | 原文件独立保存；平台剪贴板权限有差异 |
| 附件画廊与定位笔记 | 图片/视频、音频、文稿画廊 | 共享画廊能力/自适应布局 | 99A/B/C/UI及104文字SVG已整合。r2 Mac五种小附件/播放/画廊定位通过；final105包内资源已核，原生中文缩略图未测。[105 run3独审](plan/reviews/app-media105-formal-run3-independent.md)接受双方冷暖各500图、新版50文字SVG及长媒体播放/seek；旧版录音推进失败，完整图像阶段可有限比较但暖rAF变差，不支持整协议或全面性能胜出；Chrome/Rust测量不等于原生大样本基准。旧99M的169/450与SVG限制保留为历史记录 |
| 预览 | 可拖动非模态预览 | 移动预览布局 | Mac可继续操作主界面，移动无需模仿桌面浮窗 |
| 设置/外观/字号 | 五分类侧栏、主题卡片/分段字号 | 分组首页与子页、原生选择框 | 100A及100全局控件/确认设置owner已独审整合；真实SQLite+App14、独立6、chosen表格16及真实箭头4通过；r2 Mac 设置打开时原生顶部栏保留，运行版本信息准确 |
| 版本/构建时间/源码标识 | 设置 → 外观与字号 → 版本信息 | 相同入口 | final106双包0.1.0、446输入、产品指纹74c0a8bb…，共享prepare UTC 2026-11-10T08:05:15.754Z，实际入口/生产JS/签名字节已独审；Mac built08:05:59.823Z、Android08:23:18.611Z。Mac作者设置身份匹配；Android04修复安装后实际APK摘要与106一致，设置UI与功能验收尚未完成 |
| 数据空间与备份 | Rust占用采样、导出/导入、数据目录 | 相同存储能力，系统文档提供器 | 导出位置与系统提供器不同；备份期间保留录音/保存屏障 |
| Apple 备忘录复制导入 | macOS只读系统源导入 | 不提供系统 Notes 访问 | 平台专属，不能在手机伪造入口 |
| 设备同步 | LAN/ws/wss 配对同步 | 同一协议与受管原文件 | 历史SYNC91有实包证据；本次未重新配对或更改用户同步目的地，不把历史结果追认为r2全网络回归 |
| 启动Logo加载 | SVG动画，编辑器/工具栏就绪后交接 | 共享启动组件 | 99M有冻结样本启动/内存/滚动记录，含覆盖边界；r2 Mac另有准确原生入口RSS三个稀疏点，不含无法归属的WebKit，不能当完整应用峰值或原生大样本基准 |

最终更新规则：每次同源交付必须核对本表与两个包内功能及测试证据，明确“源码就绪 / 包内核验 / 设备运行”三个层级。没有相应设备证据时保留限定，不用绿色单元测试覆盖结论。
