# Final105 原生运行与入口更新预检

2026-11-10，只读准备。未安装、构建、启动浏览器或操作设备，未改README/功能表；105唯一formal run2正在执行，本清单不抢占运行资源、不预判其结论。包身份/签名/字体与许可已获[独立核包接受](../../plan/reviews/app-final105-packages-independent.md)，无需在runtime阶段重复构建或整套核包。

## 当前差异与未来入口准确值

README及功能表当前仍以r2为“最新”：fp `1c99f39a70e9a003…`，Mac UTC `2026-11-09T14:41:51.600Z`、Android `2026-11-09T14:47:14.179Z`。新包是下表同源候选，尚无该包native UI通过记录，不能先把链接换成“已实测完成”。

| 项目 | Final105准确值 |
| --- | --- |
| Mac应用 | `artifacts/releases/20261110-modernization105/CyberNote.app` |
| Mac ZIP（含许可） | `artifacts/releases/20261110-modernization105/CyberNote-Mac.zip` |
| Android APK | `artifacts/releases/20261110-modernization105/android/CyberNote-Android-arm64.apk` |
| Mac / Android构建UTC | `2026-11-10T01:09:35.707Z` / `2026-11-10T01:18:18.059Z` |
| 版本与revision | `0.1.0` / `bf26dae17f972fc09276deb456b4599e1ebe5d67`，dirty=true |
| 同源fingerprint / inputs | `a5b783239e3a2372a013a50ed73b72d4751d134c5e3285579095edafa91c9bb9` /445 |
| 共用prepare UTC | `2026-11-10T01:08:57.822Z` |
| 签名 | Mac本机ad-hoc、未公证；Android本地Debug证书，与r2同证书，非商店签名 |
| 交付证明 | 同目录`mac.json`、`android.json`、`mac-zip.json`及[构建记录](final105-built-packages.md) |

新源包含103手机Manifest修正、104有界SVG文字/中文字体支持。旧功能表的169/450 raster与文字SVG限制应保留为旧99M测量事实，不能继续当作104新源码的能力描述；也不能把字体嵌入检查或104生产renderer证据写成新包中文UI已通过。新105 formal覆盖/性能结论须等run2独立复算，单列host/Chrome范围，不扩大成双端native基准。

## 待父级runtime gate后的最小执行顺序

1. **串行使用准确包及自有备注。** 等formal测量完全退出再开始。Mac从上表精确app启动；Android先读取现安装包真实SHA/证书/前台，确认未被用户或其他workflow使用后才按另行gate `install-r`，不卸载/清数据。此前IME诊断实际运行v2诊断SHA `42a561bb…`，并非105；IME仅重启WeType后恢复可见，不是产品修改。未来运行前重新读当前现场，不能沿用旧PID/状态。全程只用自有FINAL105备注，不改用户备注、IME/旋转/TCC或同步配置。

   **可先于105安装的102唯一建议case：** 只有新gate当时确证完整WeType键盘实际可见，且既有case未覆盖同一实际前提时，复用仍安装的v2及原自有note，执行一次select→format→文字内800ms hold，仅读既有closure-only日志，不构建新诊断包。如果已没有完整键盘、用户正在编辑、或既有证据已是完全相同前提，就不执行。WeType进程恢复是合理的前提变化，不能直接推断102根因；有/无关闭均保留原r2失败。105生产新包没有该诊断sink，不能把它的普通UI观察称为close-reason追踪通过。
2. **设置版本一次。** 每端打开版本信息，保存实际0.1.0、对应builtAt、完整revision+dirty及a5b783…指纹截图/可访问元数据。身份值与上表不符即停止，不用重命名安装包或旧版本号判断同源。
3. **一份小型中文SVG的真正缩略图。** 自有SVG包含明显中文、Latin及tspan；通过正常附件选择/导入。确认笔记列表/附件画廊实际缩略图文字可见且非空/缺字，不拿原件预览替代；从该附件“在备忘录中显示”返回同一自有备注并定位。每端保存缩略图与定位结果；不再跑500图或无关格式矩阵。104已有受限水平text/tspan及安全拒绝证据，runtime不扩大为完整SVG/CSS/字体支持。
4. **大媒体按用户动作激活及真正后段seek。** 使用现有冻结原件，不重新生成/复制整个715MB样本。只导入下列三个文件到自有备注，经正常文件入口逐个处理；不做超过256MiB的整体备份归档导入。采集播放前静止状态→点击激活→实际播放时间推进→约90%处seek→继续推进的可见证据；停止播放/离开后确认控件状态正常。不要用r2三秒clip证明长文件seek，那里seek原未通过。

   | 现有文件（根目录 `/private/tmp/cybernote-delivery/artifacts/media99-fixture/`） | 有效检查点 |
   | --- | --- |
   | `originals/long-90min.wav`，86,400,044B，5400s | 真实激活/时长，后段约4860s（81:00）seek及继续播放 |
   | `originals/video-faststart.mp4`，96,754,277B，96s | 首帧、播放，后段约86.4s seek及继续播放 |
   | `originals/video-tail-metadata.mp4`，96,754,277B，96s | 尾部moov布局也能首帧、后段seek及继续播放 |

   三文件合计279,908,598B，运行gate时先检查手机/本机空间与正常导入成本；不为凑覆盖把完整媒体转Base64或额外下载。若大文件不足以在该平台稳定播放，准确报失败，不缩小样本冒充通过。UI观察只证明激活、首帧/时间/seek行为；零原件预取、Range读取量、完整进程RSS峰值须另有可归属遥测才可声称。formal host统计不能替代这些native事实。

   空间/副本预检须在gate实际执行：本机`df`与设备`df /data /sdcard`、测试目录存在性、现有受管数据目录可用量；手机至少预留约2×279,908,598B（测试入口副本+受管原件）再加安装与缓存余量，建议实际可用≥2GiB，不足即报回。Mac picker可直接选择冻结原件，无需额外入口副本；Android如需ADB到设备，仅投递3媒体+小SVG到专属`/sdcard/Download/FINAL105-owned-media/`，经真实system chooser选取，记录每个SHA/大小。App随后在实际`app_data_dir()/attachments/<受管相对路径>`产生原件副本，SQLite产生自有note/附件记录，缩略图为`app_cache_dir()/attachment-thumbnails-v1`下派生；用真实收据登记owned IDs/实际路径，不猜opaque文件名。

   生产lib当前直接`Store::open(app.path().app_data_dir())`，未见可用的生产隔离Store开关；performance host的临时Store不是native入口，不新增开关或绕过chooser来隔离。只用自有note/附件限定数据。结束可清的是本轮明确创建的Android投递目录及自有临时小SVG（记录SHA后，不动冻结原件）；App受管副本须通过产品按owned记录删除/清理，不能直接rm用户附件目录或清空全部垃圾箱。若UI无可精确限定的清理路径，保留这些owned记录并列待办；共享派生cache只用现有产品缓存清理能力，不手工挑用户缓存。新包、原始运行证据和冻结500图不在清理范围。
5. **保留现有未通过边界。** 102原Android长按后格式面板关闭尚未解释/修复，诊断不复现不撤销原失败；仅建议上面有实际前提变化的一次case，不穷举长按变体。Mac录音曾授权超时，完成录音后的刷新未核验；实体触摸板捏合未实测，横向scroll视觉证据不充分。无新明确gate及真实成功证据时继续标未测/受限，不改TCC或用自动化wheel冒充实体捏合。

## README/功能表的具体待修改项（本轮不实施）

- 父级运行/发布决定后，用新`mac.json`+`android.json`更新唯一`latest-installers`表到上表准确app/APK路径、UTC、bf26+a5b783…；原r2归入历史，不能保留两个“最新”入口。新manifest的validation仍只陈述已发生范围；新增runtime报告单独链接。
- 紧邻标记区**之外**保留Mac ZIP链接，以及两侧许可/来源链接：`artifacts/releases/20261110-modernization105/notices/noto-cjk/OFL.txt`、同行`README.md`；Android对应`android/notices/noto-cjk/OFL.txt`及同行`README.md`。Mac ZIP已含这些准确说明，Android为分发侧文件而非APK资源；下载处须明确随完整交付目录保留。publish会重写标记区，不能把唯一许可链接放在被覆盖内容内。
- 将当前r2独核链接换为`docs/plan/reviews/app-final105-packages-independent.md`及新runtime记录，同时明确包核验不等于UI通过。签名/未公证限定照实保留，102和Mac录音/物理触摸板限定继续醒目。
- 功能表更新日期与“当前包身份”到Final105；SVG一行区分104源码支持、新包嵌入核验、各端实际缩略图结果。画廊/启动/大媒体一行保留99M历史并新增run2独立结论（若有），不要覆盖原失败或把host数据归入native。无新runtime的其余行继续引用历史范围，不重复跑表格/绘画/字号等已接受源码大组。

本清单是等待gate的执行准备，不构成发布或功能通过声明。
