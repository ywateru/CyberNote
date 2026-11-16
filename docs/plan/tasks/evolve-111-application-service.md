---
id: evolve-111
scope: native-application
status: in-progress
depends-on: []
---

# 共享应用服务与外部写协调

## objective

在同一原生Session之上增加有界查询/命令服务，供UI与后续MCP复用。实现外部目标写协调、严格schema/版本检查、原子创建和持久幂等记录，保留原有窗口保存intent、访问屏障、receipt与同步dirty语义。本任务不开放agent传输或改变UI视觉。

## context

- `docs/architecture/agent-mcp.md`（尤其外部写协调、幂等和查询语义）
- `docs/architecture/editor-session.md`
- `docs/architecture/sync.md`、`docs/architecture/sync-coordinator.md`
- `docs/plan/analysis/project-review-20261116.md`

## path

- `src-tauri/src/application/`（新增）、`src-tauri/src/lib.rs`
- `src-tauri/src/session.rs`、`src-tauri/src/session/`
- `src-tauri/src/store.rs`、`src-tauri/src/store/`、相关Rust测试
- `src/network-sync.ts`、`src/App.tsx`、`src/bridge.ts`、相关前端协调代码
- `docs/architecture/agent-mcp.md`与上述原有架构文档的实际变更部分

## verification

真实Session/SQLite验证查询授权、版本CAS、复杂文档保护、创建一次事务、重启后幂等、已提交但通知失败的结果。真实App窗口验证pendingDocs、中文组字、录音、附件、参与窗口变化及sync同时到达的保护。证明UI调用新服务、事件沿原metadata路径发布，不能只新增未接入的模块。
