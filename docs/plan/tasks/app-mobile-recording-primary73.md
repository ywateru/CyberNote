---
id: app-mobile-recording-primary73
scope: mobile-recording-primary-control-visual-parity
status: in-progress
depends-on: [app-mobile-debug-recording71]
---

# objective

依据已经保全的手机录屏，校准初始红圆、录制暂停胶囊、暂停继续胶囊的轮廓、内侧间隔与填色。现有73前源码继续按钮将整面设为8%红，原稳定暂停帧内芯更深且与外圈隔开，属于明确可见差异。完成真实共享View的前后图像/HTML比较及实际App命令回归，不操作原Android现场。

# context

- docs/INDEX.md、docs/testing.md、docs/debugging.md
- docs/ui/recording-mobile.md：73控件校准与既有三态布局
- docs/research/mobile-recording-sequence-01/README.md及representative/frame-n0833.png、frame-n0870.png、frame-n0960.png
- src/RecordingPanel.css、src/RecordingView.tsx
- scripts/check-mobile-recording-visual59.mjs、scripts/check-mobile-recording-wave60.mjs、scripts/debug/

# contract

1. 仅修复手机中央录音控件的可见轮廓/内芯与必要局部呈现标记。初始圆包络约原图[95,415,129,448)，录制与暂停胶囊约[71,415,154,448)，与当前总体尺寸接近，不能为内圈改变整行位置、触控尺寸或既有计时/播放/时间轴布局。
2. 红圆有灰色外轮廓、浅间隔、红色内芯；录制态为灰轮廓/浅间隔/白底与红暂停；暂停态为红轮廓/浅间隔/浅红内填与红字。使用稳定n0833/n0870/n0960，避开变形转场。录屏压缩色值只支持可量化的相对改进，不宣称原生颜色token或整体像素PASS。
3. 原n0960内芯ROI[87,422,101,440)主色为(255,190,187)；根当前浏览器暂停图对应内芯主色(255,240,239)，表明明显过浅。需在392×840/DPR2同参考比例呈现、等比例投影至224×480后重算旧/新ROI及轮廓mask误差，保存原始图/精确参数/源码身份。不能仅比较CSS数值或图片自比；同时保留未改善的字体/抗锯齿残差。
4. 使用真实RecordingView生成受控同props视觉样本，视觉fixture只投影合法状态，不假称采集/保存通过。新增可重放的校准脚本应复用现有工具或统一debug基础，不修改App源码字符串注入私有接口，不安装依赖或编译原生。避免堆积一次性不可复验脚本。
5. 点击/键盘/禁用、44px以上触达与真实录音handler保持；不能用额外嵌套button或遮住pointer来画图。320×568、280×600与392×840的初始/录制/暂停控件均完整；深色下轮廓/间隔仍可见，不硬编码白间隔破坏深色。桌面同props浅/深图像、HTML/rect/computed style应不受影响。
6. pnpm build、生产入口排除、手机recording42/notes9及桌面完整九组均实际运行；错误/保存重试及真实后段播放保持。正式测试提交前冻结产品源码，保留start/end指纹。开发提交后交另一agent独审，根合入后整体验证。
7. 不改录音Session、音频编码、授权/保存/归属、Rust/SQLite或已存录音标题；不新增听写/转写、未知省略菜单、假按钮或系统状态栏。不操作原生Mac应用、Android设备/模拟器、真实麦克风或用户音频。不构建/安装原生包。
8. 2026-11-06独审已观察到命令套件summary通过后Node长时间仍在清理，以及保存卡remount后的DOM点击失败。验收须修复已证实的测试边界缺口：等待真实卡片媒体准备后才操作，不能靠重复运行掩盖竞态；从命令启动记录到真实退出（含清理）的耗时和状态，不能强制process.exit冒充正常退出。原开发命令后来均自然exit0，阶段诊断复跑完整结束，因此目前不能断言永久hang/资源泄漏，也不为猜测改runtime。若后续证实清理缺陷则窄修实际边界。保留首次失败、长清理及计时未知，独审复核必要负例；不为此更改产品录音语义。

# path

src/RecordingPanel.css及确有必要的RecordingView局部标记；可重放的视觉校准脚本；独审实际失败所需scripts/debug/等待与资源清理边界；docs/verification/mobile-recording-primary73/及独立证据。不扩散全局样式或其他UI模块。文档说明与可见实现作为一次交付。

# verification

独审重算原图与旧/新真实View的控件ROI和轮廓差异，确认使用相同完整尺寸、状态与合法props；核桌面隔离、窄屏/深色、真实App命令与生产排除。根整合后再运行完整回归。只授予中央控件局部改进，原生设备和整体逐像素目标仍开放。
