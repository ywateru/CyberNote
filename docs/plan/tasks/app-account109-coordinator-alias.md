# ACCOUNT109 协调服务正式域兼容准备

2026-11-13。手机 CELLULAR 到现有 Vercel 默认域的连接未完成；公网 peer 匿名隧道不能替代协调服务 bootstrap。[只读部署调查与方案](../../verification/account109/server/custom-domain-proposal01/PROPOSAL.md)确认没有已配置的正式自定义域。拟议 `cybernote-sync.aixgg.com` 仅为待 owner 确认的方案，尚未分配，系统 DNS 保留地址不构成所有权或可用性证明。

## 已授权的本地准备

将协调 HTTP transport origin 与 enrollment JWT issuer 的可信配置分开，为未来同一后端的正式域别名提供兼容性。保持当前 production transport 值和服务端 `CYBERGRID_PUBLIC_ORIGIN` 不变，issuer 仍精确固定为 `https://cybernote-sync.vercel.app`。不添加任意 URL/issuer/token 输入、自动猜测域名、忽略 TLS 或失败时降级认证。

产品 Logto issuer/client/resource、workspace seed、签名密钥、Redis 和已绑定身份不随传输域迁移而更换。既有桌面仍可验证同一 issuer 的 proof；新客户端未来才通过已验证的正式 alias 访问同一 API/JWKS。

## 最小实现与验证

- 原生配置显式命名固定 enrollment issuer；请求使用现有 transport origin，验签仅使用固定 issuer，不能从请求 URL、返回 claims 或目录动态扩大信任。
- 尽量复用现有 Enrollment 类型和 verifier，不新增生产 IPC 或通用 endpoint 配置入口。
- 定向测试证明：请求 origin 与 issuer 不同时，旧固定 issuer 的真实签名 proof 在预期账号/产品/workspace/device/Noise 约束下可验证；把 `iss` 换成请求 alias 必须拒绝。既有签名、过期、aud、归属和密钥检查继续有效。
- 本轮仅本地实现、独立复核与必要测试，不创建域名、改 DNS、部署服务、发送 token 至拟议域名或切换 production transport。

## 后续外部步骤

owner 确认精确子域及管理权限后，配置同一 Vercel 项目别名及其实际验证记录。先完成手机正常 TLS、无凭据的 health/config/JWKS 验证及项目身份核对，再评审客户端 transport 切换和新候选构建。真实账户/三端证明必须在新入口验证后执行；不能把准备测试当作手机已恢复。
