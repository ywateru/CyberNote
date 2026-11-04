# Mac sidebar build05 — exact source delivery

准确来源 `093986d170ef279fbce0f66e59891fd5f94aecad`，侧栏源码任务提交393624d；产品toolbar SHA256 `0b9604a73df6f2b1756cfd8489fff133a97c2cc3810df67372ec5ab878067da5`。此目录为本次新构建；未复用旧Mac04包。

root授权 `../root-authorization-mac-sidebar-build05.json` SHA256 `10dc74c888702d06a7dfa568c13db8e18f5b9d56d0bf35a9a4147ce9dccb01bb`，root预先执行并审查的 `input-freeze.json` SHA256 `1060739979cefa530c3f9a50debb32091c6e5f72e7da98c6294ba4b70e42d1fe`。238产品aggregate `c888cc902f9f05da636c827c2b030200732967bcfd4fb52743000e877333bc60`，302完整输入aggregate `aa8a862312b923f56bb4046dbacd780175a79bf080991647a38e5d121392ea28`。

## Attempts and preservation

`mac-attempt01/result.json` 为默认执行权限下的原始失败：`PermissionError(1, 'Operation not permitted')`，exitCode null，无build.txt、无ownedProcessGroup。canonical monitored在创建日志和命令前先执行进程列表安全检查，故本次没有启动pnpm build。此前固定.app和dist已经按流程原子保存于 `mac-attempt01/prior-outputs/`，完整保留；全部15项输入比较仍true。未删除、重写或用旧包收集。

root明确授权相同auth/freeze的新attempt02执行权限重试，使用原canonical run-build.py，`--attempt attempt02 --exclusive-target-and-cache`；工具未改。命令固定 `pnpm mac:build`，CARGO_NET_OFFLINE=true、CARGO_BUILD_JOBS=2，源码/依赖/缓存保留；未下载或清理。构建600秒上限与2GiB磁盘/自有进程组护栏保持。attempt02构建exit0，耗时47.791秒；所有15项输入比较true、supplemental unchanged，ownedGroupStopped=true、remainingOwnedGroupMembers为空。保留Vite现有大chunk提示。

同auth/freeze的canonical collect-outputs.py收集attempt02，`mac-attempt02/collection/result.json` 为ready=true。collection全部15项输入比较true、supplemental unchanged，原始包保持完整。执行前空闲75,733,549,056 bytes，构建最低75,701,473,280 bytes，交付后仍约75.67GB。

## Exact deliverables

目录：`artifacts/unified-candidate06/mac-sidebar-build05/mac-attempt02/`（相对项目根）。

| 产物 | 字节 | SHA256 |
|---|---:|---|
| mac-original.app/Contents/MacOS/notes-clone | 16089104 | 77e110e5446634671d4c6aa42f603f9b7b1e30e43630e8171514a9e77898029f |
| mac-sealed.app/Contents/MacOS/notes-clone | 16013696 | 333b356ab62a0f0c55a8f67c9d7bc51bf424eb1f37dccdcb40f4b9b140bc7be7 |
| mac-original.zip | 4822038 | 943c9a2a82acddf3fc31e5429f6a447c0f9fae338778f0e6a20c1f3121c2e898 |
| mac-sealed.zip | 4751569 | ff3317642232bc1ae6aace93f910c5754b032ea086590649409790eb008d1898 |

原始链接器adhoc签名的严格验证exit1：code has no resources but signature indicates they must be present；原始结果、包、ZIP完整保存。独立派生mac-sealed.app本地adhoc签名后deep/strict exit0；仅可执行文件签名与CodeResources发生变化，preservedOriginalUnchanged=true。两包的bundle文件树、aggregate、ZIP/可执行文件identity均在canonical collection result中。

build nonce `99cc5f9969b14244b23ac43182bb2424`；build result SHA256 `c17d4f8a5b5228003e5887e411136fefe3807127204f6a8d3a0cac5aa55cc1d8`。`delivery-manifest.json` 封口当前run及artifact全部文件（自身除外），由不同作者独立产物核对。

## Limits

这里只完成准确Mac构建、原始产物保全和派生包本地签名。没有DeveloperID、公证、TCC、启动/安装、GUI、运行时交互、重启持久化或像素验收。root后续对准确sealed包进行真实窗口验证。没有运行Android，待root单独审查新Android freeze并明确授权。整个过程未修改tracked inputs、暂存或提交；普通OS PermissionError是执行权限边界，不是自动审批拒绝。
