# ACCOUNT109 Logto scope 与真实登录诊断

2026-11-13。relogin03 在精确 `d1a6eadf` 候选上返回 `responseMetadata / codeExchange / scope`。这将失败定位到已解析授权码响应的 scope 不含 connect，尚未完成该响应的 ID-token 身份验证；不能假定返回的是预期 QA 账号，也不能据此认定其角色错误。

## 当前公开源码契约

父级只读获取 Logto 公开参考 commit `0049b899702d2cd4636fafffa592b36c0b6424c2`。这是当前参考源码，**尚不证明测试租户部署该版本**。

- [Logto resource 配置](https://github.com/logto-io/logto/blob/0049b899702d2cd4636fafffa592b36c0b6424c2/packages/core/src/oidc/init.ts)由 user/application 的角色计算当前 resource scopes；第一方应用不通过第三方 consent scope 清单缩窄。`resourceIndicators` 开启，`useGrantedResource=false`，但显式 token 请求中的 resource 仍可被解析。当前项目在 authorization URL 与 code token request 均传入固定 resource。
- 该参考 [core 依赖](https://github.com/logto-io/logto/blob/0049b899702d2cd4636fafffa592b36c0b6424c2/packages/core/package.json)固定 node-oidc-provider fork `fdcc1bf150f513a7cd779830a329803905abd74b`。
- fork 的 [grant_common.js](https://github.com/logto-io/node-oidc-provider/blob/fdcc1bf150f513a7cd779830a329803905abd74b/lib/helpers/grant_common.js)在 resource 分支取已授予 resource scopes 与当前 resource-server scopes 的交集，并将 token response 的 scope 明确设置为实际 AccessToken 的 scope。
- [resolve_resource.js](https://github.com/logto-io/node-oidc-provider/blob/fdcc1bf150f513a7cd779830a329803905abd74b/lib/helpers/resolve_resource.js)优先读取显式请求 resource，并拒绝不在原授权 resource 集中的目标。

因此，这份公开实现不支持“顶层 scope 仅是 OIDC envelope，实际 resource token 自然有 connect，所以直接删除检查”的推断。应先核对受控本应用的 resource/connect/default role/QA role 配置，以及系统浏览器复用的 SSO 身份。实际已发行 token 不从现有 grant 中取出作探针；配置查询只读、结果仅保留必要布尔事实和受控输入摘要。

## SSO 与身份选择边界

当前显式 SignIn 请求 Consent，未请求强制重新认证。公开 Logto init 支持 login prompt。既有 hosted session 可能被复用；浏览器前后标签数相等不证明 opener 未调用，也不证明账号正确。是否在显式登录增加 Login/Consent 需要根据配置核对与交互契约确定，不改变正常持久授权 restore，不关闭 issuer/audience/nonce/owner/connect 检查，不为测试改写角色或令牌内容。

本次父级操作仅获取公开源码并读取本地已提交认证代码；公开参考保留在私有临时目录，没有新登录、token 请求、角色写入、网络设置或原库改动。管理配置核对由独立任务执行，后续结果另记，不将当前参考源码当作部署身份。
