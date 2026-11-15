# 账户同步代码归并与工作区清理

2026-11-15。按用户要求整理相关代码、清理空间并提交本地 `main`。本轮开始于 `df3612ea7e6a3a208b3ddaea205d76babaf88ef9`，主工作区无未提交修改。产品功能与双客户端验收结论仍以[交付结果](../RESULT-LATEST.md)为准；本轮没有构建、启动客户端、登录、同步或重复执行功能测试。

## 归并检查

盘点 32 个 account109/account110 工作树，全部 tracked / untracked 干净。先按补丁等价比较，再由原作者与独立审阅者核对不能直接判为等价的历史提交：

- 旧 native 的 `92c6ffb9` 已由 `61c3f934` 集成；产品及证据一致，任务文档存在后续增补。
- refresh 分类的 `7e8ddd17`、`5aef7718` 已经 `99198fd6` 汇总集成，后由 `35ebf385` 加强状态约束；不恢复旧分类逻辑。
- 旧 UI 的七个提交均有对应集成版本；relogin-test 的七个提交已分批汇总到 main，随后继续演进。未发现遗漏产品代码。
- 找到两份未入 main 的历史审阅文档，已分别 cherry-pick 为 `5bc5aaa2`、`21221dc8`：[原生取消期限历史发现](../../../plan/reviews/app-account110-native-checkpoint-01.md)、[单次 Push 续验工具审阅](../../../plan/reviews/app-account110-push-continuation-01.md)。前者补齐 native review01/02 的原有引用，其阻塞已由[后续原生审阅](../../../plan/reviews/app-account110-native-02.md)关闭；后者仅批准当时的工具，不另行宣称真实运行通过。

清理保留所有具名分支和共享 Git 对象。三个已在 main 祖先链上的 detached HEAD 仍由 main 可达；另一个 detached HEAD `18d0ae28` 新增 `codex/archive/cleanup01/cybernote-account109-token-diagnostics-review-01` 引用，避免移除工作树后丢失可达性。[清理前盘点](inventory-before.json)记录精确路径、HEAD、分支与补丁比较结果。

## 实际清理范围

1. 使用 `git worktree prune` 清理 46 条失效登记，仅清理 Git 元数据，没有删除这些路径中可能残留的普通目录。
2. 移除 32 个已核对的账户工作树副本。移除前重新确认 HEAD 未变化、无未提交内容，并以 `lsof` 检查无打开文件；依赖和 JNI 符号链接不跟随删除。
3. 删除闲置的 `/private/tmp/cybernote-account109-mac-ec4348c6-target-01`。原构建作者确认不再持有；独立 App、APK、源码和回执均在缓存外，目标目录仅有可再生 Cargo / Android 编译输出，账面约 17 GiB。
4. 删除 `artifacts/account110/mac-9e8a4011-debug-01/notes-clone` 这一份旧原始可执行文件，207,259,712 字节，SHA256 为 `81d78e4c1a85acc9bda35ae5970d8c9e41b4697bd2ea377accdf6df9617a4024`。原签名 App、历史校验清单和失败结果保留；原始与签名文件的关系已由该包历史独审确认。历史清单仍保留已删除原始文件的条目。

工作树内 73 组未入库的历史输出（440 个文件、15,394,073 字节）通过同盘重命名集中到本地主树的 `artifacts/account110/workspace-retained01/<原工作树名>/…`，包括构建请求、旧运行输出和 UI 检查记录。它们继续被 Git 忽略，未把原始日志、授权或资料库内容加入提交。[操作回执](cleanup-actions.json)列出逐项迁移与删除路径；生成资源、依赖链接和编译中间文件随工作树移除。

## 保留与核对

- 当前 `29c87810` 签名 App 及独立包输出保持；清理前后 executable SHA256 均为 `96192c49b6abcc9b689dad895203455c7ceefa713d2e17e15c7379ca85c7ef42`。旧 `9e8a4011` 签名 App 的清理前后哈希也相同。
- 最终手测目录 `/private/tmp/account110-device-actions-staging-fix-fresh-live03/desktop-a`、`desktop-b` 均保留。启动器路径不变，见[手动测试指南](../MANUAL-TESTING.md)。原用户资料库 `/Users/water/Library/Application Support/com.local.notesclone` 不在清理范围。
- 已归档的首次超时、成功续验、包身份及审阅证据保持。首次 `NATIVE_TIMEOUT` 的原因仍未确定，不由本次清理改写。
- 三个旧 sync108 工作树及其他任务缓存不在本轮账户工作树移除范围，未删除其未跟踪文件。主树依赖、`dist`、所有签名 App / APK 和其他历史包保留。
- 本轮相对 `df3612ea` 仅增加文档和清理回执，产品代码、测试工具、平台配置及锁文件均无变化。独立收尾检查结果见[复核记录](REVIEW.md)。

## 磁盘观测

| 项目 | 字节 | GiB |
| --- | ---: | ---: |
| 清理前可用空间 | 9,656,393,728 | 8.99 |
| 清理后可用空间 | 55,989,755,904 | 52.14 |
| 观测增加 | 46,333,362,176 | 43.15 |

数值来自同一文件系统的 `statvfs` 可用块，不把目录账面大小相加当作实际释放量；APFS 共享块和并发活动会影响观测值。此次与[前轮五份原始文件清理](../native/owned-originals-cleanup01/README.md)分别计量，不累加宣称唯一总释放量。仓库未配置 remote，因此提交在本地 `main`，没有远端推送。
