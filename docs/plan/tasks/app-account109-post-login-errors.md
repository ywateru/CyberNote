# 登录返回后的错误分类与桌面协调地址

2026-11-14。用户确认托管页登录已完成，要求检查后续代码并具体显示错误。按现有手动验收安排，本轮修改和独立静态复审，不启动自动测试、构建、设备或真实登录。

## 已确认与尚待确认

原 Mac `72513d12` 的流程是回跳 → 授权码交换/身份校验 → `bind()` 请求 coordinator profile → 校验资料库归属并保存 binding → 按原 enabled 状态启动同步。托管页结束不等于上述步骤全部成功。

上一轮匿名探测中，登录服务 discovery HTTP200；旧桌面协调域名 TLS 阶段约5秒超时；已授权的新域 HTTP200。Mac 仍固定旧 transport，Android 已固定新域。截图没有原始安全状态，不能据此认定当次精确错误；旧 `codeExchange/scope` 校验失败亦保留为可能分支。

代码还存在两个明确缺口：HTTP请求/服务状态/无效JSON丢失细分原因；账户IPC rejection被前端统一改写成网络提示。未绑定账户在 `coordinatorProfile` 失败后的再次登录会被 `authorization_mode` 拒绝为 Busy，旧错误仍显示，可能形成截图中的双重提示。

## 修改契约

1. 所有原生平台的 coordinator HTTP transport 固定为已授权 `https://cybernote-sync.aixgg.com`。enrollment issuer 保持 `https://cybernote-sync.vercel.app`，不新增运行时地址、降级或证书例外。
2. `SafeError` 可选新增 `requestReason`，仅限 `timeout|connect|request|responseBody|httpStatus|invalidResponse`。适用于 `account_network` 或 `account_authentication` 的 coordinatorProfile/Enrollment/Jwks 阶段，HTTP状态仅由实际响应产生；`httpStatus` 只与 `requestReason=httpStatus` 成对出现，范围100～599且不能是2xx。401/403仍为认证拒绝，其他非成功HTTP响应保留网络类与准确状态。不能返回第三方原文、地址、请求头或正文。
3. account IPC 的拒绝返回固定 `SafeError`，可信窗口检查保留，窗口拒绝使用固定 `account_window_invalid`。前端只识别严格白名单形状及组合，未知IPC异常保持固定说明，不显示上游 message。
4. 用户错误文案由本地表按阶段和分类生成：回跳监听/接收、登录服务、账户资料读取、设备注册、授权凭证/公钥、刷新、撤销。明确区分超时、连接失败、响应读取失败、HTTP拒绝/限流/服务错误、响应无效及 token字段校验。附折叠“错误详情”，只列白名单 code/stage/reason/providerReason/tokenOperation/tokenField/requestReason/httpStatus，不能显示 profile、URL或凭据。
5. 仅在无profile、`coordinatorProfile` 网络/认证失败时，允许用户显式重新开始正常登录；不允许自动轮询重登、replacement logout 或静默启用同步。原grant owner的Busy/cleanup栅栏继续生效。存在profile的恢复仍复用已有授权，保持暂停设置。UI与native规则一致。
6. 重试触发的IPC Busy等即时错误应显示其固定原因，不能与旧status错误混淆；后续状态真正推进或错误已变化时清除旧即时提示。不得因每次同错误轮询就丢掉当前即时失败。

作者分工：Huygens修改native/config及native反例源码；Socrates修改前端、DTO/辅助报告与前端反例源码；Feynman/Cicero独立静态复审。使用既有干净工作树新分支，不复制target或大目录。最终由父级合并，准确刷新相关发布来源pin，文档明确“源码已改、未构建/未运行”，不改旧候选身份或既有失败。
