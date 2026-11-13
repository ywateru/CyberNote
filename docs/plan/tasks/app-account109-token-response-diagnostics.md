# ACCOUNT109 有限 token 响应诊断

2026-11-13。真实 relogin02 在一次产品 SignIn 后返回 `account_auth_identity_invalid / responseMetadata`。源码分析表明此类别来自已解析 token response 的信封校验，不是 discovery metadata。现有证据无法区分 code exchange 与后续 refresh，也无法区分 token type、空 access token、缺失/零 expiry、返回 scope 缺少 connect。浏览器前后无新增标签不能证明 opener 未被调用，不以该观察推导流程故障。

## 最小契约

- 保留现有错误 code/reason 语义和全部校验、隔离、撤销与 persist-before-use 行为。只增加有限诊断，禁止为通过测试而放宽 scope、expiry、JWT、owner 或 TLS。
- 对现有 responseMetadata 拒绝附带明确的固定操作 `codeExchange` 或 `refresh`，以及固定字段 `tokenType`、`accessToken`、`expiresIn` 或 `scope`。同一响应多个字段错误按固定顺序归约；字段值、token、scope 字符串、时长、上游原文和 URL 均不进入 DTO/日志。
- 原生错误映射、严格 TypeScript DTO、UI 错误显示、测试执行器的有限状态记录原子更新。扩展字段仅在对应错误分支有效；缺失或未知字段不能默认为某一根因。保持其他错误分支契约，status 只读。
- 测试覆盖三个真实 token 校验路径：code response、带 ID token 的 refresh、不带 ID token 的 refresh；错误字段与操作精确匹配，正常 scope 省略与 connect 仍正常；拒绝结果不交付 access，rotation 保留清理所有权。补充严格 DTO 的错误字段/跨分支注入反例。
- 作者与独立审阅分离。离线验证后更新精确 export pin，构建并核对新 GUI 身份，再使用新输出目录进行一次真实诊断运行。旧 relogin02 保留 FAIL；不读取现有 grant 或原始 provider 响应，不复制授权，不自动扩大重试。

这是用户已授权的功能完善与测试所需的诊断改进，不改变登录策略、接收方、账户归属或同步启用意图。实际复验需在桌面正常可访问时执行。

## 实现归约与兼容

错误 DTO 扩展为 `tokenOperation?: 'codeExchange'|'refresh'` 和 `tokenField?: 'tokenType'|'accessToken'|'expiresIn'|'scope'`。两字段必须成对出现，且只允许 `code=account_auth_identity_invalid`、`reason=responseMetadata`、无 stage/providerReason 的分支。旧的无细分字段 `responseMetadata` 仍可读取，但不推断操作或字段。统一优先级为 tokenType → accessToken → expiresIn → scope，三条校验路径均按此顺序选第一个失败字段。UI 用固定中文解释操作和字段，不展示原值；执行器 safeStatus 仅保留上下文完整的有限字段对。

SDK provider 既有分类接口只有 `identityRejected`，本增量维持该粗分类，不添加推断字段或修改 vendor。直达 native 的 code/refresh 错误保留细分字段；若原生产 `cleanup_status` 以 `account_cleanup_required` 覆盖错误，细分字段也不跨分支携带。失败后的可能启动状态及验证记录见[作者记录](../analysis/account109-token-response-diagnostics.md)。
