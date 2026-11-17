---
id: app-feedback117-integration
scope: integration and documentation
status: pending
depends-on: [app-appearance117, app-mcp-tester117]
---

# 反馈整合与命令交付

## objective

两项实现分别提交，经独立复审后顺序合入当前 `codex/project-evolution`。验证组合源码可编译、token 与严格设置不漂移、测试器真实调用路径可达，交付准确的启动/测试说明和证据边界。

## context

[本轮契约](../appearance-mcp-tester-20261117.md)、两个实现任务以及其独审报告。

## path

文档索引、主题/界面/MCP 说明、任务状态、整合验证记录；合入两个模块的真实实现。

## verification

运行类型/生产前端构建、主题生成一致、受影响的原生单元测试和 MCP runner/batch 命令测试。缺陷修复回原作者，独审不同人执行。不运行 UI 自动化、不操作原手机；历史包保留原身份，不把源码修改冒充已交付安装包。
