---
id: evolve-115
scope: adaptive-presentation
status: done
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

2026-11-17模块完成：开发`7e53af80`经独审发现三项P2，修复`7a5bb3dc`经`b94de7f4`复核PASS，合入`e5e66193`。合入后App108、reviewfix9、真实Store2、交互90、主题376、AgentSettings12组及实际Preferences→Agent17全部通过；原生定向19项与编译通过。源码/组件验证不代替实际安装包、IME或设备旋转，最终门槛由116承接。见[独审](../reviews/evolve115-independent.md)与[验证矩阵](../../verification/project-evolution/README.md)。
