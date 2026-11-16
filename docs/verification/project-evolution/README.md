# 项目演进实施与验证状态

此页跟踪[路线图](../../plan/project-evolution-20261116.md)的实际实现与验证。`codex/project-evolution`为集成分支；任何安装包或功能结论须以当前源码、检查结果和具体运行范围为依据。

## 当前交付矩阵

| 任务 | 实现状态 | 独立验证 | 最终运行 |
| --- | --- | --- | --- |
| 111 应用服务 | 原生阶段已提交`868c6dcf`；窗口前端接线随后串行 | 独立审查中 | 未执行 |
| 112 MCP | stdio模块`c2ca7213`正对齐成功DTO；宿主`a10b53fe`、设置组件`6b0c54b0`已提交 | 宿主与UI独审中；适配器待修订后独审 | 真实宿主未执行 |
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

开发提交后由另一agent复核并执行相关真实检查。合入按依赖顺序进行，涉及相同owner的接线串行完成；不把模块传输fixture当作真实资料库联调。

## 最终证据要求

1. Rust服务：真实Store/Session、事务/幂等重启/版本冲突、scope/锁定/撤销与窗口协调保护。
2. 协议：真实SDK stdio初始化、九工具schema、私有socket/凭据校验、错误和有界帧；再通过真实宿主证明落盘。
3. UI：真实App组件下的字号、320px命中区、分栏、键盘、设置失败保持；主题/布局切换保留Editor与Undo/选区。
4. 原生：准确Mac/Android构建身份、最终包实际输入/IME/Back/窗口与原生工具栏验证，不能复用旧包结论。
5. 同步：隔离测试资料库间agent改动传播，原有数据/附件保全；未完成的设备或账户验收保持未执行。

所有自动化默认新建隔离资料库，不读取真实agent凭据或覆盖用户已有笔记；设备运行先确认当前现场和目标实例，不能为了出包验收破坏历史未保存内容。
