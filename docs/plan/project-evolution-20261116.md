# 项目演进实施路线图

设计日期：2026-11-16。状态：111–115实现/独审与116命令集成、准确三产物交付已完成，见[当前交付](../verification/project-evolution/DELIVERY.md)。2026-11-17用户明确UI测试自行完成，因此116本轮范围为命令/单元/协议/数据路径和产物核验，UI清单移交用户；不把未执行UI项标通过。下文保留原任务设计及验收维度供追溯。

## 范围与任务图

需求和代码依据见[项目梳理](analysis/project-review-20261116.md)。不安排整体重写、不另建资料库，不把旧验收结论扩张为新接口/主题通过。

```text
EVOLVE-111 共享应用服务 / 外部写协调
       └─EVOLVE-112 本机 MCP 查询、读取、写入
                 └─EVOLVE-116 双端+agent 最终整合

EVOLVE-113 已确认的双端交互缺口
       └─EVOLVE-114 主题 token / 设置迁移 / 原生映射
                 └─EVOLVE-115 呈现 resolver / 布局扩展
                           └─EVOLVE-116
```

111 与113可以概念并行，但实际常触及 App/Session 装配，需先按任务 path 检查重叠；重叠时串行或细拆，不以同一工作区并发改 owner。不要为并行先引入第二套保存或呈现状态。

当前并行边界：111第一阶段仅修改原生Rust（application/Session/Store与lib装配），113仅修改前端交互与其验证脚本；111的窗口协调前端接线在113合入后串行完成。每条线使用独立worktree，提交并独立审查后依次合入`codex/project-evolution`。

112先并行开发不接数据库的stdio适配器和独立agent_host传输/授权模块；它们在111服务与113前端稳定后串行装配。实现、独立验证和真实运行分别记录于[当前验证矩阵](../verification/project-evolution/README.md)。

| 任务 | 可独立交付的结果 | 依赖 | 首要验收 |
| --- | --- | --- | --- |
| [111](tasks/evolve-111-application-service.md) | UI复用的查询/命令入口与外部写协调 | 无 | 真实窗口未保存/组字与外部写相遇，零内容丢失 |
| [112](tasks/evolve-112-agent-mcp.md) | stdio→IPC→同一Session→SQLite 的 MCP 最小闭环 | 111 | 搜索→读取→新建/追加/更新→重启→窗口刷新 |
| [113](tasks/evolve-113-interaction.md) | 移动字号/触达，桌面分栏/键盘与失败保持 | 无 | 实际组件与设备边界，不只预览 |
| [114](tasks/evolve-114-themes.md) | Classic/Paper/High Contrast，严格偏好迁移 | 113 | Classic基线保留，主题不重建Editor |
| [115](tasks/evolve-115-presentation.md) | 统一平台呈现、专注布局、移动列表 | 114 | 双端共用语义，模式切换保全焦点/内容 |
| [116](tasks/evolve-116-integration.md) | 准确双端包与真实agent联调报告 | 112、115 | 内容/授权/同步/外观/实际运行分别留证 |

111/112 首版交付六个核心笔记工具加 capabilities/folders/operation 工具；删除、附件上传、HTTP OAuth、后台 daemon 均另开后续任务，不在联调时临时扩展。

## 必须接通的真实调用链

| 创建 / 调用关系 | 所属任务 | 必须证明 |
| --- | --- | --- |
| Tauri装配创建同一 NotesApplicationService，UI 命令调用它 | 111 | 既有保存/锁定/归档路径和receipt不退化，不留平行旧写路径 |
| application service调用Session、Store与共享协调器 | 111 | 参与窗口/授权/token/版本均在提交时复核 |
| settings Agent页创建grant，host启动IPC，stdio连接并校验workspace | 112 | 不伪造grant、不直连另一个Store，应用停止明确报错 |
| MCP命令调用application service，事件经宿主进入metadataGate | 112 | 已打开真实窗口刷新到提交结果，失败能恢复 |
| MCP提交进入现有sync dirty/发布链，再由另一端采纳 | 116 | 同步开启时另一端内容一致；暂停时本地仍正常 |
| ConfirmedSettings调用TS/Rust校验与持久读回 | 114 | 新旧schema/备份往返、失败保持旧外观和页面 |
| ThemeRegistry → DOM/portal/启动页/独立窗/原生投影 | 114 | 所有产品表面覆盖，AppKit能力限制如实呈现 |
| PresentationResolver → Shell/音频/菜单/工具栏 → 稳定EditorSession | 115 | 无断点策略分叉、无主题或布局导致的Editor重建 |

## 验证层与结果记录

1. 核心契约：Rust真实Store/事务/schema/幂等/grant/协调状态测试；有意义的失败和并发用例。
2. 前端：现有App、导航、菜单、设置、编辑器实际组件验证，包含恢复与输入状态。
3. 协议集成：真实stdio客户端和私有IPC，不用mock成功回执替代落盘；至少一个实际目标harness读取/写入成功，其余按实际支持范围记录。
4. 原生设备：macOS准确.app、Android准确APK，IME/长按/Back/旋转/原生工具栏与账户同步分项验收。
5. 交付：按现有release流程固定源码、双端manifest与验证范围，再更新唯一安装包入口。

文档阶段仅审查引用、代码事实和契约一致性，不需要运行全量构建。实现阶段运行 typecheck、相关现有脚本与新增边界测试；最后再组合验证，不能为文档修改触碰用户原库或重装设备。

## 后续独立阶段

- 查询性能：建立1k/10k笔记与多媒体基线，摘要/按需读取/分页→中文搜索索引→虚拟化逐项测量，不预先承诺固定性能提升。
- MCP扩展：软删除/恢复、受管附件读取/上传、富文档局部编辑；均需明确scope、版本与文件提交边界。
- 无人值守：统一宿主服务与桌面客户端的lease/启动/退出/升级协调，完成后才支持桌面不启动时写入。
- 远程调用：Streamable HTTP、OAuth授权和资源隔离，不能直接公开本机IPC或媒体端口。
- 自定义主题包：有界token JSON与版本/对比度验证，不允许任意CSS/JS。
- 当前状态治理：独立短状态页与按平台release manifest入口，历史证据保留在原目录；不自动重标11-16文档里提及但本轮未核验的安装包。

交接提示：实现agent先读对应任务、其context和`docs/INDEX.md`，只在该任务范围内开发。未执行/受控测试/真实运行分别记录。涉及新发现的契约变化先同步设计文档，不以新增fallback绕过授权、保存或schema错误。
