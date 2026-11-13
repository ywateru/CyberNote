# ACCOUNT109 刷新错误与显式恢复

2026-11-13。原库 GUI relogin01 在 B 启动时记录 `account_authentication / identityRefresh`，但旧 AuthClient 的 refresh 将全部 OAuth request error 映射为 `RefreshFailed`。此运行不能证明 grant 无效；测试执行器又在读取 subject-only 资料时先断言 username，遮蔽了实际恢复错误。保留原运行，不更写既有 grant、不重置或迁移资料库。

## 授权范围与契约

- 认证 owner 保留网络和固定配置错误的有限分类，区分服务器拒绝与响应解析/校验失败，不泄露提供者响应、token、URL 参数或上游异常串。code exchange 既有分类可作为参考，不因此扩大可信 endpoint。
- 网络故障不等于授权失效，不应要求用户重新授权或删除 grant。服务器真正拒绝与 malformed token 仍不得伪装为成功；refresh rotation 仍须持久化成功后才发布。
- 检查真实 UI 恢复路径，避免只读 `status` 重复返回失败而没有恢复能力。新增或复用的显式恢复操作必须串行、代际受控、有界；始终尊重原 binding.enabled，不自动启用暂停的设备。`status` 无副作用，不添加 token/任意 URL 输入。
- 测试 runner 先记录实际错误，再判断可恢复状态。明确 opt-in 的重新授权仅允许预期初始状态；异步 authorizing 可以保留不完整资料，但 subject 必须不变，终态须完整验证预期账号后才允许 enable。其余错误仍失败，不做无限重试。

## 验证与交付

作者与独立审阅者分离。离线故障测试覆盖请求网络失败、OAuth server rejection、无效响应、成功轮换和授权/暂停边界；不为诊断直接使用原库 grant 发请求。修复经审阅后才能安排新候选与新的实际运行目录。旧 relogin01、full02 超时和原始 DB 保留；脱敏归档不收录凭据或原始数据库。

## relogin04 后的人工授权等待预算

第四轮在新候选中实际进入 authorizing，原生 Chrome 出现登录页；父级浏览器控制会话超时重置，未完成表单，执行器 120 秒授权等待到期。保留失败，不能据此判定历史 scope 故障已解决。原生 callback 本身有 600 秒上限，执行器可增加显式 `--authorization-timeout-ms`，缺省保持 120000，仅接受 120000 至 600000 的十进制整数并写入结果。该值只传入 B 两种 SignIn 与 A SignIn 的终态等待，不改变 B 启动只读 120 秒、连接/数据预算、错误立即失败、严格 owner/username、一次恢复和自然清理规则。不得传入密码、token 或 callback；不启动新实际运行来单独测试等待参数。通过模拟时钟验证上下界、无效输入、三条授权路径预算以及中途错误立即终止，独立审阅后合入。

## relogin02 源码调查（delegated author）

调查与补充离线回归见[responseMetadata 调查](../analysis/account109-response-metadata.md)。本增量只允许 `crates/account-auth/src/tests.rs` 中按现有 README 契约补充负例、正例和调用顺序断言，不改变运行时认证行为或响应容错规则。`responseMetadata` 是 token response 检查，不是 discovery metadata 检查；不得基于名称放宽固定 issuer/endpoint/JWKS、签名或 claims 校验。所有网络响应均使用 test-only fixture，独立 target 编译；不运行 live login、原库恢复或 live smoke。更细诊断字段和任何 provider 兼容性修复仅作为待审提案，须先确定具体失败字段及契约。
