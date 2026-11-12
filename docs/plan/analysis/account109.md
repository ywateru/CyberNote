# Logto、CyberGrid与交付调研

2026-11-13。用户授权完整实现登录/注册、同账号多端自动同步、Vercel服务器部署、新GitHub仓库及Actions打包；不得发布本地隐私、过程文件或密钥。

## 已确认的外部事实

- CyberGrid源码冻结`f2a3961536e5c69b13c7dbc661953d9243becbae`，Rust SDK0.3.0、Node协调服务0.2.0；支持Node22/Vercel Functions，同用户/产品发现、TCP映射，Rust连接策略WebRTC→iroh直连→Quick Tunnel，业务内层mTLS。中央Redis不保存或转发业务数据。
- 服务支持显式`CYBERGRID_REDIS_TRANSPORT=tcp`和`rediss://`；用户提供的Redis已完成证书验证TLS认证和PING。采用本应用独立prefix，不能改已有CyberGrid部署或清理其namespace。
- Logto发现issuer为`https://auth.x.aixgg.com/oidc`，支持PKCE S256；给定应用为MachineToMachine，Management API的all授权已实测可用，只用于创建本应用专用Native/SPA/resource/scope/role，不作为原生客户端secret。
- Logto当前托管注册支持用户名＋密码、无需邮件验证；不需要修改全租户登录方法或SMTP。创建应用专用connect权限和默认用户角色，保持已有应用配置。
- 指定GitHub凭据已核对属于ywateru；已有CLI默认登录的是另一账号，发布必须显式使用用户给定凭据，不能误推到默认账号。现有Vercel本地授权可用。
- 原项目HEAD e3b3cc55，工作区干净、无remote；既有历史含大量本机验证/过程文档和素材，不能直接把整个旧历史推到新远程。采用经审计的源码白名单新历史导出，保留本地完整开发历史。

## 分解与创建链

产品契约见[账户架构](../../architecture/account-sync.md)，UI见[账户界面](../../ui/account-sync.md)。模块任务分别负责：服务vendor/认证profile/Vercel入口；原生Logto授权和CyberGrid→现有同步Runtime；前端账户页与设置导航；GitHub净化导出与Mac/Android CI。集成须打破每个fixture边界：真实托管认证→真实部署→SDK同owner发现/端口映射→真实Noise配对→Store/Session正文/附件持久化。

秘密仅存主工作区ignored `artifacts/account109/private/`（目录0700/文件0600）和部署环境/Actions加密secret；公开配置只含issuer、Native client ID、resource和协调HTTPS地址。第三方原代码保留许可/来源pin，不能因用户拥有仓库而移除第三方声明。SDK provider为运行依赖，不混入过程输出；GitHub文件大小和可复现下载/校验策略必须实测。

## 门禁

1. 先记录研究与UI，再在隔离分支实现；静态产品契约发生变化先更新文档。
2. 作者定向测试和不同代理独立审阅；错误归属、取消迟到、退出、跨账号隔离优先于演示成功。
3. Vercel真实健康/Redis/认证探测，两个原生独立数据目录真实同账号自动同步，Android补少量真实场景。不得只复制旧手工配对测试或以假token称真实登录完成。
4. 源码白名单、秘密/隐私/大文件审计通过后创建private GitHub仓库，新的干净历史发布；Actions实际编译打包成功并核对产物，不能仅提交workflow YAML即称完成。
5. 最终报告列明部署URL、仓库URL、Actions运行、版本/源码/产物身份、实际运行覆盖和清理；原数据/原账号应用与旧服务器不破坏。
