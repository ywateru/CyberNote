# Auth crate refresh classification — independent review 02

**APPROVE — 无阻塞项。** 精确提交 `5aef7718800275d6d6c37326f90bb345616094b4`，复审相对 `7e8ddd17bfc75e34344b7d2bbb5210fc2abc8eff` 的 committed 修复。实际变更为 auth crate 的 `lib.rs`、`tests.rs` 和 `types.rs`（后者仅补充 RefreshFailed 语义注释）；未把作者未提交 native/UI 纳入结论。

## 历史 P1 已关闭

[上一轮 P1](../auth-refresh-crate-review01/README.md) 与全部历史文件保持原字节，不改旧 REQUEST CHANGES 或失败反例。新代码仅在 typed OAuth `InvalidGrant` 分支产生 `RefreshFailed`；穷举该 crate 的生产代码，没有其他产生此错误的路径。已移除本地 missing refresh、freshness 不足、spawned task join failure 的泛化用途，分别返回 MissingRefreshToken 或 TokenResponseInvalid。

按原字节复制上一轮 reviewer fixture 到第二个独立 snapshot，结果由红转绿：

| 同一 synthetic response | 新实际结果 |
| --- | --- |
| 400 invalid_grant | RefreshFailed |
| 503 server_error | Network |
| 503 temporarily_unavailable | Network |
| 401 invalid_client | Configuration |
| 400 unknown extension | TokenResponseInvalid |

Fixture SHA-256 `1c3d04d7596ea405df0ad5aeed3e5697efafe780de384b7f9f3d8e7126abeb35` 与上一轮完全相同。它仍验证每次显式 restore 只发一次 synthetic refresh、owner 文件不变、无 revoke/cleanup-required、错误文案无 response-description 内容。没有为了使反例通过而削弱断言。

## 独立 focused 复验

从精确 Git objects 提取新的 committed crate snapshot，完整文件 SHA 保存在 `precondition.json`；先在无 overlay 的原始 snapshot 执行 auth crate library tests，得到 **22 passed、0 failed、1 ignored**。既有 ignored 为 opt-in public discovery/JWKS 网络测试，本次未运行。

再在单独 snapshot 追加原 reviewer fixture，只执行该测试，得到 **1 passed、0 failed、0 ignored**。两命令均 `--offline --locked`，精确命令/时间/设置见 `exact-crate-receipt.json`、`counterexample-receipt.json`。新 committed tests 还覆盖 503 temporary、500 server_error、invalid_client、invalid_scope、unknown、malformed 200、Network/Configuration、任务 panic/join、缺失本地 refresh 和 rotation 后 freshness 不足。作者 typed receipt 的原始副本及 log hash 亦已记录。

## 安全结论与范围

Request(Network/Configuration) 有限透传继续有效；OAuth typed error 和已知 extension 只归约为固定类别，不输出上游 error_description/uri 或 arbitrary extension。Client/request-policy 错误不等同 grant 失效；unknown/parse/other 归 TokenResponseInvalid，不能仅由该分类盲目重授权。服务器错误不被当成成功，也没有自动 replay。

身份 issuer/aud/signature/subject 验证未改。rotation owner 仍先进入状态并持久化，再允许返回成功或验证结果；持久化失败不会交付成功 token，取消 waiter 不会丢失 rotation owner。完整 crate tests 中的 durable rotation、subject mismatch、quarantine、owner-preservation、dropped waiter 和 storage failure 用例均通过。

**批准仅覆盖 committed auth crate 分类修复。** 未来 native/UI 如何使用错误类别、显式 retry、重授权门槛、绑定与生命周期仍需独立精确提交 review；本批准不表示它们已正确实现，也不表示可以把新诊断归属于旧 GUI binary。此证据不是 relogin01 的实际根因证明。

历史归档 hash 和原 committed snapshot hash 前后保持一致。未使用作者共享 target；复用本人独立 target `/private/tmp/account109-auth-refresh-review01-target`，**所有测试进程结束，target 已释放**。未读取未提交 native/UI、修改/重置作者 worktree、接触原库/App/ADB/外部网络、部署或提交。仅写本次新归档及自有临时 snapshot/target。

`fix.diff` 保存精确 committed delta，输出均为 `.txt`；`SHA256SUMS` 绑定除自身外的全部归档文件。
