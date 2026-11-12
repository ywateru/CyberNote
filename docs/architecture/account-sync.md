# 账户与跨网络同步

2026-11-13。新增Logto托管登录/注册，以CyberGrid建立同一账号、同一CyberNote产品的原生端互通；保留现有本地编辑、SQLite、版本向量、冲突、Noise和附件SHA同步链。未登录时可继续完整本地使用。

## 配置与服务职责

- Logto可信issuer固定为部署配置的HTTPS issuer，使用应用专用Native客户端，authorization code＋PKCE S256、state/nonce、精确回跳；注册入口进入同一Logto托管注册页。客户端不能包含Management客户端secret。
- Vercel Node22服务采用固定CyberGrid源码版本`f2a3961536e5c69b13c7dbc661953d9243becbae`，Redis通过验证证书的TLS TCP连接。每个环境使用独立namespace；Redis存协调状态而非笔记/附件。
- CyberNote专用API resource提供connect用户scope；专用SPA仅用于服务控制台。Native与SPA静态产品策略限定同一产品，其他Logto应用的token不可加入。
- `/api/v1/account/profile`接受Bearer资源access token，验证issuer/audience/ES384/expiry/client_id/connect和产品允许策略后返回`{schemaVersion:1,subject,issuer,productId,workspaceId}`。workspace UUID由固定服务端随机seed对issuer＋subject＋canonical product的分域HMAC派生；seed必须显式配置，部署后不能随意轮换，不能用请求Host/未验证JWT字段生成账号归属。
- 管理凭据仅供本地配置Logto；运行服务只持Redis和workspace派生seed等必需服务端配置。登录密码只进入Logto页面，不交给CyberNote协调服务。

## 创建链与所有权

```text
账户页 → account_command → 原生账户Runtime
  → 系统浏览器Logto授权/注册 → 原生回跳/PKCE换票 → 验证身份
  → Vercel account/profile → 确定账号workspace
  → CyberGrid Rust Client（官方token provider）
  → 申报本机loopback同步入口、发现同owner/product设备
  → 真实SDK端口映射＋mTLS → 对端私有bootstrap → 自动Noise配对
  → 既有sync::adapter → Network → Store/Session/quiet → 正文/附件提交
```

账户Runtime由App创建一次，独立于设置页的挂载/可见性。设置页只订阅安全状态和提交用户操作；关页不结束同步。每次登录/退出/恢复有代际，取消与迟到结果不可恢复旧账号连接。状态查询不创建身份、不启动网络；注册/登录入口明确启动授权。启动可恢复已持久授权；刷新失败显示需要重新登录，不无限循环或冒称已连接。

同一数据根只可绑定已确认的一个账号，绑定含issuer/subject/product/workspace。换账号不得把已有账号数据发给另一个账号；拒绝不匹配并提供明确恢复说明。退出账户先封闭自动连接和邀请、停止SDK映射及本轮账号同步，再撤销/删除本地授权；本机笔记继续保留。没有明确账号库迁移和冲突保全证明时，不清空同步元数据或偷偷改workspace。已有手工同步workspace不兼容必须明确报告，并保全原库，不能为了通过新测试清数据。

首次为尚未开启同步的本地库登录时，以真实已验账号workspace原子启用现有Store同步schema，保留所有现有笔记并bootstrap。已绑定同账号重启保持workspace/device；多端并发首次登录必须得到同一workspace。自动配对邀请仅通过已认证的CyberGrid peer业务流交换，不进入Redis设备描述、日志、前端快照、命令argv或Git。端口仅loopback监听；不增加未认证公网邀请服务。

自动连接必须与真实应用同步状态区分：已登录、设备在线、TCP通道成立、同步进行、已应用是不同事实。待处理数/冲突/最后成功时间来自原有同步Runtime；目录心跳不等于数据同步成功。断网保持本地编辑，重试有界退避；恢复复用原账号/设备身份和dirty/inbox。手工设备同步入口保留。

## 原生IPC与前端契约

单一`account_command`，请求deny_unknown_fields，操作为`status`、`signIn`、`signUp`、`cancel`、`signOut`、`syncNow`、`setEnabled`。不得提供任意URL/token注入的生产IPC。响应只含安全状态：

```typescript
type AccountStatus = {
  state: 'signedOut'|'authorizing'|'connecting'|'ready'|'paused'|'error';
  enabled: boolean;
  profile?: { subject: string; displayName: string; username?: string };
  devices: { id: string; name: string; online: boolean; current: boolean; connected: boolean }[];
  lastSyncAt?: number;
  pendingCount: number;
  conflictCount: number;
  error?: { code: string; message: string };
};
```

状态不返回access/refresh token、Noise密钥、邀请、管理secret、Redis配置。可选择的错误分类包括登录取消/过期、认证失败、协调不可用、资料库归属冲突和同步失败。返回安全中文操作说明，不能将原始第三方异常/响应串直接显示。命令完成不是网络收敛证明，UI只按实际运行状态展示。

## 验收

真实Logto托管注册→登录、取消/错误state、回跳校验、refresh/重启恢复、退出关闭、跨账号拒绝；同账号两个独立桌面数据目录自动发现/配对，完整中文格式document/plainText与PNG/文件原字节双向一致，离线补齐、并发冲突、重启身份保持；少量真实Android同账号发现/同步/恢复。测试必须说明真实边界，fixture不能替代Logto/Vercel/Redis/CyberGrid和实际原生同步链。服务器验JWT负例、产品隔离、无认证请求、并发workspace一致和TLS Redis冷启动；公开部署健康及真实认证API通过后才称部署完成。
