---
id: app-mobile-recording-visual59
scope: mobile recorder playback row and timer against preserved video frames
status: source-ready-device-held-by-user
depends-on: [app-recording-visual58]
---

## objective

根整合：源码99dbb95合入为cc5b6aa，作者证据9a823fd合入cd3d37c，独立证据07de0cc合入b152c63；根树核3个源码、8个保护文件及100条独立证据哈希一致。独审SOURCE-READY / PIXEL-OPEN，报告docs/verification/mobile-recording-visual59-independent/review-final.md。桌面普通与深色同props的PNG/DOM/computed/geometry均与58基线相同。准确fa21657的Mac17/Android12已构建收集，手机包未装；手机设备按用户要求暂缓，不能把受控View结论追认为设备收音/保存或完整像素验收。

继续原视频像素/交互目标，修正58同原比例手机对照中仍明显偏小/偏低的播放图形、播放行和大计时字重。手机设备验收由用户明确暂缓，只允许源码与受控共享View验证；不得操作、备份、安装、停止或重启原Android现场。

## context

读docs/INDEX.md、docs/ui/recording-mobile.md、docs/ui/recording-desktop.md的58规则、docs/verification/recording-visual58/README.md（58合入后可用）、原视频代表帧序列。必须等58独审合入后从root准确源创建隔离树，不能在旧源复写58时间轴/桌面样式。

原帧n0960是224x480有损暂停态；同原比例392x840逻辑渲染，DPR2得784x1680，再整幅等比例缩至224x480，只比较应用区域粗几何，不能证明高清字形或系统栏相同。原状态截图的日期、波形数据、转写排除项、系统状态栏和Home区域差异必须披露，不给虚假整体像素PASS。

初步只读测量（正式开发前需独立冻结）：maxRGB<96的稳定黑墨迹，原播放三角bbox[104,370,122,391]，58新图[108,382,116,393]，中心分别(113,380.5)/(112,387.5)；原左右skip中心(69,381)/(154.5,381)，新(68,387)/(155,387)，横距已接近，主要纵向低约6–7视频px。原大计时bbox[70,330,154,343]，新[70,331,153,345]，宽接近，字重偏轻；阈值不能直接证明原font-weight，需候选截图核验。不要为修播放行而移动整个sheet或已校准时间轴。

只读研究已确认两图sheet顶边均y33，392×840到224×480横纵比例均1.75，偏移不是状态栏裁切。正式依据已冻结于docs/ui/recording-mobile.md的59节：播放行可试top73.7%–73.9%，中央三角独立校形/放大，计时先试手机限定黑色与600/650/700字重、保持原字号及84–86视频px墨迹宽。允许据候选真实图像选择参数，不改变交互或扩大功能范围。所有坐标精度仍受有损原帧限制。

## path

优先src/RecordingPanel.css中仅mobile的局部选择器，必要src/RecordingView.tsx的仅手机播放/暂停图形；不得改变desktop布局/图形、58的100px/s/quartertick/seek尺度、状态机、Session、权限、owner、附件/ACK或其他全局样式。证据docs/verification/mobile-recording-visual59/及必要小检查scripts/check-mobile-recording-visual59.mjs；新增检查只覆盖真实视图、动作和范围边界，不复制实现自证。

已证必要范围：播放行上移后320×568长错误notice与播放按钮重叠6.34逻辑px，也与计时框重叠5.33px；69.7%候选会侵入计时，不采用，原始失败保留。允许手机限定notice移原56%空带，无retry时仍4%滚动高；有retry则提示左/重试右同排、各最多44px高并保留重试44px触达，检查与波形/计时/播放均无交叠。必要hook只加手机，不用`:has`，不改真实错误内容、状态或媒体逻辑。这是未有原版证据的工程错误态。设计依据见recording-mobile.md的59节。

## verification

先保全58同尺寸旧图，再真实共享View原/旧/新三方、命名ROI及阈值/坐标/图像差值；核初始、采集中、暂停、实际播放中投影，播放/暂停图形的可用性必须服从真实状态。中心与两侧控件互不重叠，触达框与实际图形一致，点击调用现有真实action而不伪造播放成功。手机不同窄宽及dark/错误/忙碌保持控制可用；桌面同props同尺寸图像/DOM不能变化。必要typecheck/build和受影响的最小播放动作检查，58未触逻辑不重复全矩阵。

固定源后不同agent独审；通过后root合入与准确包构建。受控视图结论不追认手机设备、录音、保存或原生像素验收。保留所有首次失败，不清理旧记录与现场。
