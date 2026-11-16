# 主应用模块与创建链

2026-11-09。MODULES98已实现、经53a6d4ad独审接受并整合，前置SESSION96已接受。迁移不是重写持久化/授权/同步系统，也不以 App 行数作为唯一验收。最终双端交付范围见[恢复状态](../plan/cybernote-modernization-state.md)。

2026-11-17演进补充：111/112共享应用与真实MCP宿主、114主题、115呈现Shell均已独审合入并通过组合检查；116进入准确包构建与原生联调。下文原有前端owner继续保留，新增真实创建链如下。当前实现与最终包范围以[演进状态](../verification/project-evolution/README.md)为准。

## 新增的共享应用与agent边界

```text
App/Editor → bridge → Tauri UI命令 ───────────┐
                                            ▼
                                     NotesApplicationService
                                            │
MCP stdio → 私有agent_host → agent_service ──┘
            验证grant           注入同一SharedSession
                                            │
                                    Session → Store/SQLite
                                            │
                             receipt/metadata/既有同步dirty
                                            │
                              App AgentWindowCoordinator
```

| 入口 | 自己拥有 | 不能重新拥有 |
| --- | --- | --- |
| `src-tauri/src/application/` | 有界DTO、查询、正文转换/校验、外部写命令与UI共享入口、准入限额 | 不打开第二个Store，不加载原始credential，不伪造renderer保存intent |
| `src-tauri/src/agent_access/` | 宿主验证后构造的进程内TrustedContext及撤销代次 | 不从工具参数反序列化可信身份，不把UI解锁当作agent授权 |
| `src-tauri/src/agent_host/` | 私有IPC、grant/凭据文件、启用/退出/重启生命周期、交付复核；`service.rs`由lib以agent_service模块装配 | 不另建Session，不跨窗口等待/发送/IO持有Session锁，不把grant同步或导出 |
| `crates/notes-mcp/` | 官方SDK stdio、严格工具schema、引用读取与私有IPC客户端 | 不直读SQLite/附件路径、不启动第二宿主、不自动重发写入 |
| `src/agent-window.ts` | 独立外部写协议解析、目标保护/冻结、可信刷新与释放恢复 | 不复用sync消息解析，不新建保存队列，不用旧事件解冻新operation |
| `src/AgentSettings.tsx`、`src/agent-client.ts` | 明确授权表单、typed UI命令与引用配置显示 | 不接收raw credential，不在不可用Android端显示可运行宿主 |
| `src/themes/`、ConfirmedSettings | 外观严格对象/迁移、语义token与已确认设置发布 | 不重写笔记marks，不更换Editor key，不宣称AppKit支持任意palette |

NotesApplicationService借用宿主已有Session；agent_service注入AppState中的同一个共享Session。准入在Session锁之前，窗口/IO期间释放锁。一次read交付可按SQLite generation缓存成功的可见性检查，但实时身份、scope、有效期和撤销每片仍复核；该缓存不能升级为授权缓存。正文提交、幂等回执、metadata与刷新失败的精确定义以[业务契约](agent-mcp.md)和[IPC契约](agent-ipc.md)为真源。

呈现层115保留永久WorkspaceShell槽位、同一个EditorSession与录音owner，平台/空间/布局只改变纯resolver输出和属性；已独审合入并通过实际App组合检查，详见[主题与呈现](theme-presentation.md)。不要在最终整合时为每一种Shell复制上述共享应用状态。

## 根所有权

App 保留工作区及其可信更新、访问/同步屏障、保存队列与参与窗口、各领域控制器的创建和整体页面组装。领域模块从根注入最小明确依赖，不复制 Workspace、Editor、noteId、授权或录音 owner 的可变状态。异步步骤使用现有实时 snapshot/assert/书签契约，不能依赖一次 React render 的旧闭包。

```text
App：可信 Workspace + SaveQueue + AccessGate + Sync + Editor registry
 │
 ├─EditorSession（SESSION96）：交互状态、面板、focus/IME 意图
 ├─Navigation：目录/标签/笔记/返回/新建的导航决策与设置更新
 ├─EditorMenus：命令能力、菜单内容、目标书签和统一 MenuSurface
 ├─AttachmentOperations：picker/粘贴/画廊/预览目标与操作生命周期
 └─Platform：NativeToolbar投影与意图、窗口/键盘/系统事件适配
```

每个模块必须在真实 App 调用链中使用，具有自身决策、生命周期或渲染职责。仅把 setState 重新导出、或把 App 整体上下文作为 untyped 对象传给巨大闭包，不算完成。现有 NativeToolbar、AttachmentSubmission、PickerBatch、QuietWindow、SearchEditorGate 等继续复用。

## 导航

Navigation 接收只读实时 workspace/页面/搜索状态与受限更新函数、Session 转换入口、sync frozen/cancel 和 settings 保存入口。迁出 chooseFolder/chooseTag/chooseNote 及浏览/画廊返回决策；新建仍由既有事务产生真实 note，导航只接收已验收的结果与收据。搜索停车/智能目录 projectFolders 继续使用同一实现。

任何延迟导航在取消同步后重新核对目标、当前导航代次和生命周期。改变目标先同步撤销旧 focus/菜单/绘画目标，再发布页面与选择。模块不能为“找到第一篇”读取未授权正文、随意 setEditable，或丢弃待保存内容。已保存设置只反映实际采纳的选择。

## 菜单

EditorMenus 负责菜单内容、分组、图标、快捷键、当前能力和执行目录；FormatControls 独立为可测试组件。菜单展开/关闭与焦点意图通过 EditorSession，菜单 material/位置/子菜单通过既有 MenuSurface。App 不再内嵌数百行菜单 JSX；菜单组件按类型分组的 props 明确输入，禁止通过 any 或隐式全局对象访问任意根状态。

Web/原生投影共享动作语义，目标读取、授权和书签仍在执行时核验。打开菜单、移动选区、实际执行分别核定，不因工具栏 revision 变化而重建 Editor 或刷新全部按钮。系统菜单与 Web 菜单样式能力保持已注明差异。关闭只退出最内层，持久手机格式面板仍按其手动关闭契约运行。

## 附件操作

AttachmentOperations 接收现有受管 bridge、捕获/重绑目标接口、SaveQueue、AttachmentSubmission 与授权 getter。迁出 picker 选择批次、剪贴板提交、画廊动作和预览目标。普通文件/录音/OCR 的业务控制器保留，不能另起竞争保存队列。

捕获确切 noteId/Editor/文档版本/书签/授权后，文件读取、存储与正文 ACK 各 await 后重新校验。取消仍等待原工作终态并走既有安全补偿；失败保留可重试 File/operation。画廊“在备忘录中显示”使用真实附件引用和 owner，预览保留非模态/资源 retain，不影响主界面。卸载/撤权释放 picker listeners、源 URL、controller、晚结果与目标引用。

## 平台适配

Platform 负责创建、订阅、更新和销毁唯一 NativeToolbar，以及系统窗口、键盘桥、原生菜单/导出/录音事件适配。输入为 typed projection 与经过业务校验的 action handlers，输出为能力和事件；不重新持有文档或业务 owner。原生 intent 的 revision/窗口/Editor/授权/文档版本/书签验证保持原契约，不能用“当前 Editor”替代原请求目标。

纯 Web、Mac、Android 的能力显式区分；未知或缺少必需原生能力返回明确错误，不能用空 callback 冒充成功。dispose 先废弃晚事件，再移除监听/关闭系统资源；React render 不重复注册。原生工具栏与设置/右键菜单共存的可视性策略只保留一个决策入口。

## 迁移与回归

按导航 → 菜单 → 附件 → 平台顺序，每一步记录迁出入口、旧状态删除位置、模块 README 和对应真实 App 检查。每步通过相关回归再开始下一步；最终组合检查新建/搜索/返回、嵌套与格式菜单、批量附件/粘贴/画廊/预览、跨笔记晚结果拒绝、原生投影、录音跨笔记归属、访问/同步屏障。编译或局部纯函数通过不能替代真实创建链和调用链证据。
