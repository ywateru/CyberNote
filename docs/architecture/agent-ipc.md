# Agent本机IPC实现契约

状态：MCP开发阶段内部传输契约。对外工具和业务语义以[agent-mcp](agent-mcp.md)为准；该协议不直接向网络发布。

## 边界

`crates/notes-mcp`为Rust stdio适配器，使用维护中的MCP SDK。宿主`agent_host`持有Unix socket listener并将经过认证的请求交给同一个NotesApplicationService。适配器不访问数据库。凭据引用与宿主端点均不从笔记正文或工具参数选择。

一个连接处理一个请求和响应，以UTF-8 JSON加换行分帧，单帧最多2MiB；读取必须有界，不能read_to_end。请求/响应默认期限分别为读操作5秒、写操作20秒（业务协调15秒，预留传输）。宿主每次请求认证并复核grant，适配器不缓存工具结果或正文。连接断开不证明写入未提交；仍按原幂等键恢复。

```ts
type HostRequest = {
  version: 1;
  requestId: string; // UUID
  workspaceId: string;
  clientId: string;
  credential: string; // 仅传输，禁止日志
  tool: string;
  arguments: Record<string, unknown>;
};
type HostResponse = {
  version: 1;
  requestId: string;
  result: Record<string, unknown>; // 业务DTO或ToolError
  isError: boolean;
};
```

未知字段/版本、缺少字段、无效UUID或超过帧限制显式拒绝。响应requestId必须与请求相同。普通业务失败保持响应结构；传输错误由适配器映射为ToolError并标isError。凭据校验错误不附带期望token或socket物理路径。

## CLI与凭据引用

```text
cybernote-mcp --workspace-id <id> --credential-ref <uuid> [--runtime-dir <absolute-private-directory>]
```

`--runtime-dir`仅决定本机私有凭据查找目录，默认macOS当前用户`~/Library/Application Support/com.local.notesclone/agent-runtime`；支持非macOS开发测试时使用当前用户应用数据目录的同名应用目录。实际目录推导由实现文档记录。路径必须绝对、非符号链接，目录owner为当前用户且权限0700。

引用对应`credentials/<uuid>.json`，owner为当前用户，0600，拒绝符号链接；credentials目录0700。内容严格校验：

```ts
type CredentialRecord = {
  version: 1;
  workspaceId: string;
  clientId: string;
  credential: string;
  socketPath: string;
};
```

workspaceId必须与CLI参数匹配。socketPath必须为该私有runtime目录中的socket，owner为当前用户、权限0600；不允许指向任意外部socket。宿主安装/关闭端点时校验路径与inode身份，不能删除另一个活跃宿主端点。socket只标识宿主，workspaceId和grant仍由宿主验证。

macOS Unix socket路径长度受限，宿主使用短basename（例如workspace/宿主身份摘要的前12个十六进制字符加`.sock`），绑定前验证完整路径字节数；不能直接把完整UUID重复拼接进长应用数据目录。路径超限显式报错并允许指定较短的私有runtime-dir，不截断路径或复用其他宿主端点。

原始credential仅存在私有凭据文件和请求内，不出现在CLI、工具返回、错误和审计。授权UI复制的是引用配置。首版配置使用完整适配器可执行路径、workspace-id和credential-ref；隔离实例可附runtime-dir。Android不启动该listener。

桌面内部`HostSettings`必须返回宿主实际使用的绝对`runtimeDir`（普通路径信息，不是凭据），重新载入后为既有grant复制配置仍使用该值；不得依赖仅存在于创建响应的临时组件状态或猜测默认目录。TS客户端对HostSettings与CreatedGrant.connection的runtimeDir均作严格校验。授权目录集合上限与宿主保持一致：最多10,000个物理目录ID；scope单独校验为已支持的权限集合，不与目录列表共用任意256项限制。合法宿主设置不能因前端更小的隐式上限而隐藏总开关和撤销入口。

## MCP适配器行为

工具发现为固定九工具目录，输入/输出schema与agent-mcp一致。服务端grant只决定实际调用是否获准；capabilities返回真实授权，不能仅凭tools/list推断权限。未知工具按协议错误处理。每次tools/call生成requestId，认证信息从凭据引用加载，parameters原样经严格schema传输；成功与业务错误分别包装为structuredContent及同JSON文本。

客户端可只具notes:create而不具notes:read，最小回执与重放授权遵循原工具scope。宿主不可用返回HOST_UNAVAILABLE，不启动应用或回退到默认资料库。退出时释放连接，无后台自动重试写操作。

## 验证

适配器模块可用临时Unix服务验证帧限制、身份校验、错误映射、stdio初始化和schema，必须标为传输测试；最终必须接真实宿主Session/SQLite验证落盘、撤销、并发保护与窗口刷新。任何临时服务的成功不能替代MCP最终联调。
