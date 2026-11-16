---
id: evolve-115
scope: adaptive-presentation
status: in-progress
depends-on: [evolve-114]
---

# 统一呈现解析与布局扩展

## objective

交付PresentationV1及唯一PresentationResolver，共享稳定platform身份、有效栏宽/列数与工具栏策略。增加桌面专注布局和移动列表偏好，抽取双端Shell，移除组件独立mobile断点。沿用Navigation路由，保持同一个EditorSession/Editor/保存队列与录音owner。

## context

- `docs/architecture/theme-presentation.md`
- `docs/ui/adaptive-presentation.md`
- `docs/architecture/application-modules.md`、`docs/architecture/editor-session.md`

## path

- `src/presentation/`、`src/shells/`（新增）
- `src/App.tsx`、`src/platform/`、`src/navigation/`与相关共享组件
- `src/types.ts`、`src/Preferences.tsx`、Rust设置校验
- `docs/architecture/theme-presentation.md`、`docs/ui/adaptive-presentation.md`

## verification

默认三栏/画廊行为保持；两栏/专注返回来源与焦点；移动列表独立于桌面view；旋转、699/700与1100边界不换错owner。主题/布局/密度切换期间中文组字、Undo、录音、附件、保存失败保全；实际组件证明同一Editor实例，不以重新加载正文代替。
