# JWKS 获取错误分类修复部署

2026-11-13。已将通过[独立复核](../jwks-retrieval-review01.md)的服务端修复部署到既有 Vercel 项目，production deployment 为 `dpl_8TFiHJE6dzcfafFeQaDwybB6cQTk`，状态 READY，canonical 地址仍为 `https://cybernote-sync.vercel.app`。

部署源码提交 `d86b43b1ce80cec80095d0ad04e163f111984db0`，显式准备 116 个文件，按路径、字节长度和内容分帧的 staging SHA256 为 `3da4d5a1c59e192bd6a55e5c7766ef1f12dba6417affc8458b9b207211aee62c`。仅重新部署经过检查的服务源码，继续使用项目既有服务端环境配置；未生成或轮换 workspace seed、enrollment key。

[公开复验结果](result.json)：health 200、auth/config 200（固定 issuer/client、四个 scopes 正确）、JWKS 200（无私钥字段）、匿名 profile 401。此次由 Node 原始 fetch 请求 canonical HTTPS 地址，不携带认证头，没有 DNS/IP/代理覆盖，也没有使用 Vercel 保护绕过头。

该结果证明部署及公开路由基本可用。真实 access token 的注册、设备目录、enrollment、SDK 隧道和数据同步仍须在双桌面续验中证明，不能据此将本次自动发现失败认定为已修复。服务定向 18 项测试与独立真实 fetch 超时反例通过；作者更广服务回归有 29 项 Redis 测试跳过，边界见独审记录。
