# 项目演进实施与验证状态

此页跟踪[路线图](../../plan/project-evolution-20261116.md)的实际实现与验证。`codex/project-evolution`为集成分支；任何安装包或功能结论须以当前源码、检查结果和具体运行范围为依据。

## 当前交付矩阵

| 任务 | 实现状态 | 独立验证 | 最终运行 |
| --- | --- | --- | --- |
| 111 应用服务 | 原生修复`eb9cee7d`及独审`6e728266`已合入；窗口前端`5e10f614`独审中 | native MODULE_SOURCE_PASS；合入后HEAD`892f9751`的197项/typecheck/11390项通过；独审另含原8探针、96条schema语料与19条合法service往返 | integration-open |
| 112 MCP | 适配器/宿主/独立UI均已合入；接下来装配实际宿主与Preferences入口 | 三模块MODULE_SOURCE_PASS；host HEAD`371469dd`23项、UI HEAD`f750b848`typecheck/12组、adapter HEAD`efd8ac6e`完整suite/release/F1合入检查通过 | integration-open；Codex CLI 0.167.0初始化/九工具发现通过，零业务调用 |
| 113 交互 | 前端模块`6309967f`及独审`3f93fbfe`已合入 | SOURCE_PASS；作者90项、独立20项组件检查通过 | native-open，强制门槛由116承接 |
| 114 主题 | 基于113开始；palette/迁移规格已固定 | 未执行 | 未执行 |
| 115 呈现 | 等114 | 未执行 | 未执行 |
| 116 整合 | 等112与115 | 未执行 | 未执行 |

## 分支写入边界

- `codex/evolve-111`：application、可信授权context、Session/Store/schema、lib原生装配；不修改前端或agent_host。
- `codex/evolve-113`：前端交互、相关验证脚本；不修改Rust。
- `codex/evolve-112-adapter`：独立`crates/notes-mcp`与模块使用/验证说明。
- `codex/evolve-112-host`：`src-tauri/src/agent_host`与模块验证说明；lib接线在111完成后串行。
- `codex/evolve-112-ui`：独立AgentSettings/typed client组件与组件验证；Preferences/App接线随后串行。
- `codex/evolve-111-window`：基于已审113接入独立notes-agent协调、App目标保护与可信刷新；不改Rust、Preferences或主题。114只改App外观职责，合入时保留两者且重验真实组件。
- `codex/evolve-114`：主题registry/token/外观偏好迁移、Rust归档校验及真实表面投影；不改agent_host/application或窗口外部协调语义。
- `codex/evolve-112-integration`：同Session原生host/生命周期/命令/持久启用偏好与Preferences Agent入口，随后接已审窗口协调做真实链路；不改变theme/presentation或另建Store。

开发提交后由另一agent复核并执行相关真实检查。合入按依赖顺序进行，涉及相同owner的接线串行完成；不把模块传输fixture当作真实资料库联调。

111原两项阻塞（document额外键、提交后release ACK错误标记）经独立复核关闭，修复与原失败证据均保留于[原生审查报告](../../plan/reviews/evolve111-native-independent.md)。这是严格schema与错误回执缺口，未证实任意文件读取或写事务丢失。

112 UI原两项阻塞（重载后丢失runtime配置、目录隐式256上限）经宿主/UI增量独审关闭；真实host返回准确runtimeDir，目录容量统一10,000，已验证重挂载复制与合法授权撤销。独立报告随模块合入后保留，真实装配另验。

112适配器原F1（辅助object误计文档节点）经独审`d17b7a18`关闭；合法779,987字节/20,000节点与depth64输入输出通过，20,001节点/depth65仍拒绝；独审与原失败证据保留于[适配器报告](../../plan/reviews/evolve112-adapter-independent.md)。

## 最终证据要求

1. Rust服务：真实Store/Session、事务/幂等重启/版本冲突、scope/锁定/撤销与窗口协调保护。
2. 协议：真实SDK stdio初始化、九工具schema、私有socket/凭据校验、错误和有界帧；再通过真实宿主证明落盘。
3. UI：真实App组件下的字号、320px命中区、分栏、键盘、设置失败保持；主题/布局切换保留Editor与Undo/选区。
4. 原生：准确Mac/Android构建身份、最终包实际输入/IME/Back/窗口与原生工具栏验证，不能复用旧包结论。
5. 同步：隔离测试资料库间agent改动传播，原有数据/附件保全；未完成的设备或账户验收保持未执行。

所有自动化默认新建隔离资料库，不读取真实agent凭据或覆盖用户已有笔记；设备运行先确认当前现场和目标实例，不能为了出包验收破坏历史未保存内容。
