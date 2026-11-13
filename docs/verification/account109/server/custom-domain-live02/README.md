# 自定义域名 DNS、Vercel 验证与双域对照

2026-11-13 UTC。此前 [live01](../custom-domain-live01/README.md)的登录交接已结束。Chrome extension 连接的是 yy profile；父级随后通过原生 Chrome AX 找到 Water profile 已打开的准确目标 zone DNS 页面，现有登录会话正常，未输入凭据或创建访问令牌。直接操作该已登录页面完成此前获用户许可的两条新增记录。

| 类型 | 名称 | 内容 | 状态 |
| --- | --- | --- | --- |
| CNAME | cybernote-sync | 673bb9aa89cda1fe.vercel-dns-017.com | 已保存，DNS only，TTL Auto |
| TXT | _vercel | vc-domain-verify=cybernote-sync.aixgg.com,977eb5d7081b90eba946 | 已追加，TTL Auto |

添加前精确查询cybernote-sync无记录；保存后UI显示对应CNAME行。TXT添加前UI显示anywork/cybergrid/ddj三条独立记录；追加后四条共存，旧三条显示值保持，未编辑/删除任何原记录。截图仅留主机 `/private/tmp/account109-domain-dns-final01.png`，不纳入Git。原先agent创建的无用登录页已关闭，用户现有管理页保留。

父级调用现有Vercel项目精确域名verify API，HTTP200、verified=true、redirect=null、gitBranch=null；有限原始投影见 [vercel-verify.json](vercel-verify.json)。没有新部署、环境修改或项目创建。

[独立公网检查第一轮](../custom-domain-public-review01/README.md)确认DNS、新域可信主机名TLS及三个匿名端点200，但canonical Python连接在TLS重置，整轮仍记FAIL。父级随后单轮换用Node built-in fetch，每域config/JWKS各一次、10秒预算、redirect:error、默认可信证书与主机名检查，四请求200，两个配置响应和两个公钥响应分别原始字节SHA256相等、解析深比较也相等，见 [host-comparison.json](host-comparison.json)。未发送账户凭据、授权头或申请签发enrollment；原Python失败保留，不将失败原因归因于已修复的软件缺陷。独立Node复核另列。

当前证明域名到既有服务的DNS/可信TLS/匿名配置与公钥连续性。实际enrollment的固定issuer仍由已审源码支持，未靠读取秘密或请求新授权验证；新Android包须独立身份核验后才可安装，手机CELLULAR可先只读匿名检查。登录、原库保全及三端中转仍需实际执行。
