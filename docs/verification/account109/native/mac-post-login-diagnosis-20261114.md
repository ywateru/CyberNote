# Mac 托管登录返回后失败的代码分析

2026-11-14，Asia/Shanghai。用户直接运行 `mac-72513d12-debug-wrapper-01/CyberNote-Account109-72513d12.app`，确认已完成托管页登录，返回账户页出现上方即时失败和下方通用错误。原进程在诊断时已退出，没有当次 `SafeError`，因此本记录区分明确代码问题、当前连通性与尚未确认的现场原因。

## 现有流程及可能失败点

```text
托管页提交并回跳
  → complete_callback：授权码交换、响应字段/scope、ID-token校验
  → bind：获取资源access token
  → GET /api/v1/account/profile
  → 核对issuer/subject/product/workspace、本地资料库归属
  → 写入binding，更新profile，首次保持paused
  → 已启用时再初始化设备发现、enrollment与同步连接
```

应用 `profile` 只有 `bind()` 全部完成才显示。因此，托管页已结束但应用仍显示登录入口，可以由上述任一步失败引起。缺少 profile 不能单独证明没有完成认证。

| 分支 | 现有证据 / 限制 |
| --- | --- |
| 协调域名不可达 | 原Mac固定 `cybernote-sync.vercel.app`。上一轮有限匿名探测中该域TLS阶段超时，新域和Logto discovery为200；与登录后的profile请求失败吻合，但不是当次原生错误回执 |
| 授权码响应scope等校验 | 旧原库 relogin03 曾实际记录 `codeExchange/scope`；托管页成功提交不能排除此分支。本次未取得对应诊断，不宣称已复现或修复服务端scope |
| 资料库归属 / 服务拒绝 / 响应无效 | bind和服务端均有严格检查。截图没有对应安全代码；不清空资料库或放宽校验来规避 |
| 再次点击登录返回Busy | 旧规则只允许部分未绑定错误重新开始，未含coordinatorProfile；因此该阶段失败后显式重试可被拒绝，顶部通用提示与旧底部错误同时保留。代码路径已确认，现场是否经过该分支尚未确认 |

未绑定账户在认证完成后绑定失败时会尝试撤销刚获得的授权，失败清理另有 `cleanupRequired` 栅栏。已经绑定的账户启动恢复遇到网络失败则保留原授权。这两条路径不同，不应一律提示“密码错误”或“重新登录”。

## 已完成的有限匿名诊断

前一轮工具输出保留于对话，没有保存原始日志文件。本记录是其结果摘要，非新实跑回执。命令只GET公开discovery/health，正常TLS校验，不附带认证或固定IP，不修改系统网络。

| 探测 | 终端现有代理环境 | 显式 `--noproxy '*'` |
| --- | --- | --- |
| Logto discovery | HTTP200，约0.409s | HTTP200，约0.433s |
| Mac旧协调域health | curl28，约5.001s，无HTTP/TLS完成 | curl28，约5.003s，无HTTP/TLS完成 |
| 已授权新域health | HTTP200，约2.946s | HTTP200，约1.368s |

DNS的三域地址均被归类为benchmark-reserved IPv4，系统HTTP/HTTPS/SOCKS代理开关为开启。这只说明当时本机解析与代理环境，不定位超时发生于哪一上游，也不证明Rust或WebKit逐请求路径。公开health通过不证明带认证的profile/enrollment或整个登录通过。

## 源码修正范围

按[修改契约](../../../plan/tasks/app-account109-post-login-errors.md)：Mac与Android统一已授权新HTTP transport，固定旧enrollment issuer不变；账户资料/凭证/公钥请求保留有限失败原因和实际HTTP状态；IPC拒绝使用安全DTO，UI展示本地固定的阶段和原因，并提供可折叠的安全错误详情；未绑定coordinatorProfile错误允许用户显式正常重试，保留grant owner、cleanup和归属栅栏。

| main提交 | 修改与静态审查 |
| --- | --- |
| `6c100207`（作者 `982d669a`） | 原生阶段/请求分类、安全IPC、显式重试及全平台固定新transport；HTTP401/403及响应无效仍立即封闭通道 |
| `c40260a9` | [原生独立静态批准](post-login-errors-native-static-review01.md)，不包含编译、前端或运行批准 |
| `1b59adf5`（作者 `eab330d9`） | 前端有限DTO、固定具体文案、可折叠安全详情、即时操作与账户状态分开显示 |
| `aee68928`（作者 `002220db`） | 修正成功读取相同状态后仍残留读取失败提示的问题；SignIn/Busy动作失败仍跨同状态轮询保留；补充未运行反例 |
| `48933f63` / `4abc38f1` | [前端静态独审](post-login-ui-static-review01.md)，保留初次P2及修正后的批准 |
| `b6677c38` | 仅刷新8个已审产品源码SHA；其余1770个现有清单项不变，没有新增路径或扩展runtime/第三方范围 |
| `53dfd371` / `4d377ef8` | [跨层与来源pin静态独审](post-login-errors-cross-layer-static-review01.md)，DTO、IPC、提示、显式重试及8项pin无阻塞 |

新增界面示例：`读取账户资料时请求超时，请稍后重试。`；HTTP401/403显示服务拒绝账户授权；429显示请求过于频繁；无效JSON/schema显示服务响应格式无效。详情只列白名单代码、阶段和有限分类。原 `codeExchange/scope` 仍独立显示“登录响应的授权范围未通过校验”，不能因换协调域名就宣称该历史问题已修复。

本轮不做真实登录、自动测试、设备操作或重新构建，新增源码不能视为原截图根因的实机确认。旧 `72513d12` Mac包及其身份保持；源码修正必须重新构建后才会出现在应用中。手动验收须记录新的候选身份和实际安全错误，不能将旧候选路径直接改标为新包。

原生、前端及跨层独立静态复核已完成；本轮仅检查源码、Git差异、来源SHA与文档链接。必要反例源码已补但未运行，未声明类型检查、编译、测试或登录成功。主工作区收拢为本地main提交，无远程发布。
