---
id: parity-001
scope: complete-app-visible-layout-and-interaction-parity
status: pending
depends-on: [app-001-fix-02, app-002-media, app-003-local-features, app-004-scanning]
---

## objective

完成已接入功能的逐页外观与交互校准，不能以顶部原生模块或某一行为用例通过代替用户要求的整应用一致。前置模块尚未完成时，可收集对应现有页面的具体差异；修改共享App/Editor/样式仍由root串行排期。

1. Mac以本机Notes4.13/macOS26.4实采为基准：文件夹侧栏、列表/画廊、三栏/隐藏侧栏/展开笔记/独立窗、搜索、富文本/表格/清单、格式/更多/媒体菜单、锁定、纸张及媒体页面逐项校准。顶部已有FIX-02的结果直接引用，仅在接入变化影响时回归。
2. Android以已保全视频的实际状态为基准：文件夹大标题/折叠、列表/画廊/置顶分组、编辑器日期与正文、键盘附加栏、格式面板、附件菜单、录音、绘画、纸张页、搜索与更多菜单。不能将Mac玻璃控件样式套到录屏手机页面。
3. 校准真实布局尺寸、留白、字体/字重/基线、图标、边框、圆角、颜色、材料与选中/聚焦/失活状态；表格必须同一模式/内容后再比较列宽、行高和操作柄。小窗和分栏拖动不能依赖固定参考宽度。
4. 实现并测量导航返回、左滑操作、长按菜单、标题折叠、清单完成项排序、键盘/面板切换、菜单层级与撤销行为。手机动画从30fps原视频读取帧序，标明源压缩与触点缺失带来的证据边界，不能从0.1秒抽样推精确曲线。
5. 亮色为已有手机基准；Mac深色、无障碍标签/焦点、中文组合输入和系统缩放按实际平台验收。未采原版状态须补证或单列unknown，不用视觉近似升级为像素pass。
6. 可在共享主App修复期间提前准备不被主App引用的独立纸张预览SVG资产，依据d22a393实测：74×60 viewBox、内嵌横线7/3/2条及完整网格8×6/4×3/2×2格；只画图案，不包含卡片背景/选中/触摸区，更不复用到真实绘画纸张。资产使用单色alpha以供宿主着色，源压缩不足以确认高清线宽/颜色。native_ui_research独占`assets/mobile-paper-previews/`和`docs/research/mobile-paper-calibration/preview-assets/`离线准备与渲染自检；不得改主App、真实纸张模型或原证据。正式接入仍由root排期并独立真装包验证，资产完成不等于页面或像素完成。

## context

- docs/requirements.md、docs/ui/README.md、macos.md、android.md、local-features.md、interaction-matrix.md
- docs/verification/README.md、docs/plan/backlog.md
- docs/research/macos-toolbar-host-deltas/analysis.md、inputs.json（当前正式宿主失活对照的内部墨迹差异；不同屏幕背景不支持材质因果，先按最终候选确认输入身份）
- references/desktop/README.md及实采原图；references/mobile/original/和加密抽帧
- 前置功能各独立review，区分已通过行为与仍未通过的外观

Mac顶部下一轮从已测公共组内部开始：中文“格式”文案、动作图标视觉位置、搜索图标与占位文字分别校准。四组外边界与18/18/16pt间距近似齐，不能为了内部墨迹误差整体移动胶囊。实施前核冻结候选和研究输入关系，重采使用相同窗口屏幕位置/焦点/背景；既有74.57% raw mismatch仅描述那对失活图，不代表全页结果或单一材质参数的错误。

## path

由develop代理修改真实页面/组件、样式、必要原生控件与导航状态。先在文档登记新证据和差异，再改对应实现；不改原图、不用截图贴图冒充可交互控件、不将比较专用内容写进生产代码。跨窗授权/保存与归档契约继续沿用已有验证边界。

## verification

独立verify按同内容、同尺寸、同主题、同焦点采截图，保留原图/叠图/差分及raw mismatch ratio、mean/max channel error；区域、遮罩和重采样逐项记录。动态时钟/指针仅限明确坐标，不能遮正文或控件提高分数。手机源224×480低清只可提供该源分辨率的比较，高清字形精确性未知；Android系统键盘/状态栏/分享与应用自绘区域分开报告。

操作必须在同一提交构建的真实Mac与APK上完成，记录触摸/按键路径、可见及持久结果。保留最终源码/产物hash、可重现构建方式、实际截图/过程视频和未关闭差异。全局验收须明确各功能与各页面状态的pass/fail/unknown，不以某单页得分或已完成测试的比例宣称整目标完成。
