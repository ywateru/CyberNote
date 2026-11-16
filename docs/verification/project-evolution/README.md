# 项目演进实施与验证状态

此页跟踪[路线图](../../plan/project-evolution-20261116.md)的实际实现与验证。`codex/project-evolution`为集成分支；任何安装包或功能结论须以当前源码、检查结果和具体运行范围为依据。

## 当前交付矩阵

| 任务 | 实现状态 | 独立验证 | 最终运行 |
| --- | --- | --- | --- |
| 111 应用服务 | 原生与窗口前端均已独审合入；动画测量测试修复也已独审合入 | 两阶段MODULE_SOURCE_PASS；native HEAD`892f9751`197项/typecheck/11390，window HEAD`79241c09`54/38/sync34/nav41，脚本修复HEAD`ce663ade`原11390通过；独审另含12恢复+13空目标组合 | integration-open |
| 112 MCP | 适配器/宿主/独立UI均已合入；实际宿主与Preferences入口装配中 | 三模块MODULE_SOURCE_PASS；host HEAD`371469dd`23项、UI HEAD`f750b848`typecheck/12组、adapter HEAD`efd8ac6e`完整suite/release/F1合入检查通过 | integration-open；Codex CLI 0.167.0初始化/九工具/直接fixture能力调用通过，真实资料库业务待验 |
| 113 交互 | 前端模块`6309967f`及独审`3f93fbfe`已合入 | SOURCE_PASS；作者90项、独立20项组件检查通过 | native-open，强制门槛由116承接 |
| 114 主题 | done（模块）；主题`39662e7d`与production Store runner`9bbb8562`均已合入 | 独审`7767625d` MODULE_SOURCE_PASS；合入后376主题/90交互/12组AgentSettings/core199通过，实际AgentSettings额外18状态/450文字对/0失败。runner修复`975202a9`经`bd0aaf78`独审通过，主树真实3项Store再次通过 | native-open，116承接 |
| 115 呈现 | in-progress；基于已合入114开始 | 未执行 | 未执行 |
| 116 整合 | 等112与115 | 未执行 | 未执行 |

## 分支写入边界

下面前六条为已合入并清理的模块分支责任记录；当前活跃的是114、112-integration。清理只移除本轮已完成的worktree/分支，保留提交、审查、失败证据与独立生成缓存；不清理历史sync108或用户数据。window原失败日志与独立探针已逐字节保全至`/tmp/evolve111-window-independent-postmerge-ercaff`，历史失败段保留在已合入review。

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

114原五项阻塞（确认失败覆盖、智能文件夹背景、表格遮字、附件计数与Toast配色）经独审关闭并合入。原表格探针有一条rgba字符串限定仍失败，新合法color(srgb … / .12)经独立对比度与实际字形绘制验证通过；不把该旧断言虚报为绿。`39662e7d`合入检查确认bridge同时保留agent-window与appearance导入，typecheck/token生成一致性、376主题（102 DOM状态/1911文字对/0失败）、90交互、12组AgentSettings及production core199通过；4个worker为父测试驱动项。额外实际AgentSettings六配色18状态/450可见文字对/0失败，最低5.0905。

Store runner现直接使用production core harness，尊重独立CARGO_TARGET_DIR。初版`96272cc6`经独审`8f79c122`在临时fixture中发现“已有symlink父目录+尚不存在后缀”可绕过禁止共享Tauri target的检查；未触碰真实共享target。修复`975202a9`解析最近已存在祖先及缺失后缀，经`bd0aaf78`独审6个独立/10个作者路径边界及真实3项Store通过，`9bbb8562`合入后主树再跑3项通过。原失败保留；未重复376/core199，115现已解锁。

112装配checkpoint`5eccb9f6`仅WIP：真实IPC→Service→SQLite九项通过，窗口仍协议输入；全native一次396通过/1失败/5 worker，64MiB同步阶段失败正在定位与baseline对照。已将主线已审window注入装配树，后续实际App/WebView与Codex读写另留证，未把WIP当作最终交付。

## 最终证据要求

1. Rust服务：真实Store/Session、事务/幂等重启/版本冲突、scope/锁定/撤销与窗口协调保护。
2. 协议：真实SDK stdio初始化、九工具schema、私有socket/凭据校验、错误和有界帧；再通过真实宿主证明落盘。
3. UI：真实App组件下的字号、320px命中区、分栏、键盘、设置失败保持；主题/布局切换保留Editor与Undo/选区。
4. 原生：准确Mac/Android构建身份、最终包实际输入/IME/Back/窗口与原生工具栏验证，不能复用旧包结论。
5. 同步：隔离测试资料库间agent改动传播，原有数据/附件保全；未完成的设备或账户验收保持未执行。

所有自动化默认新建隔离资料库，不读取真实agent凭据或覆盖用户已有笔记；设备运行先确认当前现场和目标实例，不能为了出包验收破坏历史未保存内容。
