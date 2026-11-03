---
id: app-002-media
scope: real-media-recording-and-drawing-roundtrip
status: pending
depends-on: [app-001-fix-01]
---

## objective

补齐并独立验证 F08/F09/F10 的真实附件、录音、绘画闭环。实际排期由root在FIX-01后按原生顶部任务的设备交接决定；不与其他实现修改同一App/Editor/存储文件。

1. 本地文件/图片/视频/PDF插入，复制到Rust受管目录后可离线预览/播放/分享副本；取消或失败不留下假节点。重启后不依赖原选择文件的临时URI。大小/类型/损坏文件有明确失败，界面保留未保存内容。
2. 录音按28–36秒原帧区分待开始、录制中、暂停、继续、完成、播放。进入面板不能未经开始动作直接录音；暂停状态可完成，不强迫先走另一个stop界面。计时按实际录制/暂停累计，波形来自实际音频，保存后可重启播放和±15秒/拖动进度。权限拒绝、麦克风缺失、系统中断/Back、取消或保存失败均有真实结果，不产生虚假卡片。
3. 绘画保留可编辑笔画、笔/荧光笔/橡皮、颜色/粗细、撤销重做与纸张。完成插入后重开可继续编辑，旧笔画不因新颜色/纸张改变而被重画成新样式。原始笔画和展示预览需一致，七纸张使用FIX-01的同一模型。
4. Mac与Android按各自原版菜单/UI进入。系统权限和平台限制记录实际版本；不能以API存在或Manifest声明推导可用，也不能以一个file input模拟录音/扫描。

## context

- docs/INDEX.md、docs/requirements.md F08–F10/F15/F16
- docs/ui/macos.md、docs/ui/android.md、docs/ui/interaction-matrix.md
- docs/research/offline-media-scanning.md（完成研究后读取；无此文档时先等待root交接）
- references/mobile/frames-2s/frame-014.png至019.png（26–36s），frame-022.png至024.png（42–46s）
- docs/plan/reviews/qa-001-01.md、docs/verification/qa-fix-01/（已完成项只在新改动影响时回归）

## path

录音/绘画/附件组件及样式、必要的Mac/Android原生权限/桥接配置、Rust附件边界与文档节点。更新真实契约及README。扫描/OCR作为另一最小任务，不在本批顺带做。

## verification

开发者构建对应源码的Mac/.apk，独立verify分别执行真实选择→受管复制→移除临时源访问→重启预览，真实录制含可辨识音轨→暂停/继续/完成→重启播放与跳转，以及绘画→保存→重开修改→再次重启。测试用合成内容/声音，不录制用户私人谈话或屏幕。模拟器麦克风/相机不能验证的硬件路径明确unknown，不能以空音频或静态画布截图替代。

保存权限拒绝/取消/失败路径，检查实际文件与关联元数据、文档节点、重复保存/孤儿文件；已通过普通保存不等于媒体通过。对应录屏状态采截图/过程视频并给差异；未测字形/材质/动画不标像素pass。
