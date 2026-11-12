# sync108 native startup

本子任务基于源码快照 `67b35ca5`，只实现桌面启动目录与受管媒体缓存隔离。没有 UI、配对、ADB 或用户已有 App 操作，也没有引入测试驱动。双端/三端业务同步验收由后续任务执行。

## 行为与边界

- 桌面支持 `CyberNote [--data-dir /absolute/path]`，只接受分开的参数和值。空值、相对路径、缺值、重复、未知及多余参数以退出码 2 拒绝，完整解析前不做文件系统 IO。
- 未指定时保留 Tauri `app_data_dir` 和 `app_cache_dir/attachment-thumbnails-v1`。Android/iOS 不解析桌面参数，继续使用平台沙箱。
- 自定义根目录先 canonicalize，再取得根下 `.app.lock` 的 `fs2::try_lock_exclusive` 非阻塞独占锁；锁文件不删除。Store 本身没有进程锁；租约在 `run` 外层持有至 App 事件循环及 Store 释放，覆盖同路径、符号链接别名和 `/tmp` 别名。
- 自定义缩略图缓存位于 `app_cache_dir/workspaces/<SHA256(canonical-root OS bytes)>/attachment-thumbnails-v1`。同根重启/别名复用同缓存，不同根隔离，不使用已有 `root/.cache`。拒绝缓存落在根目录内，避免数据统计、备份/同步输入混入派生缓存。此处“缓存”指现有受管媒体缩略图缓存；没有改变 WKWebsiteDataStore 的浏览器存储策略。
- 自定义根与受管子目录使用 Unix 0700，新锁文件 0600；验证可写后才打开 SQLite。锁、附件与缓存子目录的 symlink 重定向明确拒绝；用户显式选择的根目录 symlink 则允许并统一身份。
- 目录检查和加锁在 `App::run` 之前执行：Tauri 2.12.5 在事件循环内调用 setup 并对错误 panic，故不依赖 setup 返回错误来拒绝非法目录/第二实例。启动拒绝在 stderr 输出 `CyberNote startup rejected:`，目录/锁错误退出码 1。
- Session/Store 和 sync adapter 使用同一个选定根；现有真实受管 HTTP 媒体路径仍通过 Session 授权、Store 登记、受验证文件描述符读取。自定义模式清空默认 asset scope，再仅授权所选根的 `attachments`；数据库、身份与缓存不加入 asset scope。

## 可复跑入口

所有 Rust 命令串行执行，独立 target 使用从既有 main target 克隆的缓存；main target 未被用于本轮编译。

```sh
cd /private/tmp/cybernote-sync108
pnpm typecheck
CARGO_TARGET_DIR=/private/tmp/cybernote-sync108-target cargo test --manifest-path src-tauri/Cargo.toml --lib --locked --offline
CARGO_TARGET_DIR=/private/tmp/cybernote-sync108-target CARGO_NET_OFFLINE=true pnpm tauri build --debug --bundles app --ci --no-sign
python3 scripts/verification/sync108-startup-native.py \
  --app /private/tmp/cybernote-sync108-target/debug/bundle/macos/CyberNote.app \
  --out /private/tmp/sync108-native-startup.json
```

该 `.app` 使用 Tauri build 的生产嵌入前端，可脱离 Vite 服务启动，Rust profile 保持 debug。直接执行包内 binary 可以保留 stdin/stdout 并确实启动两个独立进程：

```sh
/private/tmp/cybernote-sync108-target/debug/bundle/macos/CyberNote.app/Contents/MacOS/notes-clone --data-dir /private/tmp/sync108-desktop-a
/private/tmp/cybernote-sync108-target/debug/bundle/macos/CyberNote.app/Contents/MacOS/notes-clone --data-dir /private/tmp/sync108-desktop-b
```

不使用不带参数的原生 App 验收默认路径，以免打开用户默认库；默认选择规则由独立临时目录单测覆盖。native smoke 只使用新建临时工作区，检查两个真实 PID 各自打开所选 SQLite、持有独立缓存目录描述符、创建受管 HTTP listener，同目录及别名第二进程拒绝，退出后新 PID 可重新打开原 SQLite inode/schema。它只读 SQLite schema，没有直接写业务行；没有宣称完成编辑、媒体 UI 或同步身份验收。所有自有进程 SIGTERM 后等待退出，清理自有派生缓存，记录退出码。

## 本轮验证记录

最终结果见本目录随实现提交的 `results.json` 和 `native-startup.json`。原生报告包含包内 binary SHA256、源码基线与三个 Rust 变更文件 SHA256；基线之后的实现内容由这些哈希绑定。

之前的有效结果：旧缓存布局版本全库 225 passed / 4 ignored / 0 failed；布局调整后重新执行最终全库与原生构建，不能用旧通过代替最终结果。

保留的测试修正记录：首次非 UTF-8 用例试图在本机 APFS 创建无效 UTF-8 文件名，得到 OS error 92 / `Illegal byte sequence`，当次 8 passed / 1 failed。随后把该用例限定为 OS bytes→缓存键的单元边界；不宣称 APFS 支持此类目录。真实规范化、目录权限、文件冲突、symlink、锁释放及媒体 HTTP 均继续使用实际文件系统验证。

后续 stdio 驱动注意：当前前端 debug API 同时受 `import.meta.env.DEV` 与 `VITE_NOTES_DEBUG === "1"` 约束，普通生产前端仅设置后者不会注册 API。后续任务需用 dev 服务或单独测试前端构建条件；本子任务没有放宽该边界。
