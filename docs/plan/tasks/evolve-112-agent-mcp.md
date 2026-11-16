---
id: evolve-112
scope: agent-interface
status: done
depends-on: [evolve-111]
---

# 本机Agent MCP最小闭环

## objective

交付Rust独立stdio适配器、宿主私有IPC、客户端grant/撤销和桌面Agent接入设置页。按契约实现capabilities、folders、list、search、read、create、append、update、get_operation，接入真实application service。使用维护中的MCP SDK并固定经兼容测试的版本，不手工重造协议解析。首版宿主必须运行，不提供HTTP、独立Store、删除或附件上传。

## context

- `docs/architecture/agent-mcp.md`
- `docs/ui/adaptive-presentation.md` 的Agent页
- `docs/plan/project-evolution-20261116.md`

## path

- `src-tauri/src/agent_host/`、`src-tauri/src/agent_access/`（新增）及宿主装配
- `crates/notes-mcp/`（新增Rust独立可执行程序）；协议DTO可按需要拆入不依赖Tauri的共享crate
- `src/Preferences.tsx`、新增Agent设置组件及桥接
- 对应Cargo/包配置、协议/安全/集成测试与使用说明
- `docs/architecture/agent-mcp.md`、`docs/ui/adaptive-presentation.md`

## verification

开发分期：传输、宿主授权与独立设置组件先按模块开发/独审，装配依赖111真实服务和窗口协调；模块通过不代表本任务完成。最新提交与未通过项见[演进验证状态](../../verification/project-evolution/README.md)。

真实stdio初始化/工具发现/schema/错误，stdout仅协议；IPC owner/权限/凭据/绑定库校验。真实读写重启及已打开窗口刷新、grant撤销、宿主停止、锁定排除、超限/分页、两client竞争、丢失ACK与幂等恢复。提供至少一个实际支持MCP的目标harness配置和实测范围；不能把示意CLI写成已可执行。

模块完成：装配`4ceb15e9`经独审`a1a69662`PASS，实际Codex0.167.0九工具调用真实宿主/SQLite/WebView、双grant/CAS/持久幂等/撤销/大文档/WK/刷新恢复均有原始证据；`eca35abb`合入后native联合编译17项与前端组合通过。参考`docs/plan/reviews/evolve112-integration-independent.md`。最终安装产物、默认正式bundle和Android/同步组合由116交付；DeepSeek仅声明stdio契约兼容条件，没有实际harness运行结论。使用指南为`docs/agent-usage.md`。
