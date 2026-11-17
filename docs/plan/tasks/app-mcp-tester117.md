---
id: app-mcp-tester117
scope: agent settings and real stdio test runner
status: done
depends-on: []
---

# MCP 测试程序

## objective

桌面 Agent 接入可启动测试弹窗，真实受控子进程连接现有适配器及授权，手动逐工具调用和批量自动测试。只读为默认，读写批量仅修改本轮新建测试笔记，并显示留存说明。调用具有权限、窗口 token、工作区及生命周期约束。

## context

- [本轮契约](../appearance-mcp-tester-20261117.md)
- [MCP 契约](../../architecture/agent-mcp.md)
- [私有 IPC](../../architecture/agent-ipc.md)
- [接入说明](../../agent-usage.md)

## path

`AgentSettings.tsx/.css`、新增 tester/client/batch 模块、`src-tauri/src/lib.rs`、native tester 与 host lifecycle 模块、必要依赖及独立命令检查。与视觉任务不共享全局 CSS。

## verification

真实 stdio 握手/工具发现/调用，帧大小、错误、超时、取消与子进程回收；授权/过期/访问变化；手动 JSON 和批量结果语义、CAS/幂等键/回执与已有笔记隔离。明确区分受控 protocol fixture、真实适配器和真实宿主证据；不启动用户日常资料库做测试。

已合入，两个 P2 经修复及[窄复审](../reviews/app-mcp-tester117-recheck.md)关闭。69项JS、8项Rust小harness通过；主树组合前端构建和原生编译成功。真实 Session/SQLite 新测试界面与 UI 验收边界见[交付](../../verification/feedback117/README.md)。
