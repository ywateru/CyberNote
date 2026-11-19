# Settings121 cloud 模块验证回执

日期：2026-11-19。工作树 settings121-cloud；全部修改和提交只发生于此树。实际被测源码的 SHA-256 清单为 [inputs.json](inputs.json)，基线 revision 由清单记录；最终提交 SHA 见交付消息。设计报告 f7bacc6312bd2efce6733d8d5b0c27699637cc3c 与 UI 共享 CSS 只读，不在本树修改。

## 行为与证据

- 旧普通 importArchive 遇撞 ID 重映射，不能双向同步。本模块直接搬运已有 WireVersion、actor 向量、墓碑、sealed payload、附件 ID/hash，并先验证再对 workspace namespace 重新 seal。不同既有 account/P2P workspace 可加入同一个逻辑云空间，8轮双向往返不复制实体；原 workspace/device 和合成 account binding 保持不变。并发 heads 保留；显式解决后显示正文收敛；purge 后重投旧头不复活。
- WebDAV/S3 ETag 和 GitHub Contents SHA 真正控制 PUT。fixture 返回412/409后远端不覆盖，本机不应用；401/403、缺失、服务错误、HTML/JSON错误不会冒充空库。S3 SigV4 通过 AWS 文档向量，fixture 请求覆盖 session token、条件头、中文/空格/+路径。GitHub大于1MiB使用同源raw media并核验Git blob SHA。
- 固定 Argon2id + AES-GCM、随机salt/nonce，错误口令、密文/头workspace篡改均拒绝；错误口令发生在 capture 之前，笔记零写入。响应/请求预算超过时明确错误，PUT前拒绝，不截断。
- 本机状态0600、目录0700；原子替换、字节CAS、无跟随符号链接，损坏和外部修改保留；状态DTO不回传凭据。显式false、0、关闭状态跨重新打开保持。关闭配置取消正在等待的HTTP操作，默认自动同步不请求网络。
- 设置 SQL 直接接受现有事务连接；groupDates=false往返，保留selectedNote/未知本机键、并发heads和回滚，拒绝非事务写入。该测试单独证明 settings_port SQL，尚未接通生产 notes+settings 同一 quiet commit。
- React 中文列表、内联表单、共享 settings121 类/tokens，桌面自有下拉、手机 select；无登录前置。受控client/confirm下验证状态只读、provider草稿、秘密不回填、下拉键盘/内层Escape、确认后同步、提交回执、关闭卸载、单错误面；桌面1200与390浅暗截图无横向溢出。

## 已完成检查

1. `CARGO_TARGET_DIR=/tmp/cybernote-settings121-cloud-target cargo test --manifest-path src-tauri/src/cloud_sync/harness/Cargo.toml --lib --offline --locked cloud`：16 passed，0 failed；只筛选cloud用例，205条无关Store/Session测试未运行。原始输出 [rust-tests.txt](rust-tests.txt)。harness直接编译生产Store/Session/model/cloud模块；HTTP仅127.0.0.1，合成SQLite/附件/设置均位于TempDir，线程/进程清理。未全量Tauri构建，隔离target约1GiB。
2. `node scripts/verification/settings121-cloud/browser.mjs /tmp/settings121-cloud-ui`：7组检查通过，page errors/external requests均空，见 [result.json](result.json)。截图 [桌面浅色](1200-light.png)、[桌面暗色](1200-dark.png)、[390浅色](390-light.png)、[390暗色](390-dark.png)。浏览器驱动加载生产React组件；native client/confirm/committed ports受控。
3. `pnpm typecheck`（实际等效执行 `node_modules/.bin/tsc --noEmit`）：通过。
4. `pnpm version:check`：通过，0.1.0 frontend/Tauri/Cargo一致。
5. `cargo metadata --manifest-path src-tauri/Cargo.toml --no-deps --offline --locked --format-version 1`：通过；Cargo仅新增直接引用现有lock内的sha1/hmac两项依赖，没有重解全锁。
6. `git diff --check`：通过。

## 未建立的事实与整合清单

没有运行真实WebDAV/S3/GitHub账号、CyberBus登录/Noise运行、原生macOS WebKit/Android WebView/IME/录音/实体设备、完整native组合编译、安装包或发布。不把fixture、类型检查或截图当作上述验收。

`engine_tests::Host` 是隔离headless Store驱动器，使用生产合并和媒体代码但不替代窗口quiet Host；不能把它安装为产品适配器。公共文件接线有精确定义，见 [模块README](../../../src-tauri/src/cloud_sync/README.md)：

- 根mod、独立commands.rs、两套cloud_sync_command注册、唯一Arc runtime的manage与关闭。
- CloudHost check/inspect/capture/validate/commit的真实窗口、Token、Store instance、workspace/device和CloudFence；只读完整sync generation accessor，设置generation合并，不能使用application generation代替。
- quiet capture全窗口保存/设置flush与受保护录音/IME策略；receipt_only接收后重新full media + quiet apply，云任务不依赖P2P active。
- 现有Store事务接入settings_port install/capture/apply；最终notes+settings同事务与既有事实事件/已提交回执。
- 唯一前台自动调度器、fresh context、取消/join，Preferences.cloudSync插槽与native confirm；自动本地备份由整合负责。

已接受的共享inbox是持久库事实，关闭云只阻止新传输/新收件；跨workspace冲突的可见分支可不同，UI明确显示冲突并要求显式解决。保护版本最多30，保守保留未知/损坏/旧口令文件而不是自动覆盖；超过预算明确失败。统一32MiB明文/48MiB密文/16MiB单blob预算是本版本能力限制，不宣称无限库容量。

开发中已修复的验证问题：测试驱动初稿调用不存在的renameNote、fixture accepted socket的nonblocking/大包读取、S3加号URI编码、浏览器虚拟入口和表单可访问名称；修复后执行上述最终完整cloud筛选与浏览器检查，无剩余失败。对测试harness的修复不外推到原生平台。
