---
id: evolve-113
scope: desktop-mobile-interaction
status: in-progress
depends-on: []
---

# 双端已有交互缺口修正

## objective

修正移动真实字号接入与双列卡片操作触达、桌面窄窗栏宽计算、画廊键盘打开、分栏键盘/拖动取消、view保存失败时的页面保持。统一音频卡的平台交互身份。当前FORMAT102与旋转/IME/手势风险先在准确包复现，记录结果再做必要修复，不宣称静态修改已修好历史现场。

## context

- `docs/ui/adaptive-presentation.md`
- `docs/ui/design-rules.md`、`docs/architecture/editor-session.md`
- `docs/architecture/theme-presentation.md` 的resolver边界

## path

- `src/App.tsx`、`src/Editor.tsx`、`src/font-size.ts`、`src/style.css`
- `src/platform/`、`src/editor-session/`、`src/navigation/`
- 对应真实组件/原生交互验证脚本
- `docs/ui/adaptive-presentation.md`与变更的原有UI契约

## verification

320px实际控件可达；界面/正文五档字号对真实页面生效；1100px两侧拖动反馈与偏好保持；键盘可打开画廊和调整分栏；pointercancel/lostcapture后无残留；持久化失败不离开正文。Android横屏音频/IME/Back与长按格式保持用准确APK验证，分别记录已测与未测。

## delivery stages

本任务为前端模块交付：源码/真实React与ProseMirror交互检查及独立审查通过后，标记模块done并允许114基于该代码推进。上述准确APK/实体IME/Back/长按FORMAT102与手势验收作为116的强制原生门槛继续跟踪，不因模块done变成已通过，不删除或降低任何最终验收要求。现有历史现场与新包复验分别留证。
