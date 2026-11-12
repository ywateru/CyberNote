# d69 原生失败后的服务侧只读核对

本轮用于核对 [sso06 原生失败](../../android/sso06/README.md) 所在时段是否有可关联的服务端 HTTP 错误，不发起另一轮登录，也不修改部署、域名、网络、密钥或应用数据。

## 部署及公共健康状态

[api-metadata.json](api-metadata.json) 记录使用已有 Vercel 凭据执行的只读 API 核对：固定 production deployment 的 ID/project 均匹配、状态 READY。主机以正常 HTTPS 访问 canonical `/healthz` 返回 200，约 2.85 秒；未读取健康响应正文。

根据 [Vercel 官方 SDK 日志接口](https://github.com/vercel/sdk/blob/main/docs/sdks/logs/README.md)及其[请求模型](https://github.com/vercel/sdk/blob/main/docs/models/getruntimelogsrequest.md)，公开的 deployment runtime stream 没有历史时间筛选参数。本次有界调用约 5.27 秒后超时，没有记录 HTTP 状态或日志行。原回执的 `bounded-stream-read-timeout` 是包装脚本标签，不能据此声称已建立流或确定超时发生阶段，也不能用空结果证明早先请求没有到达。

## Dashboard 的历史请求视图

随后使用已有授权浏览器会话只读查看该项目的日志页面，依次核对 Runtime Logs、Request Logs 和 CDN Requests。[dashboard-metadata.json](dashboard-metadata.json) 只保存可见时间、固定接口及状态的投影，不保存整个页面、账户资料、请求头、Cookie、IP、消息正文或展开详情。

- Runtime Logs 显示最近 30 分钟无 console/runtime 输出；这与 HTTP 请求记录不同。
- Request Logs 的本地时间范围为 11 月 13 日 05:28–05:58，包含本次原生尝试的 05:48–05:49。可见列表仅一条：`2026-11-12T21:55:43.425Z` 的 canonical `GET /healthz`，状态 200；页面显示该时间范围内无更多记录。
- CDN Requests 的 05:29–05:59 范围也仅显示同一条健康请求及无更多记录提示。没有观察到与本次原生失败对应的 profile 请求行。

健康行与本轮主机探测时间相符，证明所选项目视图能显示该次控制请求。它不是手机请求或成功登录的证据。没有取得日志覆盖完整性的保证；缺少 profile 行不能证明原生从未发请求，也不能区分 DNS、TCP/TLS、客户端构造、边缘等待或其他阶段。未改防护或路由配置来尝试绕过问题。

当前最强结果仍是：最新 d69 隔离包的一次真实 SignIn 返回原生 `error/account_network`、无 profile、同步关闭；部署仍 READY、主机健康检查正常。具体原生失败原因尚未定位，真实登录和多端同步验收保持未完成。
