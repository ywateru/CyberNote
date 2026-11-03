---
id: app-001-paper-preview
scope: android-paper-picker-preview-layout
status: pending
depends-on: [app-001-fix-07]
---

## objective

在FIX07真实选纸返回通过并交出Android后，接入已有六张SVG预览与录屏测得的选择器布局。仅校准手机“横线与网格”页面，不改变真正笔记/绘画纸张的间距、模型或选择保存行为。本任务不能掩盖选区失败，也不能用低清录屏宣称高清像素通过。

```text
┌─────────────────────────────┐
│取消       横线与网格         │
│                             │
│    选择备忘录的背景样式      │
│                             │
│  ┌────────┐                 │
│  │ 空白   │                 │
│  └────────┘                 │
│  ┌────────┐  ┌────────┐     │
│  │ 密横线 │  │ 密网格 │     │
│  └────────┘  └────────┘     │
│  ┌────────┐  ┌────────┐     │
│  │ 中横线 │  │ 中网格 │     │
│  └────────┘  └────────┘     │
│  ┌────────┐  ┌────────┐     │
│  │ 疏横线 │  │ 疏网格 │     │
│  └────────┘  └────────┘     │
└─────────────────────────────┘
```

图中名称说明资产映射，不新增原版没有的卡片文字。标题独立居中；留白、卡片比例及行列gap按研究比例校准。SVG本身已有内嵌留白，不额外叠加图案padding；alpha mask着色，不用黑色luminance mask。空白项不需第七张图。

## context

- docs/requirements.md F10/F14、docs/ui/android.md
- docs/research/mobile-paper-calibration/analysis.md、measurements.json、recommended.css
- assets/mobile-paper-previews/README.md及六SVG
- docs/plan/tasks/app-001-fix-07.md及最终独立运行报告
- docs/verification/README.md

## path

手机选择器组件、选择器专属CSS和六SVG引用；更新资产README接入状态。不得改真实绘画背景、纸张模型/步长、App保存/授权/Editor生命周期或依赖。若入口组件与其他工作共用App.tsx，由root串行安排源码与构建，不在该文件并发实施。

## verification

先核七种状态与六资产映射、遮罩可见、图案7/3/2横线及8×6/4×3/2×2格数，装包采真实页面；按相同宽度比例输出与原录屏的对照/差分，明确系统区域和原视频224×480、未知DPR的限制，不纵向拉伸消除屏幕比例差。覆盖窄屏滚动/安全区、取消/Back及选中保存；沿用FIX07真实选区路径作一次有限回归，不重跑无关输入矩阵。未测主题/字形/动画继续unknown。
