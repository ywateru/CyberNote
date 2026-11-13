# ACCOUNT109 已授权协调服务自定义域名

2026-11-13。用户在域名与手动解锁请求后回复“继续 允许使用”，授权使用精确主机 `cybernote-sync.aixgg.com`。本任务接续[域名提案](../../verification/account109/server/custom-domain-proposal01/PROPOSAL.md)，不再等待同一主机使用许可。

## 实施边界与当前外部状态

父级已用现有Vercel登录刷新凭据、核对唯一 `cybernote-sync` 项目，并将精确主机绑定至该项目production：redirect=null、gitBranch=null。域名目前unverified。项目级实时DNS建议首选 `673bb9aa89cda1fe.vercel-dns-017.com.`，不沿用绑定前的通用目标；TXT挑战由实际绑定响应给出。现有Cloudflare凭据能查询唯一 `aixgg.com` zone，但DNS记录查询返回403/code10000。未改任何DNS记录，未发送账户token到新域名。浏览器管理入口一直显示加载中，未进入记录编辑页。

## 客户端改动

Feynman在既有独立稀疏工作树准备最小修改：仅Android固定coordinator transport origin改为 `https://cybernote-sync.aixgg.com`；桌面固定transport仍为 `https://cybernote-sync.vercel.app`，以验证旧/新transport跨端兼容。ENROLLMENT_ISSUER仍严格固定为旧Vercel origin。Logto issuer/client/resource/callback、workspace推导、签名key、权限与信任规则不变。不新增运行时URL覆盖或自动降级。

两处Enrollment入口、SDK配置和provider应沿用已独审的transport/issuer拆分。保留既有alias负例和owner/签名校验；必要时补充明确平台固定值的检查。作者执行必要定向回归，Cicero独审。产品文件变化须刷新已审发布manifest pins，父级完整集成后再构建新候选；不得用旧包声称新域生效。

## 运行门槛

源码准备可以并行；在DNS完成、Vercel verified、公开TLS/固定匿名接口/身份配置通过前，不向该主机发送账户授权材料或安装后发起登录。随后仅做一次有界手机CELLULAR匿名native检查；通过后续验真实授权、三端完整正文与附件、中转承载与重启恢复。手机旧账户错误、历史基线和新增附件均保留，不通过清库/改grant/替换历史哈希取得通过。若缺DNS权限，向用户提供准确CNAME/TXT及现有记录保护要求，不重复请求已给出的域名授权。
