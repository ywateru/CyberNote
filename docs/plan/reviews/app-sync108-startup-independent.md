# SYNC108 startup 独立复核（冻结）

审阅时间：2026-11-12（Asia/Shanghai）。审阅对象：`2a34faf00300cebc0b3bb2821bc4998f5de06ea4`，仅相对父 `67b35ca55c3861ee079c054ee1e434d935dff5bf` 的 startup 差异。仓库 `/private/tmp/cybernote-sync108`。未审入整个父快照，未审入随后 native stdio 接线或工作区未提交变更；未编辑源码、暂存区，未编译，未操作用户 App 或设备。

## 结论与阻塞

- **startup 产品实现：未发现静态 P1/P2 阻塞。** 已按参数先拒绝、canonical alias 排他、缓存隔离、asset scope、移动端分支和锁生命周期逐项检查。
- **验证工具有 P2：清理异常可能保留 passed:true，且清理信号记录不实。** 建议 Mendel 修复后再将该脚本作为正式门禁；不需要因此判定冻结的产品实现失败。
- 独立执行来源已核对的现有测试二进制，仅 `startup::tests::`：**9 passed / 0 failed / exit 0**。这不是 Android、双端同步、原生 UI 或完整产品验收通过声明。
- 原先 APFS non-UTF8 EILSEQ 失败用例已在本 commit 改为**纯路径字节到缓存键映射测试**，没有再尝试创建非法名称。

## P2：原生 startup 脚本不能可靠判定异常清理

文件 `scripts/verification/sync108-startup-native.py`，冻结版本行82–93、130–140。

`stop()` 遇到退出超时会 SIGKILL，但无论原本已异常退出、SIGTERM 正常结束或 SIGKILL 兜底，均写 `cleanup = "owned SIGTERM; waited for exit"`；未将提前退出、强制杀死作为失败。主流程行130在 finally 清理之前设置 `passed = True`。因此“启动检查已成功、子进程随后崩溃”或“子进程无法被 SIGTERM 关闭、需要 SIGKILL”仍可能写出 `passed:true`；清理异常时也可能留下已赋真的报告。

最小修复：stop 记录清理前进程状态、实际发送信号、强杀与最终退出；重复 stop 必须保留首次清理事实。对子进程意外退出、强杀和清理错误制定明确失败条件；先汇总检查与清理，再计算最终 passed。lsof 子命令亦应加 timeout，避免20秒外层期限被单个无界子命令绕过。修复由 Mendel 执行；本审阅不改脚本。

冻结证据 `docs/verification/sync108/startup/native-startup.json` 中三次退出实际均为 `-15`，未见 SIGKILL 证据，且 owned cache 均报告已移除。**本发现是脚本可产生错误结论的缺陷，不将已有三次运行追溯认定为异常退出。** SIGTERM 退出也只能证明操作系统回收进程资源，不能证明执行了 Tauri 正常退出回调及全部 Rust 析构。

## 产品实现逐项复核

| 项目 | 冻结代码依据与判断 |
|---|---|
| 参数错误先拒绝 | `lib.rs:599–606` 在 generate_context/build/目录访问前 parse 完整 argv；`startup.rs:18–39` 拒绝未知参数、空/相对路径、重复项及缺值。返回码2。测试覆盖参数后半段错误不创建前面已指定目录。仅支持分离形式 `--data-dir /absolute/path`。 |
| 同目录及 alias 锁 | `startup.rs:61–85` 先 canonicalize，再打开固定 `.app.lock`，Unix O_NOFOLLOW/O_CLOEXEC、常规文件检查与 fs2 exclusive lock。锁文件不 unlink，避免同路径换 inode 绕过。锁随 Workspace File 持有；同路径和 symlink alias 被拒绝，drop 后重开成功。 |
| 默认/自定义缓存 | 默认仍为平台 app_cache_dir/attachment-thumbnails-v1。自定义为 canonical 平台 cache/workspaces/SHA256(所选 canonical root 原生字节)/attachment-thumbnails-v1；拒绝 cache 位于数据根下。不同根不同桶，alias 同桶，旧 root/.cache 不复用。缓存桶、attachments 与 lock 的重定向被拒绝；目录 mode0700。 |
| 当前库 asset scope | `lib.rs:607–611` 自定义模式清空原默认 AllowedPaths；`649–655` 仅追加当前 canonical root/attachments 递归读权限；Store、sync adapter、MediaRuntime 使用同一选定根和缓存。默认模式保留既有默认库 scope。静态核对，并未独立运行真实 WebView 的拒绝访问测试。 |
| Android | `lib.rs:604–605` mobile 只用默认 Options，不解析桌面 argv；app_data/cache 仍由平台 API 取得，新增同库 lease 使用 Unix/fs2 路径。未运行 Android 编译或设备，本结论仅为分支与路径静态审阅，不能冒称移动端执行通过。 |
| 锁释放 | 失败返回时 File 自动 drop；Workspace 被 outer Arc/OnceLock 与 setup 捕获持有，无 Store 存活时提前释放的显见路径。已核对 Tauri 2.12.5 App::run 的实际契约：不返回并最终 process::exit；`lib.rs:923 drop(workspace)` 不能作为生产正常析构证据。真实进程结束后由 OS 关闭 FD 释放锁，单元测试验证 drop 释放，冻结 native smoke 验证退出后同根重启。建议把613–614注释改为“整个进程生命周期持锁”，避免声称 App/Store 析构完成后才执行显式 drop。 |
| 非UTF8测试 | `startup_tests.rs:243–255` 用 OsString::from_vec 构造 /a\x80 与 /a\x81，先确认 lossy 显示相同，再断言 cache key 不同；完全不调用文件系统创建这两个名字。已修正原 APFS 用例。 |

同目录 lease 适用于升级后的 App；不对未采用本机制的旧进程或刻意破坏私有目录的同权限程序宣称全局排他。

## 独立测试及来源证据

不执行 cargo，不与 Mendel 共用 target 编译。源二进制：

`/private/tmp/cybernote-sync108-target/debug/deps/notes_clone_lib-d647b52ea69753bb`

复制到独立位置再运行：

`/private/tmp/sync108-startup-review-2a34faf0/startup-tests-frozen`

源复制前/后与副本 SHA256 一致：`88d134f0b3e1d5c5c420c1f1540fb0ca5e28689ebecc70a4426a6842dafc67a2`。绑定依据包括 `/private/tmp/sync108-final-rust.log` 的确切 Cargo 运行路径、depfile 中 startup 源路径、fingerprint features=[]（不含后续 sync-e2e），以及冻结源文件 SHA。该绑定是本地构建日志/依赖/源文件的交叉核对，并非外部签名构建证明。未将后来修改的 lib.rs 误当成冻结源。

冻结 startup 源 SHA256：

- lib.rs：`a6e6cf6f072bb4cf4dcd94db433244102a884640f7613a356d53c2d0f65b9309`
- startup.rs：`4a2e7fd7abe340dd2906df75e1e966819de268605cc71ca0dd4cd2529f5b35f8`
- startup_tests.rs：`ae5021ad02c9445f660ac6ef6e72c423bbb9f8ccd061d1095cca3f089e3004ba`

命令：`startup-tests-frozen startup::tests:: --test-threads=1 --nocapture`。2026-11-12T11:18:26Z 完成；进程耗时0.087秒，Rust报告0.06秒；exit0，无超时，9通过、222过滤、无失败。包括真实 Session/Store/MediaRuntime 的注册媒体与缓存隔离测试；仅使用测试创建的临时库、临时缓存和 loopback fixture，不打开用户库。

独立证据均保留于 `/private/tmp/sync108-startup-review-2a34faf0/`：`binary-provenance.json`、`tests-list.stdout`、`tests-list.stderr`、`tests-run.json`、`tests-run.stdout`、`tests-run.stderr`。旧 `/private/tmp/sync108-startup-final.log` 的8通过/1 APFS失败属于较早运行，不能与后续9通过结果互相覆盖；本次使用独立路径保留新结果。

冻结 native evidence 的 app SHA 为 `3795e8544f8621f2ca16af130ce3e80339bd1434f5ea92cdce35813d52ee5568`，其源 SHA 与 commit blobs 一致。本审阅没有重新运行 native app，不把作者的227通过/4忽略全套结果说成独立执行。已有浏览器 startup 长挂诊断另见 `/private/tmp/sync108-startup-diagnosis.md`，不被此 Rust 结果覆盖。
