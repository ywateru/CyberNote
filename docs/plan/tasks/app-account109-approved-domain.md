# ACCOUNT109 已授权协调服务自定义域名

2026-11-13。用户在域名与手动解锁请求后回复“继续 允许使用”，授权使用精确主机 `cybernote-sync.aixgg.com`。本任务接续[域名提案](../../verification/account109/server/custom-domain-proposal01/PROPOSAL.md)，不再等待同一主机使用许可。

## 当前执行状态

最新：[手机新域CELLULAR匿名health](../../verification/account109/android/approved-domain-phone-health01/README.md)单次200/可信TLS通过且有限证据已独核。新包仍未安装；正在核对原附件差异。独立Node followup仍不能完成canonical实时比较，父级成功对照与独立失败各自保留，不扩大shell结果为产品认证或三端。

[live02](../../verification/account109/server/custom-domain-live02/README.md)已通过原生Chrome Water profile已有目标zone会话添加准确CNAME和独立TXT，原三条TXT保留；Vercel verify HTTP200、verified=true。新域可信TLS与三个匿名接口200独核通过，首轮Python canonical TLS失败保留；父级Node单轮两域配置/JWKS均200且原始字节相同，独立Node复核进行中。DNS管理员登录前提已经解决，不再要求用户重复登录。

精确 `88b2dabe` 新域Android候选已[离线构建并独核](../../verification/account109/native/88b2dabe-android-build-review01/README.md)，尚未安装。手机CELLULAR匿名新域检查及既有新增附件的只读核对正在进行；原账户错误、历史基线和数据保留。源码/manifest完整Node集成274项通过。以下实施记录保留各自历史时点。

## 初始绑定与DNS等待

父级已用现有Vercel登录刷新凭据、核对唯一 `cybernote-sync` 项目，并将精确主机绑定至该项目production：redirect=null、gitBranch=null。域名目前unverified。项目级实时DNS建议首选 `673bb9aa89cda1fe.vercel-dns-017.com.`，不沿用绑定前的通用目标；TXT挑战由实际绑定响应给出。现有Cloudflare凭据能查询唯一 `aixgg.com` zone，但DNS记录查询返回403/code10000。未改任何DNS记录，未发送账户token到新域名。浏览器管理入口一直显示加载中，未进入记录编辑页。

## 客户端改动

Feynman在既有独立稀疏工作树准备最小修改：仅Android固定coordinator transport origin改为 `https://cybernote-sync.aixgg.com`；桌面固定transport仍为 `https://cybernote-sync.vercel.app`，以验证旧/新transport跨端兼容。ENROLLMENT_ISSUER仍严格固定为旧Vercel origin。Logto issuer/client/resource/callback、workspace推导、签名key、权限与信任规则不变。不新增运行时URL覆盖或自动降级。

两处Enrollment入口、SDK配置和provider应沿用已独审的transport/issuer拆分。保留既有alias负例和owner/签名校验；必要时补充明确平台固定值的检查。作者执行必要定向回归，Cicero独审。产品文件变化须刷新已审发布manifest pins，父级完整集成后再构建新候选；不得用旧包声称新域生效。

## 运行门槛

源码准备可以并行；在DNS完成、Vercel verified、公开TLS/固定匿名接口/身份配置通过前，不向该主机发送账户授权材料或安装后发起登录。随后仅做一次有界手机CELLULAR匿名native检查；通过后续验真实授权、三端完整正文与附件、中转承载与重启恢复。手机旧账户错误、历史基线和新增附件均保留，不通过清库/改grant/替换历史哈希取得通过。若缺DNS权限，向用户提供准确CNAME/TXT及现有记录保护要求，不重复请求已给出的域名授权。

当前交接：[域名执行回执及准确DNS记录](../../verification/account109/server/custom-domain-live01/README.md)。浏览器已能登录，但保存的账户没有目标zone，且与API返回的zone账户不同；已退出本次创建的会话并准备管理员空白登录页。未创建账户/token或变更DNS。待用户在保留页登录实际域名管理员，或由管理员按回执追加两条记录。源码/manifest已独审合并；父级在 `bc718a47` 完整Node集成274项通过，新Android包尚未构建/安装。


## 作者定向回执

基于`093c32ab`，复用既有cone sparse树并新建`codex/account109-approved-domain`，源码提交`b4ba3f9609871b0b896b72a63eb641e899d57f92`。仅以target_os固定Android transport新域/非Android旧域，ENROLLMENT_ISSUER与Logto输入未改；两处Enrollment及SDK仍沿用config::origin，provider和proof信任校验无变化。架构说明同步更新。`c39458d4c33baffc2218a439170cdfd214807ab7`仅从该精确源码刷新既有config.rs/enrollment.rs两项manifest pin，无新增路径。

指定唯一共享target上使用`cargo test --offline --locked --manifest-path src-tauri/Cargo.toml --features sync-e2e --lib <filter>`，jobs=2、DEV/TEST DEBUG=0、INCREMENTAL=0，两项filter各1/1通过：`http_transport_is_independent_of_pinned_signed_enrollment_issuer`（合成loopback传输、旧issuer成功与同key alias issuer拒绝）及`signed_proof_rejects_cross_owner_workspace_and_unbound_keys_not_just_jwt_decode`（owner/workspace/key等负例）。macOS执行覆盖桌面固定值；Android cfg分支为源码检查，未执行Android包/设备测试。首次编译因sparse排除既有include_str测试语料而停止，仅临时restore精确提交中的`docs/fixtures/smart-projection09.json`后通过，随后已reapply sparse移除该副本。未修改测试语料或扩大docs checkout。

`node scripts/publish/export.mjs --ref c39458d4c33baffc2218a439170cdfd214807ab7`只读dry-run通过（1782项），diff检查通过，磁盘约余21GiB。共享target已释放。没有公网请求、App、ADB、认证材料读取或整包构建；DNS/TLS/verified与运行门槛仍开放。Cicero已接精确源码/manifest及作者结果独审，独审结论另归档；此回执不把新域视作已可用。
