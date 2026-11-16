---
id: evolve-114
scope: appearance
status: in-progress
depends-on: [evolve-113]
---

# 主题注册与外观设置迁移

## objective

集中语义token和组件基础几何，保留Classic默认基线；增加Paper/High Contrast的明暗变体与AppearanceV2严格校验/兼容迁移。所有真实表面与原生能力投影接通，切换主题不重建Editor。保留既有字号/界面细节owner。

## context

- `docs/architecture/theme-presentation.md`
- `docs/ui/adaptive-presentation.md`、`docs/ui/design-rules.md`
- `docs/ui/startup.md`、`docs/ui/preferences.md`

## path

- `src/themes/`（新增）、`src/design-tokens.css`、主题相关组件CSS
- `src/types.ts`、`src/Preferences.tsx`、`src/confirmed-settings.ts`、`src/startup.ts`
- `src/native-toolbar-state.ts`及必要原生typed projection
- `src-tauri/src/store/archive.rs`及设置/归档校验
- `docs/architecture/theme-presentation.md`与相关UI文档

## verification

新旧配置、非法对象、备份往返、重启、失败保持；Classic前后同状态截图；三主题明暗下菜单/设置/正文/预览/访问屏障/首屏。普通文字对比度目标和非颜色状态标识；中文组字、选区、Undo、录音不因换肤丢失。原生系统菜单限制如实说明。

独审补充门槛：ACK成功但确认读取失败后，无关sort及旧theme-only更新不覆盖已提交皮肤，真实Store重开仍一致。六种配色覆盖普通/智能文件夹、警告与标签弹层、未选checkbox、附件画廊选中标题及计数、真实Toast；表格普通矩形CellSelection和行/列两类选区均保留正文可见。不能以其他页面的静态色对或有限DOM采样替代这些真实状态。
