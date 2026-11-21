# 编辑器交互会话

`controller.ts` 是正文浏览/编辑、格式、速绘、普通菜单和录音呈现的唯一交互状态来源。`use-editor-session.ts` 只创建实例、订阅快照、接入 viewport 与 React 生命周期；`platform.ts` 操作确切 Editor 的焦点及 Android 键盘桥。

```text
App 的有效 noteId / Editor / owner / 授权与屏障
                 │ configure + reconcile
             EditorSession
               ├─ browse ↔ editing
               ├─ format / drawing（互斥）
               ├─ 普通 menu（独立于 format）
               ├─ 录音呈现、indicator、原 owner（独立于导航）
               └─ generation + pendingFocus + 映射选区书签
                 │
          确切 Editor / NotesKeyboard
```

## 边界

- App 继续持有文档、Undo/Redo、正文保存合并调度器、精确保存队列、访问门禁、SearchEditorGate、录音控制器及捕获 owner。会话不调用 `setEditable`，也不执行附件或录音保存事务。
- App 每次渲染传入当前上下文；导航、撤权、同步、模态遮挡还在事件入口同步 `invalidate(reason)`。任何旧焦点代次都不能在后续创建/flush 完成时恢复。
- 新建收据请求可等待新 noteId 对应 Editor 挂载，但必须匹配代次、连接状态、注册 owner、可写授权和可见性。平台适配在 focus 前后再次检查有效性。
- 格式面板捕获并随真实 ProseMirror 事务映射书签；正文选择文字会更新命令目标。打开普通菜单不关闭格式。确认关闭恢复正文/手机键盘，Back、Escape、外部关闭保持浏览。
- 速绘捕获原文档/节点/授权仍由 App 的原守卫检查，门禁冻结与恢复仍走原控制器。完成或取消均隐藏键盘；原触控和触摸板手势实现不变。
- 桌面录音呈现独立于正文/面板/菜单。导航保留原 owner；只有原录音生命周期关闭对应呈现。会话不能重归属或结束采集。
- `MenuSurface` 的可见层注册表统一 Escape/Android Back 的最内层关闭顺序，包含正文速绘/附件/表格的局部菜单，不依赖 App 的菜单字符串。Android Back 先关闭实际 `role=menu` 层，格式 `dialog` 留给会话的显式 Back 转换，避免一次返回关闭多个层。网络/模态优先级及各原业务动作守卫保持原有契约。
- `dispose` 解除 Editor 订阅并废弃焦点/书签。没有开放面板或菜单时，不为普通输入额外发布选区修订快照。

## 平台焦点与键盘

平台适配不搜索任意 `.tiptap`，仅接收获准的 Editor。Android `MainActivity` 对延迟 show 使用代次及可取消 Runnable；hide、WebView 替换、pause、destroy 使旧请求失效。Web spy 验证 show/hide 意图，不能证明 Android 系统键盘或 Mac 第一响应者的实际效果。

## 可重复验证

- `node scripts/check-editor-session96.mjs`：生产 schema/PM 事务、收据延迟挂载、过期 Done、格式书签、导航/访问、速绘门禁、独立录音、销毁订阅。
- `node scripts/check-editor-session96-browser.mjs`：真实 App，格式与普通/二级菜单、关闭原因、新建精确 owner、速绘/撤权与键盘桥 spy。
- `node scripts/check-session96-menu-back.mjs`：正文表格/附件局部菜单在有/无格式面板时的全局 Back 顺序、格式关闭原因及文档不变。
- `pnpm test:mobile-editor`、`pnpm test:drawing`、`pnpm test:note-move-menu`、`pnpm test:recording-refresh`、`pnpm test:native-toolbar`。
- `pnpm debug group quick-home --mobile --out artifacts/session96-quick-home`、`pnpm debug group recording --out artifacts/session96-recording`、`pnpm debug group notes --out artifacts/session96-notes`。
- `node scripts/debug/sync-window-navigation.mjs artifacts/session96-sync-navigation` 验证实际 DOM 与隔离同步收据下的焦点/导航行为。

浏览器命令需设置 `PLAYWRIGHT_CORE_PATH` 与 `CHROME_PATH`。相关产物在 `artifacts/session96*`；原生 IME、Mac 焦点与实体触摸板捏合由 FINAL101 实包验证。
