# 双端重构最终验收

2026-11-11 当前续验：测试机已解锁，不能再以历史锁屏概括当前阻碍。[Android live08/09独核](../../plan/reviews/app-final106-android-live0809-independent.md)接受新建空笔记时实际完整WeType按键与活动输入连接；设置原图已证明页面曾打开，原“设置无响应”结论及候选点击前“截图精确一致”声明均被RGB复算否定，作者已保留旧派生记录并更正，不能据此证明点击目标、场景切换原因或输入法修复；[Android live11独核](../../plan/reviews/app-final106-android-live11-independent.md)接受同PID31424/task1294新空笔记→Back隐藏键盘→正文单击→完整WeType键盘恢复；仅此空笔记链通过，非历史原因修复，格式保持尚未复验。旧102失败保留。[Mac live11独核](../../plan/reviews/app-final106-mac-videos-live11-independent.md)确认faststart定位83.333秒后持续Play/静止，本轮无锁屏错误，后段恢复播放尚未证明；不能沿用live10锁屏原因。[Mac tail live12独核](../../plan/reviews/app-final106-mac-tail-live12-independent.md)接受附件身份及96秒时长的有限记录，后段播放未通过；附件菜单操作后Pause/00:48与83.333秒帧不一致，原因未明。随后数字正文测试前，前台已变为Chrome/task1296；没有输入/切回，格式分支停止，不改变live11已完成结果。当前不构建、不重装、不改输入法设置；保留用户笔记和附件。下方按各报告历史时点读取。

Mac视频最新：[live10有限独核](../../plan/reviews/app-final106-mac-videos-live10-independent.md)接受faststart激活、96秒时长、初段推进及86.8%后段定位；后续播放点击再次被Mac系统锁定拒绝，后段推进/明确暂停与tail-metadata视频未验。全部UI停止；Android同一系统认证前提持续，剩余原生验收须本人正常解锁后继续。没有新构建，整体目标未完成。下方为此前时点。

Mac WAV最新：[live09有限独核](../../plan/reviews/app-final106-mac-wav-live09-independent.md)接受90分钟录音激活、时长、起始推进、作者记录的约91%后段定位及最终结束。AX设置进度无效，后段即时4912.1秒无单独持久AX；01至02相隔18分36秒，不作连续后段采样。以下live08锁定为此前时点；视频仍在分项验收，Android仍需本人正常解锁。

最新Mac续接（[live08有限独核已接受](../../plan/reviews/app-final106-mac-runtime-live08-independent.md)）：准确106重新启动并核实际设置身份；中文SVG经普通chooser导入，列表非空缩略图、画廊完整两行中文、返回同一自有笔记定位选中均已核，不声称列表小缩略图两行完整可读。90分钟WAV导入后，唯一播放点击被Mac系统锁定拒绝，未确认激活或时长/推进/seek；两MP4未导入。已停止UI及completion_summary，等待用户正常解锁。Android也仍为系统keyguard锁定；这两个前提不计为产品功能失败，不补齐原102或完整原生媒体验收。

最新运行前提：Android106安装身份已确认，普通启动后设备仍在系统锁屏。live07于11:21:43 UTC同一次wake/正常上滑后实际显示“使用指纹或画出图案”、焦点Bouncer；未输入任何凭据，所有设备操作已停止，须用户本人正常解锁后继续。报告`artifacts/final106-android-runtime-live07/report.md`。尚未进入设置身份、自有笔记、IME/格式/菜单/旋转/媒体功能测试，不将锁屏视为产品故障。README的04安装状态追加已独核，入口准确不等于完整goal已完成。

当前更新：README唯一入口已发布106并完成[USB因果F1窄复审](../../plan/reviews/app-final106-readme-delivery-f1-independent.md)。Android重连后曾见残留登记但代码目录不存在，随后10:29 UTC唯一保数据安装Success，实际APK摘要匹配106，[03/04独核](../../plan/reviews/app-final106-android-install0304-independent.md)只接受安装身份，不证明原异常原因、完整用户数据或功能通过。media99继续自有笔记最小运行，未完成前不撤销原102失败。追加18项第一方构建脚本缓存已精确清理，逻辑275,855,008B，实际106入口/ZIP/APK前后SHA保持，[清理独核](../../plan/reviews/app-cleanup-own-build-script-20261110-independent.md)接受；磁盘净增只作为同期观察。下方为各历史时点。

原生停止点补充：Mac[有限运行记录已独核](../../plan/reviews/app-final106-mac-runtime-independent.md)，接受设置AX身份和chooser阻碍记录，未补齐附件/媒体运行。父级后续无UI输入观察到主编辑界面、无chooser；另发现两个运行入口，显示名绑定不能重新确认截图PID，准确范围见[父级观察](final106-mac-parent-observation.md)。Android待原Samsung物理重连后先读取实际安装身份；没有继续轮询或盲目重装。本次IME仍为“一次正常点按后键盘出现、历史触发未知”，没有新增产品修复结论。

最新续接：106稳定移动身份/CSS候选26ffffca经9e13a40a独审接受并窄整合，root446输入/74c0a8bb…；[同源双包已独核](../../plan/reviews/app-final106-packages-independent.md)。Mac精确新包已正常启动并核设置身份，附件chooser路径自动化遇阻；Android唯一安装失败后设备缺席、installed状态未知，[停止记录独核](../../plan/reviews/app-final106-android-runtime-independent.md)不判产品缺陷/运行通过，需重连先核身份，README仍未更新。[本次旧v2 IME现场](keyboard-recurrence-20261110.md)及[独核](../../plan/reviews/app-keyboard-recurrence-live02-independent.md)接受初始无当前输入连接/显示请求、一次正文tap后同App/IME服务进程显示完整键盘的有限观察；历史触发未知，非永久修复，也不覆盖上次空窗或原102失败。核包后仅清理6个own .a/.rlib，实际包SHA不变，详见cleanup-mobile106-static-20261110.json；原始证据/原件保留。下方按历史时点读取。

2026-11-10 最新状态：完整目标仍active。final105双包（103/104、445输入、`a5b783239e3a2372a013a50ed73b72d4751d134c5e3285579095edafa91c9bb9`）已通过[独立核包](../../plan/reviews/app-final105-packages-independent.md)，尚无该批原生UI验收或README入口更新。MEDIA105 run3已获[独立接受](../../plan/reviews/app-media105-formal-run3-independent.md)：双方冷暖各500图、新版完整8阶段/50SVG实际HTTP像素/三长媒体播放与90%seek。旧版音频推进断言失败保留，原因未知，不接受整8阶段paired胜出。相同访问算法下，新版冷用时+5.35%、暖用时-10.69%，renderer峰值RSS分别-31.33%/-40.84%，暖rAF p95反而变差；不同几何/路程和单次测量限制明确保留。run1/run2历史失败不改写，正式测量已停止。106横屏身份及CSS修正正在隔离树验证/待独审，原102长按失败和本次IME断连仍未关闭；整合后须重新准确同源出包及运行验收。

当前测试机新增IME故障已单独完成[现场排查与恢复](keyboard-live-20261110.md)及[独立核验](../../plan/reviews/app-keyboard-live-20261110-independent.md)：旧WeType在原生系统输入框也不可见，Samsung同CyberNote进程正常，仅WeType进程重建后首次完整键盘恢复。初始触发未知，后续已换为列表场景，不称永久修复或连续稳定。该现场使用旧v2诊断包，不是final105运行验收。

用户后续再次报告IME不可见，但本轮未能取得原手机现场：初次ADB为空，随后唯一复核只有另一台未授权设备，原Samsung仍缺席。见`artifacts/keyboard-recurrence-20261110/00-connection-unavailable.json`及同目录连接复核记录；本次不能沿用上次WeType原因，也没有执行恢复动作。已观察到的另一边界是Android横屏跨700px切成桌面身份，并通过navigation失效关闭面板，见[复验和源码分析](mobile-format102-restored-ime-case.md)。这不是原r2故障的已证原因；106在真实App中已复现旧实现的mobile→desktop/navigation清面板，JS及CSS修正的作者检查已过、待不同独审。当时磁盘约1.4GiB而暂停新构建和正式测量；其后本任务已限定清理可再生中间产物，外部空间亦回升。run3启动前实测11,152,576,512B且无竞争测试/构建，按原固定预算运行并全部退出后才释放106浏览器检查。随后精确清理1028个任务派生cache PNG约534.82MiB，保全部raw及实际HTTP响应图，见`artifacts/modernization101/cleanup-media105-derived-cache-20261110.json`。

2026-11-09 UTC，验收仍有阻塞。r2已完成独立核包和README本机入口更新，但最终报告独审发现Android正文长按后格式面板消失，原作者核准确动作顺序确认是真实失败，不能只改称证据局限。102窄修与不同代理独审进行中；完整goal保持active。

历史续接阶段：103清单修正及104文字SVG缩略图已源码整合。104由不同代理独审接受（59cbbf74），root17/17精确整合且9组定向检查通过；50冻结原件SHA/文字ROI、独立中文繁体/tspan已通过，外部presentation资源F1修复已复核。其后构建了上述final105双包，完整release lint通过（0 errors/30 warnings/1 hint；保留增量事实）。104在原生UI的实际中文缩略图验证仍待完成，旧99M文本不支持结果保留为历史事实。

## 要求与证据

| 要求 | 产品入口与已接受证据 | 最终整合/实体范围 |
| --- | --- | --- |
| 集中管理正文、格式、速绘、录音、菜单、焦点与输入法 | `src/editor-session/`；SESSION96 独审 ccab6471；真实 App 会话检查及嵌套菜单 Back 回归 | 源码组合通过；Android新建与正文IME、速绘隐藏IME、短录音通过，但格式保持真实失败，见102任务；Mac有限范围与授权超时限制保留 |
| 表格 hover、文字↔表格、行列省略号一次点击菜单 | `src/editor-actions.ts`、`src/TableControls.tsx`、`src/table-pointer-lifecycle.ts`；TABLE95 32aa0d36、TABLE95H 81b7ab83；真实 Editor/保存/历史与丢失 mouseup 因果证据 | 源码及整合回归通过；r2 Mac 实际列标记一次点击直接开菜单，文字往返与受控丢失mouseup边界沿用真实Editor回归，不冒充本次Mac全部复测 |
| 两端相同源码、真实版本/构建时间/最新下载 | `scripts/build-info.mjs`、`scripts/release.mjs`、设置版本信息；DELIVERY97 9e9f764a、生成输出边界 c05fd6ef | [106同源双包](../../plan/reviews/app-final106-packages-independent.md)为446输入/74c0a8bb…，实际入口、内嵌资源及签名已独核；[README最新入口及许可链接](../../plan/reviews/app-final106-readme-delivery-f1-independent.md)已独核。Mac设置AX身份匹配；Android04设备APK SHA匹配但设置UI待解锁验证。保留ad-hoc/Debug签名限制 |
| 分离主组件的领域职责 | `src/navigation/`、`src/editor-menus/`、`src/attachment-operations/`、`src/platform/`及`src/editor-session/`；MODULES98 53a6d4ad；[模块所有权](../../architecture/application-modules.md) | 已整合，真实App会话、画廊、表格组合通过；当前App.tsx为5179行（只读计数），模块具有实际创建/调用/销毁链，行数不单独作为完成证据 |
| 缩略图、可见区域加载、大媒体按需读取与测量 | `src/attachment-media.ts`、`src/attachment-source-pool.ts`、`src/use-attachment-media.ts`、`src-tauri/src/attachment_media/`、`plugins/tauri-plugin-notes-media/`；99A/B/C/UI及104、精确测量工具已独审 | [105 run3独核](../../plan/reviews/app-media105-formal-run3-independent.md)接受双方冷暖各500图、新版50实际SVG缩略图及三长媒体播放/90%seek；仅完整图像阶段可有限比较，暖rAF变差，不称全面性能胜出。测量源为445/a5b…，不是106原生运行。Mac106中文SVG列表/画廊缩略图及返回定位已获live08独核接受；长媒体和Android106仍待实包运行 |
| 共享设计变量、双端独立布局、可配置细节 | `src/interface-details.ts`、`src/design-tokens.css`、`src/design-controls.css`、`src/confirmed-settings.ts`、Preferences；100A 9196b4fd；DESIGN100 F1由3d94416d独审接受 | root12组组合回归已通过；r2 Mac设置打开时原生顶部栏保留，106设置AX身份另已核；[106稳定移动身份/CSS复审](../../plan/reviews/app-android-mobile106-f1-independent.md)接受源码边界，Android原生旋转/IME仍待验，不当作原102根因 |
| 触屏和触摸板双指缩放、移动 | `src/DrawingPanel.tsx`；`scripts/check-drawing-interactions.mjs`，35 项含 Chromium wheel 与 WebKit gesture 事件；[速绘规则](../../ui/drawing-editor.md) | Mac 实窗纵向 scroll 有可区分画布变化；横向本轮网格截图未形成足够证据。Android OS 注入双指后比例由60%至150%，另保存等距平移前后图。均不冒充物理手指或实体触摸板捏合 |

## 性能解释边界

最新正式测量是[MEDIA105 run3](media105-formal-run3.md)及[独立复算](../../plan/reviews/app-media105-formal-run3-independent.md)，不再启动run4。相同500图（450raster+50文字SVG）在双方冷暖各完整覆盖；新版50份实际HTTP PNG与同源renderer参考像素一致，并通过90分钟WAV、两份96秒MP4的激活及90%seek后推进。旧版在音频推进断言失败、原因未知，不能宣称完整八阶段paired胜出。单次完整图像阶段新版冷用时+5.35%、暖用时−10.69%，renderer峰值RSS分别−31.33%/−40.84%，暖rAF p95从16.8ms变为33.4ms；不同几何/路程和单次测量限制保留，不称流畅度全面改善或整个应用RSS。上述为445/a5b…源的Chrome/生产Rust协议，不是当前446/74c0…双端Tauri原生证明。

历史run2证据为[作者报告](media105-formal-run2.md)和[独立复算](../../plan/reviews/app-media105-formal-run2-independent.md)。新版两次完整上下遍历各174步，冷、暖各覆盖450raster+50文字SVG；50个SVG实际HTTP图像与同源生产renderer参考RGBA一致。90分钟WAV及两份96秒MP4均经真实产品激活并完成90%seek；各激活前原件acquire计数为0。暖访问仍有74次生成和900次命中，不能称全缓存命中。缩略图HTTP读取、源逻辑输入、输出PNG和进程RSS分别记录，不合并计成物理IO或整个App内存。旧版500图历史解码完成，但首次下行末端video卡无法通过图片专用settle谓词，cold未完整结束、warm与长媒体未运行；故run2没有完整paired性能收益结论。该协议使用Chrome/生产Rust，不替代Mac/Android Tauri最终包原生运行。

下述为历史99M记录，不能覆盖上述105结果。冻结样本含 103 篇笔记、503 个原件（450 个 raster、50 个文本 SVG、90 分钟 WAV 和两份不同 metadata 位置的 MP4）。前测与后测使用相同原件和 SQLite 快照。测量工具使用实际生产 Rust Store、Session、MediaRuntime、平台派生器以及浏览器直接 HTTP；它不替代最终 Tauri 安装包的系统网络、解码和 RSS 结果。

后测完成全部 10 阶段，长音视频真实按钮播放和 90% seek 成功；5b15ce1d独立审计重新计算双方20phase及全部metrics/IPC配对，接受[正式报告](performance-after.md)记录完整性。但仅 169/450 个 raster 到达后端，50 个文本 SVG 的受限缩略图渲染均不支持，第二轮滚动仍有 70 个新生成。因此内存下降不能表述成覆盖全部图片且等功能的比较。最终开放笔记观察到 6 个租约、0 条流，缺少逐 owner 库存，不能由此断言全部正常或发生泄漏。

## 交付完成条件

1. DESIGN100 与99M独立审查接受，root 组合回归通过。
2. 用同一最终产品指纹生成 Mac 和 Android，保留各自实际前端与 Cargo 嵌入资产，核验真实包入口与最终签名字节。
3. Mac 实窗与本地 ADB 真机运行；只用测试自有笔记，保留用户数据，逐项记录实际操作与未证范围。
4. README 唯一最新入口、平台功能表和交付 manifest 与实际文件一致；清理本轮已终止的中间构建产物，保留原始证据和最终安装包。

完整任务保持 active，直到上述条件完成。当前新增阻塞为[Android格式保持102](../../plan/tasks/app-mobile-format102.md)：准确操作序列与原截图保留，须修复、独审并用新同源包重复原长按路径，不能拿旧r2或源码回归冒充通过。

## 历史原生批次：r2

首批7adb候选因Android release lint拒绝网络XML缺显式属性而失效，保留superseded原始日志。窄修经e521306e独立核验后，r2重新prepare，源码指纹`1c99f39a70e9a00399e40cd8b298b0531929dd9ed518007a44602875bf5efb7f`，437输入。两端release、实际入口、嵌入资源及当前输入指纹均经[独立双包审查](../../plan/reviews/app-final101-package-r2.md)接受。Android实际release lint为No issues found，v2/v3签名和对齐通过；Mac为ad-hoc本地签名，未公证。README已通过本地publish更新至本批，并由独立审查核对唯一入口、实际包摘要和版本时间；未进行远程发布。

两端构建完成且独审取得准确资源来源后，清理已完成的release依赖、构建脚本、Gradle中间件与未签名对齐APK，逻辑体积合计3,020,047,861B。保留签名安装包、实际入口库、各自前端、codegen资产与全部原始验证记录。清理记录见`artifacts/modernization101/cleanup-completed-release-deps-20261109.json`和`cleanup-native-intermediates-r2-20261109.json`，清理后可用约8.3GiB；这是本次追加清理，不重复累计前面的debug清理。
