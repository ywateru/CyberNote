---
id: app-002-media
scope: real-media-recording-and-drawing-roundtrip
status: in-progress
depends-on: [app-001-fix-01]
---

## objective

2026-11-03首批已进入隔离准备阶段：`/private/tmp/apple-notes-media-roundtrip-02`基线67ce948。资源清理候选0b29cc0已独立静态有限通过（真实生产模块26项失败注入/typecheck/12顶部检查），见`../reviews/app-002-recording-cleanup-static-01.md`，尚未合入或装包。FIX07与Mac最小搜索独立复验已结束；Android以原5dd6冻结包检查现有真实getUserMedia流程，Mac以56d7冻结包做真实本地图片/PDF附件基线。当前模拟器公开console明确No active gRPC service，受控音轨注入不可用；仅在公开hostmicoff保证零信号后运行静音流程子集，不开宿主麦克风、不把静音当有效采集/可听播放。有效音轨、真实保存及冷启播放未取证的部分仍unknown，录音链未验收。

设备被前序独立复验占用期间，可在隔离目录先准备已由源码确认的采集资源清理候选，范围仅RecordingPanel准备失败、取消/卸载和错误时的幂等释放与回调活性；必要的实际生产生命周期辅助模块及定向失败注入检查可同行。保留现有挂载/开始/暂停/完成与保存行为，不提前选择平台替代方案或改Rust附件协议。旧冻结APK继续用于现有getUserMedia真实基线；该候选须静态独立审查，并在基线完成后才合入和装包。暂停完成、失败重试/补偿等后续状态修改仍按真实基线及既定契约推进。

补齐并独立验证 F08/F09/F10 的真实附件、录音、绘画闭环。实际排期由root在FIX-01后按原生顶部任务的设备交接决定；不与其他实现修改同一App/Editor/存储文件。

1. 本地文件/图片/视频/PDF插入，复制到Rust受管目录后可离线预览/播放/分享副本；取消或失败不留下假节点。重启后不依赖原选择文件的临时URI。大小/类型/损坏文件有明确失败，界面保留未保存内容。
2. 录音按28–36秒原帧区分初始、录制中、暂停、继续、完成、播放。28秒00:00初始帧不能单独证明是否等待手动开始，需密取序列核对，不先规定进入自动/手动录制。32秒暂停状态可完成，不强迫先走另一个stop界面。计时按实际录制/暂停累计，波形来自实际音频，保存后可重启播放和±15秒/拖动进度。权限拒绝、麦克风缺失、系统中断/Back、取消或保存失败均有真实结果，不产生虚假卡片。
3. 绘画保留可编辑笔画、笔/荧光笔/橡皮、颜色/粗细、撤销重做与纸张。完成插入后重开可继续编辑，旧笔画不因新颜色/纸张改变而被重画成新样式。原始笔画和展示预览需一致，七纸张使用FIX-01的同一模型。
4. Mac与Android按各自原版菜单/UI进入。系统权限和平台限制记录实际版本；不能以API存在或Manifest声明推导可用，也不能以一个file input模拟录音/扫描。

## context

- docs/INDEX.md、docs/requirements.md F08–F10/F15/F16
- docs/ui/macos.md、docs/ui/android.md、docs/ui/interaction-matrix.md
- docs/research/offline-media-scanning.md（完成研究后读取；无此文档时先等待root交接）
- docs/research/media-roundtrip-readiness/analysis.md、inputs.json（21份只读输入；静态缺口不等于设备已复现，须按当前交付重新核源码）
- docs/research/media-roundtrip-readiness/current-source-delta.md（67ce948有限差异核对及现有APK/受控音轨方案；可用性尚未运行）
- references/mobile/frames-2s/frame-014.png至019.png（26–36s），frame-022.png至024.png（42–46s）
- docs/plan/reviews/qa-001-01.md、docs/verification/qa-fix-01/（已完成项只在新改动影响时回归）

## path

录音/绘画/附件组件及样式、必要的Mac/Android原生权限/桥接配置、Rust附件边界与文档节点。更新真实契约及README。扫描/OCR作为另一最小任务，不在本批顺带做。

首个录音闭环批次先验证现有getUserMedia/MediaRecorder采集，不先替换为新原生插件。依据只读准备审计，先修暂停态完成、保存失败回传并保留可重试录音、准备/错误/取消时立即统一释放采集资源、两步附件落盘后正文插入失败的补偿与重试去重。补齐计时/有效媒体和播放错误仅限真实基线暴露的必要边界；绘画与通用附件后续按本任务分批继续，不让第一批通过升级为APP-002整体完成。

## verification

开发者构建对应源码的Mac/.apk，独立verify分别执行真实选择→受管复制→移除临时源访问→重启预览，真实录制含可辨识音轨→暂停/继续/完成→重启播放与跳转，以及绘画→保存→重开修改→再次重启。测试用合成内容/声音，不录制用户私人谈话或屏幕。模拟器麦克风/相机不能验证的硬件路径明确unknown，不能以空音频或静态画布截图替代。

保存权限拒绝/取消/失败路径，检查实际文件与关联元数据、文档节点、重复保存/孤儿文件；已通过普通保存不等于媒体通过。对应录屏状态采截图/过程视频并给差异；未测字形/材质/动画不标像素pass。
