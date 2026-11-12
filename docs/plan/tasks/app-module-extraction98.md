---
id: app-module-extraction98
scope: application-modules
status: done
depends-on: [app-editor-session96]
---

## objective

源码范围完成：作者8b3f448f，经53a6d4ad独审接受，按ccab6471基线差异整合。真实导航/菜单/附件/平台所有权与typed ports已迁出；根build、会话13、画廊33、表格指针13组组合通过。原生设备/系统焦点与最终同源包仍归101。

在会话模块完成后，继续按职责抽出导航、菜单、附件操作和平台适配；每一步保持产品行为和验证。App 负责组装与共享边界，不再承担这些领域的所有局部实现。无需用固定行数代替职责验收，也不得仅搬运未定义所有权的巨大闭包。

## context

docs/architecture/application-modules.md（根与各模块所有权、创建链、执行时验收）；docs/architecture/editor-session.md、docs/architecture.md、docs/debugging.md、docs/ui/attachment-gallery.md、docs/ui/attachment-context-menu.md、docs/plan/cybernote-modernization-state.md。

## path

App.tsx、对应 src/navigation/、src/editor-menus/、src/attachment-operations/、src/platform/ 模块（可沿用项目现有模块命名，避免同职能重复）。已有 NativeToolbar、AttachmentSubmission、PickerBatch、QuietWindow 等边界保持复用，禁止重写一套竞争控制器。

## 实施步骤与接线

1. 导航：chooseFolder/chooseTag/chooseNote、back/AndroidBack 与新建导航收据/取消聚焦；输入依赖显式，输出导航与会话意图；搜索停车与授权门禁仍由原领域控制。
2. 菜单：提取大块菜单 JSX、FormatControls 与命令目录；Web/原生命令共享能力/目标校验，保留统一 MenuSurface 与嵌套关闭。
3. 附件：提取 picker 捕获/提交/取消、剪贴板、画廊操作及预览目标；所有异步操作携带 noteId/授权/书签，维持现有 ACK 与失败恢复。
4. 平台：提取 NativeToolbar 生命周期、投影/意图适配、输入法和系统事件；平台能力差异显式处理，不在业务 handler 中重复判断环境。
5. 每项迁移前记录对应现有测试，完成该项后先跑对应回归再继续下一项。更新模块 README 的所有权、创建链、调用链与释放条件。

## verification

真实 App 导航、新建/搜索、菜单命令、附件批量/剪贴板/画廊/预览、异步失效、原生 toolbar投影、录音所有权回归；pnpm build 和每步相关组。独立审查检查无空壳转发、重复状态源或新增 fallback 掩盖失效目标。
