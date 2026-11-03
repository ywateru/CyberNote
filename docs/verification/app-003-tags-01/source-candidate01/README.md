# APP-003-TAGS-01 source candidate01

状态是 **SOURCE-CANDIDATE / pending-review**，尚非 SOURCE-READY。产品与验证源码冻结待独审；没有平台安装包、手机实机或像素一致验收。基线 `369637be8c0f5b7ed2bd29aa6973b7b19b488e02`。作者隔离树 `/private/tmp/apple-notes-tags-01`。已整合 root 的 `1b1ec09`、`3b8e8b0`，并精确读入 `42eae28` 的 architecture/research/task 内容；未覆盖自己的 task implementation decisions。

实现覆盖真实 `noteTag`、空格提交、整跨度失效清理、纯授权文档投影、侧栏/单标签/所有标签、与文本搜索组合、沿用 SearchEditorHost 停车、最后引用消失空态、访问 prepare 降级名称与标签/锁定互斥。Rust 共享 validator 继续服务 save、visible decrypt、unlock 与完整归档入口。没有持久明文标签索引、依赖更新或平台整包输出。样式为工程候选，不能当作原版数值。

## 已执行验证

| 检查 | 结果与实际边界 |
| --- | --- |
| `pnpm typecheck` | pass，最终输出保全 |
| `node scripts/check-editor-schema.mjs` | 实际生产 factory 及两个相对模块链，96 个案例，manifest 一致 |
| `node scripts/check-editor-actions.mjs` | 真实 schema/state/history 桌面既有表格动作回归 pass |
| `node scripts/check-access-boundary.mjs` | 16 个生产访问响应边界 pass；并非真实多窗口 GUI |
| `scripts/check-tags-browser.mjs` | 真实 NoteEditor + 真实 App，27 项通过；隔离 headless Chromium，仅 localhost，外部请求阻止 |
| 真实 Store/Session harness | 40 passed / 0 failed / 2 ignored，96 个 corpus 经完整 archive import/export/reopen，拒绝保旧文件/设置/数据库 |

`browser-result.json` 保全 27 项结果，包括输入/粘贴、Undo/Redo、内部改字、分段、链接/代码格式优先、前后光标边界、两个 Editor、受控 composition 事件、已锁定与只读禁止提交、授权投影/prepare 同名计数、真实 App 最后引用空态/停车/恢复同实例历史、搜索叠加/清除、删除恢复、普通目录清除条件。最终失败注入使平台安全 ID 提供者抛错，走实际 registerSaveIntent 的错误路径；未替换 App 的 onChange 或保存队列。正文和标签保留、显示错误、未发生持久写入。

Rust 的新增生产 Store 测试实际 save/reopen、坏跨度保存拒绝保原 revision/正文、含标签 lockNote 拒绝保原数据、完整导出与重复 ID 导入、坏归档原子拒绝、旧普通 # 文本锁定/关闭锁定/解锁、锁定 save 含标签拒绝、正确密码解密含标签密文拒绝且不发布 key/不改密文、未知密码归档保全原密文。既有其余 Store/Session/归档恢复测试也运行。两个 ignored 是归档与附件操作的独立 subprocess crash worker（由各自主恢复/边界测试执行），详见原始日志。

## 必须审查的已知风险

**已有标签内部真实 IME 改字的中途保存合法性未完成。** 扩展在 composing 中不清理 mark，在实际 compositionend 后清理；既有 Editor onUpdate 仍可能把临时不一致的 tag span 送到 Rust，导致可见保存错误。当前 27 项只证明受控组合事件期间不提交新标签、结束后可提交，不证明内部 preedit 的保存合法性。root 已要求先冻结，再由独审精确复现并决定阻断；不能以最终重试成功替代此边界。不要将本候选标记 SOURCE-READY，或擅自跳过全部 composing 保存/改变全局 flush 或访问队列。

真实 Android/iOS/macOS IME、真实 native 多窗口运输、安装版冷启与锁定菜单、Mac/手机标签像素/颜色/间距仍 UNKNOWN。手机页面只共享数据导航，原版标签 UI 未取证。当前候选不覆盖智能文件夹、重命名、多选、Enter 提交和原版完整字符语法。

## 原始失败保全与区分

`raw/` 保全所有本轮日志字节，最终通过没有覆盖早期失败。

- `first-test.txt`：复用旧 harness 缺少 rusqlite/hooks；编译配置失败。
- `store-test.txt`：旧 harness 缺少生产 Session 根模块；编译配置失败。
- `store-harness.txt`：直接 path 引入 Session 改变子模块寻址；配置失败。
- `store-harness-symlink.txt`：改用真实源文件/目录 symlink，新增 Store 标签测试通过。
- `all-store-session-tests.txt`：39 pass，1 fail，冻结密文 fixture 的 CARGO_MANIFEST_DIR 相对寻址缺失；不是产品拒绝错误。
- `all-store-session-tests-02.txt`：保留正确 fixture 相对路径后，40 pass / 0 fail / 2 ignored。
- `tags-browser-run.txt`：环境拒绝本机监听；经既有权限升级后才运行。
- `tags-browser-run-escalated.txt`：发现用户 setLink 被 schema 排他规则挡住，属于产品问题；已改为先允许用户链接事务、随后去掉整个旧 tag span；Rust 显式拒绝最终混合 link/tag。
- `tags-browser-run-02.txt`：角色定位器没有包含目录计数字样，检查脚本定位错误。
- `tags-browser-run-03.txt`：最后失败注入项焦点/前置空白未明确，检查脚本错误。
- `tags-browser-run-04.txt`：Storage 故障注入暴露现有 preview 桥接先内存变更后 persist 失败的版本冲突；不是 Rust 原子保存路径，未将其误报为 Rust 失败。最终改用真实保存登记的安全 ID 失败，避免该独立 preview 边界干扰。
- `tags-browser-run-05.txt`：27 项全部通过。

## 重复执行

需要本任务树的 node_modules 指向已安装的同锁版本依赖；不要提交 symlink。浏览器脚本运行时指定已有 `PLAYWRIGHT_CORE_PATH` 与 `CHROME_PATH`，无下载/升级；源码从当前工作树经 Vite 加载，非主树副本。

Rust 可用 `scripts/check-tags-store.py` 重建本轮有界 harness：复制既有验证用 manifest/lock，symlink 当前真实 Store/Session 文件与目录，保留冻结 fixture 相对路径，执行 `cargo test --locked --offline --features rusqlite/hooks`。调用者必须先确认现有 `CARGO_TARGET_DIR` 独占且磁盘 >=2 GiB；本轮 root 授权 host target 已明确释放，不复制/清理 target。生成脚本本身未重跑；最终 Rust 原始执行命令等价，见 raw 日志及下述命令。

```sh
CARGO_TARGET_DIR=/Users/water/work/2026/Apple-Notes-Clone/src-tauri/target cargo test --locked --offline --features rusqlite/hooks --manifest-path artifacts/tags-rust/harness/Cargo.toml -- --nocapture
PLAYWRIGHT_CORE_PATH=/Users/water/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.mjs CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' node scripts/check-tags-browser.mjs
```

产品每文件 SHA 和排序聚合方法见 `source-sha256.json`。冻结前后未改 package/lockfile/Cargo 依赖。所有 raw SHA 亦记录于该文件；报告不包含用户备忘录正文，仅合成测试数据。
