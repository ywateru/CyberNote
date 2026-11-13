# ACCOUNT109 显式登录重新认证

2026-11-13。relogin03 精确错误为授权码响应 scope 不含 connect，但尚未验证返回身份。只读 Management 核对确认专用 Native first-party、resource/connect/default User role 与 QA 角色均一致，没有权限写入依据。公开 provider 登录检查在已有 session.accountId 时可跳过登录，Logto first-party 自动同意使用已有 session；当前 Consent-only 不能保证出现身份选择/凭据页面。SSO 复用为合理但未证实的失败解释。

## 改进契约

- 用户主动 SignIn/SignUp 创建授权事务时同时请求标准 `login` 与 `consent` prompt，明确要求重新认证，并保留离线授权 consent。不清浏览器 cookie、不执行全局登出、不改变租户、角色或其他应用配置。
- 原有持久授权 restore/refresh、SDK AuthProvider、后台同步不调用该交互入口，不增加任何后台重新认证。PKCE/state/nonce、固定 endpoint/resource/scopes/平台 callback、签名与 owner/connect 校验、授权串行与 cleanup 所有权保持。
- 新旧授权失败均不改写数据归属。真实返回身份须通过既有验证和原 binding 检查，执行器再核对历史 subject 摘要和预期 QA username。不能靠新 prompt 声称历史失败根因已证明。
- 离线测试核对 SignIn/SignUp URL 的两个 prompt、原固定请求输入和独立随机事务；不执行真实注册。作者/独立审阅分离；source 先提交、export pin 后从精确提交刷新，再构建新候选。
- 下一次真实运行使用新输出 relogin04，保持原库全文/附件基线与所有有界清理 gates；正常系统浏览器仅登录既有测试账号，未授权新注册不执行。旧 relogin01～03 保留实际失败，网络/权限检查不放宽。

依据：[公开 scope/SSO 分析](../analysis/account109-logto-scope.md)。补充来源：[provider login check](https://github.com/logto-io/node-oidc-provider/blob/fdcc1bf150f513a7cd779830a329803905abd74b/lib/helpers/interaction_policy/prompts/login.js#L23-L29)、[first-party 自动同意](https://github.com/logto-io/logto/blob/0049b899702d2cd4636fafffa592b36c0b6424c2/packages/core/src/middleware/koa-auto-consent.ts#L66-L96)。公开参考版本不等于线上部署版本。
