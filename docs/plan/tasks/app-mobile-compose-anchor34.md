---
id: app-mobile-compose-anchor34
scope: Mobile folders page right compose button layout anchor
status: source-reviewed
depends-on: [app-mac-ordinary-typography31, mobile-compose-readiness32]
---

## Objective and context

继续完整双端像素/交互目标，校正准确Android07首页右下新建备忘录图标的横向锚点。实际29与原14/62录屏均有明确共同图标；宽归一中心206.267对原208，左右边均向左约1.6–1.8原图像素，宽度11.822接近原12。不能为对齐bbox缩放或替换现有SVG路径。

读docs/INDEX.md、docs/research/android-folder-visual-runtime29-analysis/analysis.md、docs/research/mobile-compose-readiness32/analysis.md及其只读实际DOM证据。32确认当前真实footer right padding17CSS、按钮30×35、SVG24×24，path几何中心在viewBox中心略偏右；整体左偏主要是布局槽锚点，不是路径向左。原版按钮slot未知，低清录屏、DPR、金色阈值边界仍保留。

## Path and target

唯一产品作者develop_app，产品只改src/style.css中mobile.page-folders的folder-footer右侧局部布局。可优先用局部right padding修正，具体参数先用现有真实App/完整CSS生产渲染验证后决定；不改左padding/底padding/高度、按钮/图标尺寸、stroke/path/颜色、事件/DOM、数据、智能表单、Mac或其它页面。不得靠transform移动视觉却留下旧命中区域。新证据仅docs/verification/mobile-compose-anchor34/，root维护任务/共享文档/Git。

```text
手机文件夹页底栏：高度和左图标保持
[文件夹+可点圆加号]                     [新建笔记]
                                      ↑右锚点局部校正，按钮随图标一起移动
```

## Verification and gate

独立源阶段接收：固定e194753，不同作者一次fresh窄生产运行及独立ROI/差异复核通过；新命中条带触发真实newNote、旧条带拒绝，左plus保留。root复核19项独审索引全部匹配。见[独立审查](../reviews/app-mobile-compose-anchor34.md)。准确Android08实际位移、触摸与重启仍待验，路径及整体像素继续partial。

2026-11-05作者STOP：唯一候选局部padding-right 17→14，button/SVG/path共同右移3CSS；8项有限真实回调/坐标边界通过，Mac及稳定手机列表样式/几何/PNG保持。宿主中心205.972→207.734，原208；实际07平移模型207.978只属模型，尚无新设备结果。root核30项索引匹配，等待固定提交与不同作者独审。详见[作者证据](../../verification/mobile-compose-anchor34/README.md)，原进场动画/端口冲突等工具失败保留。

31源码独审固定完成后root明确START，避免完整CSS活动输入混淆。先当前生产App baseline，再单一布局候选。按32的真实viewport和原生比例、已有原ROI/阈值检查右下形状/左右界/中心/宽高与垂直锚；归一余差小不能授精确CSS/原版DPR结论。保留路径轮廓仍有未知，不能以bbox通过替代目视。

验证实际button/svg rect共同平移、可见图形位于按钮命中区，生产新建回调仍可触发；底栏左侧plus中心和近右边缘仍能打开并取消表单，布局外坐标不会误开。左按钮、搜索/计数/标题/卡片、Mac与mobile非folders外观computed/rect保持；仅运行有意义的相关检查，不重跑全套/无关typecheck或常量镜像测试。

无GUI/ADB/平台构建/下载/数据库/删除/媒体导出，旧视频/包/证据/cache全部保留。SOURCE-READY STOP→root提交→不同作者窄独审；其后联合31准确双端新包、来源核对、Computer Use/已授权ADB实际复验后才授实际局部交付。整个目标active。
