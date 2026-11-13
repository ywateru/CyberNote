# 正式 coordinator 域名准备：只读元数据与未应用方案

日期：2026-11-13（Asia/Shanghai）。源码基线：`ca08c3b548a50a15f9349a07c9ec4b38d724c906`。本归档仅记录 Vercel 管理 API 的 GET 与源码核对；没有配置外部资源、修改产品、改变 token 目的地、请求拟议主机或请求手机。没有构建、测试或运行应用。仅检查归档 JSON 与 SHA256 完整性。

结论：建议准备 `cybernote-sync.aixgg.com` 作为同一 Vercel 项目的正式传输别名，但该域当前未分配到项目。新 Android transport origin 与旧 enrollment issuer 可以在严格区分后共存；当前客户端不能只换 origin 字面量。保持服务端旧 `CYBERGRID_PUBLIC_ORIGIN` 是旧桌面继续验证新手机 enrollment proof 的必要条件之一。方案仍待域名负责人确认及后续实现、验证，未证明 4G 可用。

## Vercel 只读结果

查询时间为 `2026-11-13T05:26:01Z` 起的一组顺序 GET。结构化选取字段见 [metadata.json](metadata.json)，精确源码输入 hash 见 [source-inputs.json](source-inputs.json)。凭据只在内存中用于 Vercel 管理 API，不归档凭据、环境变量值、grant、请求认证头或部署临时地址。未查询服务器环境变量；源码兼容判断不等于已证明线上所有环境值。

| 查询 | HTTP | 有限事实 |
| --- | --- | --- |
| 精确项目 `cybernote-sync` | 200 | region `iad1`；`ssoProtection.deploymentType=all_except_custom_domains` |
| 项目域名完整列表 | 200 | 仅 `cybernote-sync.vercel.app`，verified=true；无下一页 |
| 项目内 `cybernote-sync.aixgg.com` | 404 | 未取得该项目域名分配记录；不证明它未被其他项目占用 |
| 拟议域名 config | 200 | configuredBy=null，misconfigured=true，serviceType=external，acceptedChallenges=[] |
| 当前 production deployment | 200 | target=production，readyState=READY；两个现有 alias 都属于 vercel.app |

config 推荐 CNAME 为 `cname.vercel-dns.com.`（rank=1），另推荐 IPv4 `76.76.21.21`。这是 Vercel 的域名配置建议；不是 IP pin 建议。子域方案只准备 CNAME，不同时添加 A/AAAA，也不修改客户端解析。API 返回 nameservers `chad.ns.cloudflare.com`、`miki.ns.cloudflare.com`，cnames/aValues 为空。这不证明当前操作者持有 DNS 权限，也不替代正式绑定时产生的 ownership 验证要求。未分配域名的 acceptedChallenges=[] 不能解释为无需验证。

父线程系统 DNS 曾返回该 host 位于 `198.18.0.0/15` 的 A。该观察未在本轮重复，也不作为公开 DNS 存在性、域名所有权、TLS、Vercel 分配或 4G 可达性证据。API 字段同样不能证明运营商路径可达。

现有部署的第二个 vercel.app alias 不是获批的新 token 接收方。保护策略元数据不能单独解释手机超时，方案不关闭保护、不使用 bypass header。custom domain 的实际公开 API 行为需在后续授权配置后验证。

仓库根 `vercel.json:14` 将请求重写到 `/api/index`；项目返回的 redirects/rewrites、deployment routes 为 null。没有从这些只读结果得到现成可用的 custom domain 或备用 bootstrap 路由。

## 交付与边界

具体阶段、源码行、兼容条件、验收与回退见 [PROPOSAL.md](PROPOSAL.md)。没有把本提案当作 DNS 写授权。现有 issuer 使用 `aixgg.com` 下的主机仅说明命名关系，不证明 coordinator 子域控制权或 Vercel 项目绑定权限。还缺域名负责人输入，已列在提案末尾；全部当前获准的只读准备已完成。

文件校验见 [SHA256SUMS](SHA256SUMS)。未暂存或提交其他审阅者的资料；本归档也未提交。
