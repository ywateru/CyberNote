# OneDrive／百度网盘 OAuth 实施验证

日期 2026-11-21。源码基线为 `main` `efcf826b6015be3787db43d16369c0aac8565d2a`（`0.2.6`），本轮实现随 `0.2.7` 发布。本页区分自动化证据、构建证据和仍待真实账号／真机验收的事实；本地 fixture 不能替代厂商登录、真实上传或并发测试。

## 已实现

- 受控原生窗口：`plugins/tauri-plugin-notes-auth` 的 `openCloud`／`closeCloud`；macOS 非持久数据存储、加载前逐条等待 Cookie 并在结束时清空该存储；Android 使用进程级 `CookieManager`，串行登录并只定向清理 `driver_txt`／`server_use`，厂商 Cookie 可能保留到进程结束。
- OpenList 契约：`src-tauri/src/cloud_sync/auth/openlist.rs`，包括 `/requests` Cookie 提取、`/#base64` 回调解析、`renewapi` 和固定错误。
- 凭据：`src-tauri/src/cloud_sync/auth/vault.rs`，独立 AES-256-GCM 记录、0600 设备密钥、原子写入和损坏拒绝。
- 连接状态机与命令：`src-tauri/src/cloud_sync/runtime.rs`、`commands.rs`。
- 远端：`src-tauri/src/cloud_sync/remote/onedrive.rs`、`remote/baidu.rs`。
- 设置 UI：`src/cloud-sync/CloudSyncSettings.tsx`、`types.ts`、`cloud-sync.css`。

## 本轮补丁：百度登录输入与多设备读写

- **登录空白输入根因**：macOS `cloudRules` 的通配 host 正则把 `.` 手工替换成 `\\.`，再经 `NSJSONSerialization` 转义后，WebKit 实际收到两个反斜杠。`openapi.baidu.com` 的精确规则仍放行主页面，所以标题和授权区可见；`passport.baidu.com`、`ppui-static-pc.cdn.bcebos.com` 等登录组件脚本被拦截，`#psLogin` 为空。已改用 `NSRegularExpression.escapedPatternForString:`，让 Foundation 生成唯一一层正则转义。
- **离屏 WKWebView 证据**：使用与 `cloudRules` 相同的 block-all + 精确 host + 通配 host 规则加载真实百度授权页，`#psLogin` 生成 5423 字符 HTML 和 21 个 `input`。这只证明规则与登录组件资源可渲染，不等于应用内真实账号登录完成。
- **实际应用内证据**：构建本地 `.app` 后从「设置 › 账户与同步 › 云端同步」选择百度网盘，默认「多设备读写」，确认授权说明后打开登录窗口。窗口实际显示百度账号输入框、密码框、“登录并授权”按钮和 OpenList 权限说明；账号框可聚焦并成功输入测试值 `input-check`，随后已清空，没有提交真实账号登录。最新构建路径为 `src-tauri/target/debug/bundle/macos/CyberNote.app`（`0.2.6`，2026-11-21 19:34）；更早的 `target/release` 包为 `0.2.7`，不应作为本轮源码证据。这证明空白输入问题已修复，但不等于真实百度账号登录、换票或上传完成。
- **百度默认模式**：`beginConnect` 未指定 mode 时使用 `twoWay`；`Config::validate` 允许 `baiduyun_go + twoWay + writer_id`。`ReadOnly`、`SingleWriter` 仍可选，重新连接在可写模式间沿用原 `writer_id`。
- **多 head 读取**：`Remote::get_all` 对百度按 writer 取最新 head，最新一份下载、大小校验或解密失败时回退上一份；`engine::read` 解密每个 head 并调用现有 bundle 合并逻辑，revision 使用排序后的 head 名单。读取总量上限为 8 个 48 MiB 密文。
- **写入与能力**：百度 `TwoWay`／`SingleWriter` 发布 `write=true`、`automatic=true`、`immutable_heads=true`；`ReadOnly` 仍为只读。每次同步创建新的 `head-<writer>-<seq>-<rand>.enc`，不覆盖旧对象。并发编辑由现有版本/设置合并保留为冲突。
- **设置 UI**：百度模式顺序改为「多设备读写（默认）／只读／单写者」；连接说明明确 `basic,netdisk` 包含读写；能力说明区分多设备合并、单写者和只读。

本轮收尾修正：

- `connectionInfo` 接受可选 `provider`，设置页「查看详情」刷新当前展示的网盘，而不是固定刷新 `selected`。
- 原生登录窗口失败会记录可重试错误并关闭窗口；关闭、销毁和打开失败都会移除原生 handler，迟到事件不能复活 attempt。
- `beginConnect` 先预留 attempt 再释放状态锁执行 `/requests`；同步进行中返回 `busy`，取消或关闭可以在请求期间退休 attempt，失败 attempt 立即清除并保留安全错误。完成连接写入配置前会再次检查操作锁，避免与后台同步交叉。
- 设置页切出「账户与同步」或卸载时，如果仍有 `authorizing`／`verifying` attempt，会绕过普通按钮的 in-flight 防抖直接发送 `cancelConnect`，关闭原生窗口并退休 attempt。
- `Config::validate` 严格绑定 `(provider, driver, mode)`：OneDrive 个人版只允许双向、工作／学校版只允许只读；百度只读不得带 writer，单写者和多设备读写必须有 writer。OneDrive 写入能力还要求 `/me/drive` 明确返回 `personal`，未知或企业盘按只读处理。
- 百度可写模式重新连接沿用原 `writer_id`，不会把同一设备变成新的 writer；只有从只读切换到可写或首次连接才生成新 id。
- OAuth 回调解析 `expires_in`／`expires_at`；账号接口拒绝本地未过期 token 时先强制刷新一次，再决定是否进入重新授权。
- 百度 `create`／`precreate` 使用 `rtype=3`，并发送整文件 MD5 与首 256 KiB MD5；分块 MD5 覆盖最后一个不足 4 MiB 的块。
- 百度 OAuth 回调只校验 `driver_txt`，不要求 OneDrive 才返回的 `server_use`。
- 百度下载改为手动跟随重定向：token 只附加到初始百度 `dlink`，每次重定向目标先校验百度主机白名单，不把 token 带到外域。
- OneDrive 授权主机白名单补充常见 Microsoft 登录 CDN（`msocdn.com`、`office.net`、`office.com`、`onedrive.com`、`sharepoint.com`、`live.net`），仍不开放任意主机。

## 自动化检查

以下检查在本轮实现后运行：

```sh
pnpm typecheck
CYBERNOTE_UNTAGGED_BUILD=1 pnpm build:frontend
CARGO_TARGET_DIR=/tmp/cybernote-main-target cargo check \
  --manifest-path src-tauri/Cargo.toml
CARGO_TARGET_DIR=/tmp/cybernote-main-target cargo test \
  --manifest-path src-tauri/Cargo.toml \
  cloud_sync::protocol::baidu::tests::creates_dirs_uploads_and_downloads_with_token
CARGO_TARGET_DIR=/tmp/cybernote-main-target cargo test \
  --manifest-path src-tauri/Cargo.toml --lib cloud_sync::protocol::baidu::tests
CARGO_TARGET_DIR=/tmp/cybernote-main-target cargo test \
  --manifest-path src-tauri/Cargo.toml --lib \
  cloud_sync::protocol::baidu::tests::read_falls_back_when_the_newest_head_does_not_decrypt
CARGO_TARGET_DIR=/tmp/cybernote-cloud-target cargo test \
  --manifest-path src-tauri/src/cloud_sync/harness/Cargo.toml --lib \
  multiple_remote_heads_merge_without_dropping_branches
CARGO_TARGET_DIR=/tmp/cybernote-main-target cargo test \
  --manifest-path src-tauri/Cargo.toml \
  cloud_sync::protocol::onedrive::tests::final_commit_rejects_a_stale_etag
CARGO_TARGET_DIR=/tmp/cybernote-main-target cargo test \
  --manifest-path src-tauri/Cargo.toml cloud_sync::runtime::command_tests
CARGO_TARGET_DIR=/tmp/cybernote-cloud-target cargo test \
  --manifest-path src-tauri/src/cloud_sync/harness/Cargo.toml --lib cloud_sync::auth
CARGO_TARGET_DIR=/tmp/cybernote-cloud-target cargo test \
  --manifest-path src-tauri/src/cloud_sync/harness/Cargo.toml --lib \
  cloud_sync::auth::oauth::tests::rejected_cached_token_refreshes_once_before_reauth
CARGO_TARGET_DIR=/tmp/cybernote-cloud-target cargo test \
  --manifest-path src-tauri/src/cloud_sync/harness/Cargo.toml --lib cloud_sync
node --test plugins/tauri-plugin-notes-auth/policy.test.mjs
```

结果：

- `pnpm typecheck` 通过。
- `CYBERNOTE_UNTAGGED_BUILD=1 pnpm build:frontend` 通过（2012 个模块）；未加该变量的 release 构建会按发布身份规则拒绝未提交工作区，这是预期保护，不是本次代码失败。
- macOS Rust 目标 `cargo check` 通过；仅有既有警告。
- `cloud_sync::runtime::command_tests` 5/5 通过：provider 绑定、能力保守降级、`(provider, driver, mode)` 校验、失败 attempt 退休、百度单写者重连保持 writer。
- 百度协议测试 8/8 通过：head 解析、每 writer 最新 head 分组、`get_all` 只读取两个 writer 的最新 head、建目录／预上传／分片／下载、外域重定向拒绝、分块 MD5、`errno=111` 归类为重新授权，以及最新 head 解密失败时回退上一份。
- cloud harness 新增 `multiple_remote_heads_merge_without_dropping_branches` 通过：两个 bundle 的独立设置分支合并后都保留；workspace 不一致返回 `workspace`。
- 原生登录策略测试通过，新增检查 `cloudRules` 必须使用 Foundation 转义而不是手工替换。
- OAuth 子集 7/7 通过：错误 driver／缺失 refresh token／`message_err`／非固定 host、百度回调不要求 `server_use`、`/requests` 仅提取两个 auth-state Cookie 与 `/renewapi`、凭据加密往返和损坏拒绝、本地缓存 token 被厂商 401 拒绝后强制刷新并更新 access／refresh token。
- cloud harness 的 `cloud_sync` 过滤集 23/23 通过，包括百度建目录／预上传／分片／下载、外域重定向拒绝、`errno=111` 重新授权、最新 head 解密回退、OneDrive 最终提交拒绝旧 ETag、失败 attempt 退休、单写者重连和最终 gate。
- 全量 cloud harness 251 项：246 通过、1 失败、4 忽略。失败为既有 `session::tests::frozen_ciphertexts_validate_after_decrypt_before_publishing_key`，原因是固定测试文件缺失（`No such file or directory`），与本次云盘改动无关，未静默修复。

## 真实端点探测

2026-11-21 对 `https://api.oplist.org` 做了不登录账号的 `/requests` 探测：

- OneDrive：`server_use=true` 与 `driver_txt=onedrive_pr` 返回 `login.microsoftonline.com/common/oauth2/v2.0/authorize`，scope 为 `offline_access Files.ReadWrite.All`，并设置 `driver_txt`／`server_use` Cookie。
- 百度：`server_use=true` 与 `driver_txt=baiduyun_go` 返回 `openapi.baidu.com/oauth/2.0/authorize`，scope 为 `basic,netdisk`，并设置 `driver_txt`／`server_use` Cookie。

这只证明授权入口和 Cookie 契约仍可用，**没有完成真实用户登录、换票、续期或上传**。

## 构建证据

```sh
CARGO_TARGET_DIR=/tmp/cybernote-main-target cargo check --manifest-path src-tauri/Cargo.toml
cd src-tauri/gen/android && ./gradlew :app:compileArmDebugKotlin
```

- macOS 目标编译通过，包括 Objective-C 原生窗口。
- Android Kotlin 编译通过（`BUILD SUCCESSFUL`）；仅有既有 deprecation warning。
- `CYBERNOTE_UNTAGGED_BUILD=1 pnpm mac:dev` 已完成 dev 编译并启动二进制；本次启动被已有 CyberNote 实例持有的数据目录锁拒绝（`Resource temporarily unavailable`），属于测试环境占用，不是云盘代码失败。手动验收前需退出已有实例。
- 最新手动验收包为 `src-tauri/target/debug/bundle/macos/CyberNote.app`，版本 `0.2.6`、ad-hoc 签名、约 241.96 MiB，构建时间 2026-11-21 19:34；它包含百度登录输入修复、百度多设备读写、OpenList 刷新加固和「保存并继续预览」流程。该 debug 包不是发布包，不能替代签名/公证或 Android 真机验收。
- `src-tauri/gen/android/app/tauri.properties` 是 ignored 的本地构建文件，本轮为编译临时使用 `0.2.6`／`20006`，不应提交。

## 手动登录验收

macOS：

```sh
open -n /Users/water/work/2026/Apple-Notes-Clone/src-tauri/target/debug/bundle/macos/CyberNote.app \
  --args --data-dir /tmp/cybernote-cloud-manual
```

如果默认数据目录已被正在运行的 CyberNote 占用，隔离启动可以避免 `Resource temporarily unavailable`；macOS 14+ 才会接受 `--data-dir` 的 WebView 隔离规则。也可以退出已有实例后运行 `CYBERNOTE_UNTAGGED_BUILD=1 pnpm mac:dev`。Android：使用 `pnpm android:dev` 安装到测试设备，或在 Android Studio 中构建对应 debug 变体。真机验收前先确认应用版本和安装包来源。

1. 打开「设置 › 账户与同步」，选择 OneDrive 或百度网盘。
2. OneDrive 选择个人版／工作或学校版；百度默认「多设备读写」，也可改选只读／单写者。
3. 点「连接」，阅读 OpenList 授权对象、权限范围和刷新令牌说明，确认后完成厂商登录。
4. 成功后检查账号、同步位置、容量和能力；点「查看详情」确认刷新的是当前展示的网盘。
5. 分别测试取消登录、关闭窗口、网络失败后重试、重新连接和断开连接。
6. 输入至少 8 位加密口令，先预览；配置预览通过后点「保存并继续预览」，再确认同步。配置预览本身不发放同步票据，传输仍使用保存后的远端预览。
7. 本轮已在本地 `.app` 确认百度登录窗口显示账号、密码/验证码输入框，账号框可聚焦输入；仍需用真实账号完成登录、换票和权限确认。如果后续构建仍只有标题和授权区，记录窗口大小、网络和控制台失败资源，不要记录 Cookie 或 token。
8. 百度多设备读写：用合成笔记在两台设备各写一次，确认远端出现两个不同 writer 的 `head-<writer>-<seq>-<rand>.enc`，两端再次预览都能看到对方的笔记；同一笔记并发编辑应保留冲突，不静默覆盖。
9. 百度只读不得写远端；单写者只允许当前设备创建新 head。OneDrive 工作／学校版当前固定只读。
10. 百度可写模式断开前从远端 head 文件名记录 writer id，重新连接后再写一次，确认 writer 不变且 `seq` 继续递增，不回到 1。
11. 重启应用后检查连接仍存在、授权过期会进入重新连接；不要在日志、文档或截图中记录真实 token、回调 fragment 或账号敏感信息。

## 待真实账号验收

- OneDrive 个人版：真实登录、账号／配额、首次创建、同一 `eTag` 反序最终 `PUT` 的 `412`／`409`、48 MiB 密文分片、重启续期。
- OneDrive 工作／学校版：登录、读取、恢复；零长度 `POST` 最终提交的并发拒绝尚未证明，UI 固定只读。
- 百度：真实账号登录、换票与权限确认、`uinfo`／quota、head 列表与下载、`precreate`／分片／`create`、多设备新 head 与合并、单写者新 head、只读不写入、最新 head 下载／大小校验／解密失败时回退。登录窗口的输入框渲染和聚焦输入已在本地 `.app` 确认，不等于真实账号登录完成。
- 百度真实路径：开放平台文档对 `precreate` 有 `/apps/{appname}` 目录限制；当前实现固定 `/CyberNote`，OpenList 内置应用的 `appname` 尚未确认。必须用真实账号验证根目录写入；若被拒绝，改为可配置同步根目录或暂停百度写入，不能继续宣称真实上传可用。
- macOS／Android 真机：Cookie 注入、回调拦截、取消／关闭清理、窄屏／键盘／浅深色、Android 返回键与进程回收。Android 需额外确认厂商 Cookie 残留不会导致错误账号自动登录；当前实现不承诺与 macOS 同等的存储隔离。
- 百度多设备并发：两台设备同时预览和同步、反序写入、同一笔记冲突、最新 head 损坏回退、旧 head 保留和读取预算。自动化 fixture 只证明选择与合并逻辑，不等于真实百度并发验收。
- 凭据保护：当前设备密钥是 `.cloud-sync/credentials.key`（`0600`）文件，不是 macOS Keychain／Android Keystore；Android 打包后需确认 `.cloud-sync` 不进入系统备份，且卸载／清除数据行为符合预期。未完成前不能宣称硬件级密钥保护。

真实账号测试必须使用合成笔记，不得把真实用户令牌写入 fixture、日志或文档。
