---
id: app-image-preview80
scope: desktop-titlebar-double-click-image-preview-layout-info-and-internal-save
status: in-progress
depends-on: [app-data-management79]
---

# objective

实现用户本轮截图反馈，按docs/ui/image-preview.md修复双击标题栏、预览层级/按钮叠加，预览内图片信息与原图保存，移除正文外部保存按钮。

# context

docs/INDEX.md、docs/ui/image-preview.md、docs/ui/data-management.md、docs/testing.md、docs/debugging.md。用户已明确要求变更旧79卡片外部保存规则，无需询问确认；原Android录音现场不动。

# path

src/Editor.tsx、use-attachment-media/预览模块与CSS、App/native toolbar桥、plugins/tauri-plugin-notes-ui、相关debug与验证脚本、任务独立证据。根管理规格/计划/主线整合/准确Mac新包/清理；开发代理实现并提交，独立验证代理另行复核；不自行建worktree、不碰主线index、不操作设备。

# verification

保全用户截图和修前可复现证据；桌面原生标题栏双击放大/再双击还原且按钮/输入不触发，普通拖动保留；原生toolbar与预览不叠加；真实DOM独立层/信息/无外部保存/窄屏与长文件名/浅深/焦点与Escape；保存原字节及取消/错误/重试/重复/撤权与Undo保持；prepare/锁定/跨笔记/源失效不残留portal或原生toolbar状态。主线build/production/桌面全组与相关手机组；准确Mac新包本地交付，原生与浏览器/核包/原版像素边界分开。
