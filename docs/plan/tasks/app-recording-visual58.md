---
id: app-recording-visual58
scope: Mac recording pane and shared timeline geometry against preserved references
status: source-ready-native-pending
depends-on: [app-recording-presentation55, app-recording-playback56, app-mobile-recording-save57]
---

## objective

根整合：源8a305475合入为c42fa85，作者证据569de683合入为c27f1c7，不同作者独审5c0147a8合入为2c3193a。五个变更输入、六个受保护文件和45条独立证据在根树重新核哈希一致。独审结论SOURCE-READY / PIXEL-OPEN；详见docs/verification/recording-visual58-independent/review-final.md。58现已允许作为59依赖；原生包、真实采集中双模式及整体像素仍待验，不追认现有Mac16/Android11包包含58。

推进完整原版UI目标：修正当前录音栏与已保存原图直接可证的时间轴、标题/播放/底部行几何和图形差异。优先完成原图同尺寸的Mac右栏，手机共享时间轴按原视频帧核比例，不把已有功能/构建通过当像素通过。保持录音时Notes其他功能可用、浮窗/右栏切换连续、原A保存归属和无听写。

## context

阅读docs/INDEX.md、docs/ui/recording-desktop.md、docs/ui/recording-mobile.md、docs/research/audio-interaction-readiness49/reference-layout.md、docs/verification/recording-presentation55/README.md。主线基线f1fe20f，55/56/57源码均已独审合入。Mac16实际采集中双模式受系统授权无返回阻塞；Android旧13秒File未保存、保全待答复，禁止触碰原设备、GUI、麦克风、TCC或数据。

原桌面PNG为references/desktop/recording-20261105/user-recording-sidebar.png，2672x1246。参考右栏约x1999..2558，内容自y164..1098；以原比例裁剪与明示的2倍工程对照渲染280x467逻辑尺寸，不宣称原图DPR已独立证明。手机frame-n0960.png为224x480有损源，属于暂停外观；除同一状态/区域外不得直接作差。

已直接观察：原桌面相邻秒刻度约200图像px/560栏宽，而现代码40CSSpx每秒/280栏宽；手机相邻秒约57图像px/224栏宽。需实测冻结原图坐标与允许不确定度，再统一绘制和seek映射所用尺度。不能只放大标签而保留采样/拖动旧尺度。原图无当前横贯波形中央的明显灰粗线，需核来源后在录音作用域内消除。

## path

允许src/RecordingPanel.css、src/RecordingView.tsx、src/recording-waveform.tsx及必要的局部图标/纯几何helper；验证使用scripts/check-recording-visual58.mjs及docs/verification/recording-visual58/。必要时局部兼容现有recording检查的可见尺度假设，必须保留旧断言的实际行为目的及所有失败，不篡改旧证据。禁止改录音Session、owner/transport/protocol、存储/附件ACK、权限、native签名或通用编辑器/全局主题样式。超范围先报告具体依赖。

## visual contract

结构沿现有桌面规范，只校准已证外观，不添加新交互。原图同尺寸对照中：标题左对齐、副行真实日期/总时长、顶部⋯/×圆形控件、整宽波形与黄色中线、秒/小刻度、大计时、等距±15/播放、底部胶囊与金色完成圆需报告参考/旧/新坐标与误差。左下转写功能按用户排除，保留布局空位，不放假按钮。实际音频波形幅值、日期/计时、不可复原字形、原生材质等差异必须显式列为动态或未达标，不能整块遮罩内容提高分数。

使用相同暂停/试听可用性状态对照；原图灰继续按钮只可在playing/pending等真实不可继续状态复现，不能改产品状态机来刷图。可以通过受控props渲染真实共享RecordingView，此类截图只证明视图，不证明Mac采集。浮窗和右栏共用样式，小高度/280与320宽、深色及错误/忙碌/初始状态不得重叠/裁断关键控制；手机现有sheet区位保持，时间轴按原帧比例校准。

时间轴采样、主/小刻度和指针定位采用一致尺度，键盘/鼠标/触摸仍请求真实seek，不预测成功，不伪造样本。保持真实媒体确认、同一会话和同File保存规则。

## verification

作者固定源码后由不同agent独验。使用现有依赖和实际共享组件，同尺寸原图/旧/新三方输出原比例裁剪、叠图/差异图、命名ROI坐标、变化像素占比及通道误差，披露动态/排除区域。图像不人为拉伸对齐；记录像素/逻辑尺寸与浏览器渲染边界。至少证明时间轴间距、可见几何改善，并用实际指针/键盘动作检查绘制与seek同尺度；不以DOM断言代替图像。手机同原比例缩小仅可比较几何/粗色，保留有损源精度限制。

完成必要typecheck/build及现有RecordingPanel/Session/Presentation中受改动影响的窄回归；不重复全部旧矩阵。证据保留首次失败和原始日志。源独审后root合入，准确新包及Mac实际界面复验另行记录。禁止覆盖当前Android进程或导出13秒音频。
