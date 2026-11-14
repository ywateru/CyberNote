# 原资料库应用内登录、退出及重新登录

2026-11-14，Asia/Shanghai。按用户提供的测试账户，在原先出现 `account_owner_workspace_mismatch` / `account_busy` 的默认资料库上验证新包。密码仅用于托管登录页面，未写入仓库、构建日志或结果文件。

## 精确候选

- 源码：`bb8014cec2c79dcfb16521576dbfd39374975f60`，构建时 main 干净、锁文件不变；包含最终原生及 UI 独审批准的产品源码和16项已核对来源pin。
- 包：`artifacts/account109/mac-bb8014ce-debug-01/CyberNote-Account109-bb8014ce.app`。
- 包内 executable SHA256：`6a6482ead08ba9a796f4d1bed4f33e50046ab5b7f21ef9102e98496e5e559fe2`，203,569,280 bytes，arm64。
- 本地 ad-hoc 签名 debug/E2E 候选，整包 deep/strict 验签及独立身份核验通过，未公证。前端内嵌 `mode=production` 不是原生 release 声明。
- 使用原默认资料库，未传 `--data-dir`。旧 `027501e7` 包通过正常退出关闭；新包通过 `open -n` 打开，最终进程 PID `40179`，路径实核为上述新包。

## 实际结果

| 操作 | 结果 |
| --- | --- |
| 原库应用内登录 | 托管页输入测试凭据，经回跳返回账户页，显示测试账户；状态“同步已暂停”、开关关闭，无归属或 Busy 错误 |
| 确认退出账户 | 返回未登录，当前 `binding.json` / `grant.json` 均不存在；本机内容保留 |
| 再次应用内登录 | 可重新发起授权并完成登录，无 Busy 死端；最终仍已登录、同步暂停、开关关闭 |
| 内容与附件保全 | 首次登录、退出、再次登录后及最终分别比较，184条笔记、18个文件夹、189条附件的完整 SQL 业务行摘要一致；189个原附件文件集合、长度及 SHA256 全部一致，共317,349,937 bytes |

旧默认库存在手工同步配置，且验证开始前没有当前账户 binding/grant。新行为未以删除数据库或旧协议数据规避问题；登录时暂停旧手工网络，当前账户合并未开启。最终应用留在账户页，便于用户继续手动验证。

验证前正常退出旧进程后，保存了私有 SQLite 备份及业务行/附件摘要；附件未另作完整复制，原文件保持。该私有基线与逐阶段比较记录在 `/private/tmp/cybernote-account109-library-independent-baseline-20261114-01`，不提交用户数据库或附件。构建、封装及启动登录回执在新产物目录的 `build-record.json`、`packaging-receipt.json`、`launch-login-receipt.json`。

## 回归与边界

最终源码的[原生定向验证](../account-independent-native02/README.md)为账户52/52、workspace adoption14/14，另执行现有 production release consumer 的重复/漏收通知检查；[UI独审](../account-independent-ui-review01.md)记录42/42及恢复指引增量3/3。数字按各自过滤范围记录，不合计为唯一用例总数。完整原生[静态批准](../account-independent-library-native-review05.md)保留此前阻断及修正历史。

实际使用用户提供的单一测试账户，两次登录及一次退出均通过。不同账户 A→退出→B→退出→A、离线恢复、旧协议隔离、迁移回滚和多窗口通知保全由定向回归及静态审查覆盖，不宣称本次已完成多个真实账户或真实双窗口验收。原库未开启合并同步，也未执行双桌面、Android或4G中转验收；完整场景继续按[手动指南](../../MANUAL-TESTING.md)执行。
