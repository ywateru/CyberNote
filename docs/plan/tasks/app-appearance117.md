---
id: app-appearance117
scope: themes, preferences, native toolbar, checklist
status: done
depends-on: []
---

# 八套外观与双端待办排版

## objective

保留三套 ID，增加五套完整明暗色板。修正纸感上下色差、高对比粗线；正常桌面设置四列两行。圆形待办框与首行正文对齐，收紧双端多余间距；不改变编辑器、保存和录音所有权。

## context

- [本轮契约](../appearance-mcp-tester-20261117.md)
- [主题架构](../../architecture/theme-presentation.md)
- [双端界面](../../ui/adaptive-presentation.md)

## path

`src/themes/`、主题生成脚本、`Preferences.tsx/.css`、`style.css`、`desktop.css`、原生 toolbar typed projection 与插件、`store/archive.rs`、相关命令检查。

## verification

主题 token 生成一致、前端类型检查、八套双明暗语义颜色和对比度；新旧设置的严格保存/归档与未知 ID 拒绝。校验待办圆形/首行对齐、任务段落规则、原生背景投影完整链。用户进行最终 UI 验收，无 UI 自动化。

已合入：独审发现的旧 WebView `lh` 兼容问题经修复及[窄复审](../reviews/app-appearance117-recheck.md)关闭。主树重新执行 schema 96 / appearance 742 / token 一致检查通过；真实归档窄测试 1 passed。插件 enum 单测未执行完成与 UI 边界保留在[原独审](../reviews/app-appearance117.md)。
