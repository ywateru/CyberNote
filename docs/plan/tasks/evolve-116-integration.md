---
id: evolve-116
scope: release-integration
status: pending
depends-on: [evolve-112, evolve-115]
---

# Agent与双端最终整合交付

## objective

以准确源码和实际运行包验证MCP、授权、双端UI、主题和既有同步的组合。按manifest交付Mac/Android与MCP适配器，维护当前入口和已知限制；不得把标识核验等同于业务或像素通过。

## context

- `docs/plan/project-evolution-20261116.md`
- `docs/architecture/agent-mcp.md`、`docs/architecture/theme-presentation.md`
- `docs/ui/adaptive-presentation.md`、`docs/architecture/build-delivery.md`

## path

- 真实联调与设备验证脚本/记录、发布manifest
- `README.md`、`docs/INDEX.md`、`docs/platform-feature-matrix.md`
- 本轮设计/任务的状态与实际偏差更新

## verification

运行相关核心/前端/协议回归；真实harness搜索、读取、新建、追加、冲突更新、撤销；用户并发编辑不丢内容。开启同步后另一独立客户端及Android读取同一内容，关闭同步仍本地可用。主题、字号、布局、原生IME/Back/菜单逐项记录。最终只更新实际构建且核验的包入口，保留未通过与未执行范围。
