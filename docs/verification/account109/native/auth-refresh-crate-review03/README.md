# Auth crate HTTP-status constraint — incremental review 03

**APPROVE — 无阻塞项。** 精确审查 `5aef7718800275d6d6c37326f90bb345616094b4` → **`29412dfb1fb1ed4281cdd14d7a5a5db1fe5a9f24`** 的 committed delta，仅 auth crate `lib.rs` / `tests.rs`。未评审作者未提交 native/UI。此前 review02 的批准范围不变；review01 P1、原反例及 review02 全部 hash 保持原样。

## 当次请求隔离与分类

`refresh` 在该次 request 前新建 `Arc<AtomicU16>`，初始 0；仅包装该次 refresh HTTP client call。收到 response 后先存其有限 status，再交 OAuth parser；没有 response 的 Request 错误保留本次 0。该变量不在 AuthClient、共享 PinnedHttp 或全局状态中，discovery/client 初始化在 wrapper 创建前完成，不会将其 status 当作 refresh status。新局部实例防止其他 refresh（包括此前 429）污染本次分类；Relaxed atomic 不承载其他数据同步，写入与分类读取受同一 awaited request 完成顺序约束。

429 或 500–599 在 map_err 中优先归 Network，不依赖错误 body 是否可解析或是否宣称 invalid_grant。OAuth 非200响应不能从 request_async 成功返回。只有 **HTTP 400 + typed InvalidGrant** 归 RefreshFailed；401/302/200/418 的同名 body 均不满足 confirmed rejection。400/401 typed client/request 配置错误归 Configuration；unknown/invalid 默认 TokenResponseInvalid。这里只讨论 crate 分类，不声称未审 native/UI 已正确使用它。

## 本轮只做定向复验

从精确 Git objects 提取新的 crate snapshot，复用本人独立 target，全部 `--offline --locked --exact`：

| 独立测试 | 结果 |
| --- | --- |
| committed `refresh_request_errors_keep_categories_and_owner_until_explicit_retry`（14 种 fault mode） | 1 passed |
| committed `rejected_owner_then_interrupted_reauthorization_can_explicitly_exit_and_sign_in_again` | 1 passed |
| reviewer-only `reviewer_status_is_per_refresh_and_non400_cannot_reject_grant` | 1 passed |

**合计 3 passed、0 failed、0 ignored；没有重跑全 crate。** 作者既有 final receipt/log 的 23 passed、1 ignored 仅作为作者证据保留，不算独立全量复验。

Reviewer fixture 在单个 synthetic client/owner 上按序发起显式 restore：429 invalid_grant → 无 response 的 Configuration → 503 invalid_grant → 400 invalid_grant → 无 response 的 Network，以及其他非400/unknown/client/5xx malformed 情况。14 个错误 mode 的实际归约全部符合预期；特别是 **429 后无响应仍为 Configuration，未串入旧429状态**。503 invalid_client 与500不可解析错误 body 也都 Network。每步只增加一次请求，owner bytes 不变、不 revoke、不误报 cleanup-required、不泄露敏感描述。最后一次显式正常 restore 成功，rotation owner 已落盘。

新增 committed interrupted-reauth fixture 仅通过 synthetic client 验证：真实分类拒绝后显式 logout、授权事务中断、再次显式退出/登录的已有 crate 行为；没有新 production cleanup/authorization 实现。不会替代 native/UI browser 或原库验证。

## 保持的边界

没有更改 issuer/aud/signature/subject 校验、rotation 先持久化再发布的顺序、owner-preservation 或自动重试策略。status 只在内存保留有限整数，不增加任意 URL、响应正文、认证头或上游错误字串输出。精确 snapshot 前后 SHA 未变；历史 review01/02 未修改。

**本次独立 target `/private/tmp/account109-auth-refresh-review01-target` 已释放，测试进程全部结束；未使用作者共享 Mac target。** 未操作原库/App/ADB/外部网络、域名/DNS/deploy、作者未提交 worktree 或 main 产品；未提交。本轮结论不证明 relogin01 的实际根因，也不扩大 review02 到 native/UI 恢复行为。

精确增量、source SHA、作者 receipt/log hash、三个定向命令/时间和有限输出均保留。Reviewer fixture 仅追加到单独临时 snapshot，未写入作者或产品源码；实际代码另存 `.rs.txt`。`SHA256SUMS` 绑定全部归档文件（除自身），文件均可普通 Git 收录。
