# Auth crate refresh classification — independent review 01

**REQUEST CHANGES — P1。** 精确审查 `7e8ddd17bfc75e34344b7d2bbb5210fc2abc8eff`，父提交 `5a42891787272b0448c39d6b28f4063d0d18382f`；仅 `crates/account-auth/src/lib.rs` / `tests.rs` committed delta。通过 Git objects 提取独立 crate snapshot，逐文件 SHA 保存在 `precondition.json`。未读取作者未提交 native/UI 差异、未修改/重置作者 worktree。

## 阻塞发现：ServerResponse 仍被全部当作 RefreshFailed

`lib.rs:591` 的 `RequestTokenError::ServerResponse(_) => AuthError::RefreshFailed` 丢弃了有限 OAuth error 类型。该 variant 的公开文案仍指向重新登录；如果后续 native/UI 将它作为 grant 已被拒绝的依据，会对 temporary/config/unknown 故障错误地进入重授权。**当前 commit 不能为该恢复门槛提供充分分类。**

在完全独立的 reviewer test snapshot 中追加一条测试，production 源码与该 commit 完全一致，使用已有 synthetic Fixture/responder；五种情况都执行完成：

| Synthetic response | 实际分类 | 应保留的区别 |
| --- | --- | --- |
| 400 invalid_grant | RefreshFailed | 只有明确 grant 拒绝可成为有限 rejected 分类 |
| 503 server_error | RefreshFailed | temporary/network，不证明 grant 无效 |
| 503 temporarily_unavailable | RefreshFailed | temporary/network，不证明 grant 无效 |
| 401 invalid_client | RefreshFailed | client/config，不证明 grant 无效 |
| 400 unknown extension | RefreshFailed | unknown/response-invalid，不能盲目重授权 |

反例 exit **101**、1 failed，是有意的安全要求断言失败；五条结果及断言保留在 `counterexample.stdout.txt` / `.stderr.txt`。每个失败 case 都另验证仅一次 refresh、原 owner 文件未变、未 revoke、未进入 cleanup-required、敏感 response text 不出现在错误文案。多个 case 是合成内存 responder，不是外部网络请求。

建议由作者使用 typed OAuth error 分支归约到有限枚举：只有确认的 `invalid_grant` 使用明确 rejected 类型；`server_error`/`temporarily_unavailable`（包含 HTTP 503 fixture）归 temporary/network；`invalid_client` 及相关 client/request-policy 错误归配置；unknown/parse/invalid response 默认不触发 SignIn。不要保留原 error_description、error_uri 或 arbitrary extension text。

此外，**现有通用 RefreshFailed 还用于本地缺失 refresh 或最终 access 不可用**，并不总是 OAuth 拒绝。若下游要依据分类决定 replacement authorization，需明确 typed rejected 与这些未分类状态；仅修这一条 match 而把所有其他 RefreshFailed 也当 confirmed rejection 仍不充分。HTTP status 与 typed body 的冲突/无效响应也应安全归类，不能通过自动重试或放松认证解决。此报告提交 P1 给作者/parent 处理；未自行修改产品。

## 已确认保留的行为

此改动的 Request 分支正确保留 PinnedHttp 产生的有限 Network/Configuration；Parse/Other 成为有限 TokenResponseInvalid，没有转发上游正文。所有 server 错误仍返回失败，没有伪造成功。JWT 认证与 owner 校验未改。

`refresh` 仍先保留新 rotation owner、标记状态、`persist(state)?`，再返回验证结果；token handoff 在其后。持久化失败不会发布成功；取消 waiter 时 owner 仍继续完成持久化。相关既有 tests 通过，包括 rotation persistence failure、subject change、quarantine 和 dropped waiter；没有发现该 committed delta 放松这条顺序。

## 精确复验与隔离

作者 receipt/log 记录 21 passed、0 failed、1 ignored；receipt 精确副本和两原件 SHA 已保留。独立复验在未加 overlay 的 committed crate snapshot 上得到同样 **21 passed、0 failed、1 ignored**。ignored 为既有 opt-in public discovery/JWKS live test，本次未运行。

随后仅在第二个自有 snapshot 追加 `reviewer-counterexample.rs.txt`，运行该单条反例；原 committed snapshot 前后仍匹配全部 SHA。两个命令均 `--offline --locked`。精确命令、时间和环境见 `exact-crate-receipt.json`、`counterexample-receipt.json`。

没有使用或等待作者共享 Mac target；本次独立 target 是 `/private/tmp/account109-auth-refresh-review01-target`，**测试进程均结束，target 已释放**。未访问原 store、grant、App、ADB、外部网络或部署；没有原始账户身份/凭据进入归档，没有 commit。

此 finding 是静态代码加合成反例，**不等于 relogin01 的实际 auth/transport 根因**，也不评审作者未提交的 native/UI 分类/恢复实现。后续精确修复提交需再审。

`SHA256SUMS` 覆盖本目录全部文件（除自身），输出用可普通 Git 收录的 `.txt`。
