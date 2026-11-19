# 双端构建标识与交付入口

2026-11-09。状态：实施规格；最终安装包待全轮功能整合后交付。

## 用户可见信息

设置页面提供“版本信息”，Mac 和 Android 均能查看版本号、构建时间（带时区）与源码版本。源码版本包括 Git revision 与产品输入文件内容指纹：本轮主目录有未提交修改，不能仅显示 HEAD 让不同源码伪装成同一版本。开发预览明确标为开发态，不伪造安装包时间。

```text
设置
  ...现有功能...
  版本信息
    CyberNote 0.x.y
    构建于：2026-... +08:00 / UTC
    源码：<git revision> + <内容指纹>
```

## 构建与发布

- 单一应用版本源同步前端、Tauri/Cargo 和 Android versionName/versionCode，避免包外名称与设置显示冲突。
- `pnpm build`/原生构建入口自动注入真实元数据。产品指纹包含前端、Rust、原生插件、Android 原生源、图标/资源与构建配置；排除 target、构建输出、日志、测试证据和临时文件。不得把生成的元数据自身纳入哈希形成循环。
- 发布准备命令生成可复用构建标识，同一批 Mac/Android 使用相同源码指纹，记录各自实际构建时间。校验指纹不符应拒绝复用旧标识，不能默默把新源码标为旧包。
- 最终交付 manifest 列出平台、包路径、版本、构建时间、源码 revision/指纹、二进制摘要与验证范围。检查包内前端确实含相应元数据，不能只生成旁路说明。
- README 唯一“最新安装包”段只引用实际存在并已核验的该批产物；旧历史放后续，禁止多个互相冲突的“最新”。Mac/Android 功能对应表列实现、平台差异与真实验证边界；有功能不齐时明确指出，不能默认两个包同源。
- 本轮最终才重打双端包。中途只验证版本注入与构建流程，保留旧实际入口的准确状态，不提前宣称新包已交付。

## 命令与包内证明

`pnpm release prepare --out artifacts/releases/<批次>/source-stamp.json` 固定本次源码。以 `CYBERNOTE_RELEASE_STAMP=<路径>` 分别执行现有 `pnpm mac:build` / `pnpm android:build`；每次会产生实际 UTC 时间的 `dist/build-info.json`，该对象同时编入生产 JavaScript。保留每个平台自己的 dist，避免后续构建覆盖前一平台时间证据。

```sh
pnpm release verify-frontend --frontend artifacts/releases/current/mac-frontend --stamp artifacts/releases/current/source-stamp.json
pnpm release verify-package --platform macos --artifact artifacts/releases/current/CyberNote.app --binary artifacts/releases/current/CyberNote.app/Contents/MacOS/notes-clone --assets <该次Cargo的out/tauri-codegen-assets目录> --frontend artifacts/releases/current/mac-frontend --stamp artifacts/releases/current/source-stamp.json --out artifacts/releases/current/mac.json
pnpm release verify-package --platform android --artifact artifacts/releases/current/CyberNote.apk --binary <该次aarch64编译的libnotes_clone_lib.so> --assets <该次Android的out/tauri-codegen-assets目录> --frontend artifacts/releases/current/android-frontend --stamp artifacts/releases/current/source-stamp.json --out artifacts/releases/current/android.json
pnpm release publish --manifest artifacts/releases/current/mac.json --manifest artifacts/releases/current/android.json
```

`verify-package` 检查最终 Mac 的 Info.plist / APK manifest 的版本。Mac 从 plist 的安全单文件名 `CFBundleExecutable` 解析真正启动入口，要求提供的 binary 与该入口一致，不能用同目录未执行的文件替代，也不能逃逸到包外。Android 根据本项目 Cargo `[lib] name=notes_clone_lib` 定位实际 APK 的 `lib/<ABI>/libnotes_clone_lib.so`，只接受一个受支持 ABI，并核对该入口原始字节；调用者不能按辅助库 basename 选择其他库。交付 manifest 的 `packageEntry` 记录此实际入口。

随后从对应 Tauri 编译缓存解压 metadata 与生产JS，要求两份原始嵌入字节都实际存在于上述真实入口二进制。单独 JSON 旁路文件、旧缓存、辅助 decoy、修改过的包均不能满足该核验。Tauri cache 路径以实际 Cargo target 的 `build/notes-clone-*/out/tauri-codegen-assets` 为准，不猜测任意旧文件；需保留该次缓存直到最终包核验完成。`node scripts/check-release-entry.mjs` 覆盖入口/decoy/非法入口与 ABI 边界，仅使用 synthetic plist/ZIP，不作为真实 native 构建或安装证据。

`publish` 同时要求两个平台 manifest、版本/源码指纹/prepare批次一致，且最终产物摘要仍匹配，才更新 README 唯一标记区。manifest 的 `validation` 默认只陈述构建标识核验；可通过 `--validation-note` 引用真实功能/设备记录，不自动把标识检查扩张为功能通过。Mac为目录时摘要按相对路径和最终签名字节构成；最终签名后再核验。

## Agent适配器交付补充

项目演进116同时交付`crates/notes-mcp`的真实release可执行文件。现有双端`release publish`命令不自动构建或校验第三个产物；不得把适配器源码目录、开发target路径或配置示意当成已安装程序。

适配器随同一批次保存单独的`mcp.json`记录，至少包含：最终可执行文件绝对路径、目标平台/架构、实际构建时间、文件字节SHA-256、对应source stamp/源码指纹、锁定SDK版本、已验证MCP协议版本、真实stdio与宿主联调报告。使用现有产品指纹中的`crates/`输入，最终文件签名或复制后重新计算摘要。未运行的平台保留未验证，不从macOS运行推断其他桌面平台支持。

用户接入说明和Agent页生成的配置必须指向实际交付位置，包含workspace-id与credential-ref；自定义runtime-dir需随配置准确保留。检查配置在重启和重新载入设置后仍能连接同一隔离资料库。最终包、manifest及文档均不携带测试grant、私有凭据文件或用户资料库。Android交付的是笔记客户端，不将它描述为可启动该本机stdio宿主。

## Android 工具输出的指纹边界

`productFiles` 按项目相对路径排除 Tauri 工具拥有的输出，不能依靠 Git ignore，也不能整体排除 Android 源目录：

| 排除的工具路径 | 仍作为输入的相邻源码 |
| --- | --- |
| `plugins/<plugin>/android/.tauri/`（包括新插件的 SDK 镜像） | 插件 `android/src/`、`AndroidManifest.xml`、`build.gradle.kts`；非隐藏 `android/tauri-api/` 与其他手写路径 |
| `src-tauri/gen/android/.tauri/` | Android 工程 `settings.gradle`、`build.gradle.kts` 等手写配置 |
| `src-tauri/gen/android/app/src/main/java/com/local/notesclone/generated/` | 同包 `MainActivity.kt`；其他包/插件中名为 `generated` 的手写路径，不采用全局同名排除 |
| `src-tauri/gen/android/app/proguard-tauri.pro` | `proguard-rules.pro` 等手写规则 |

原有的 Tauri dependency/path bridge 文件、schemas、assets、jniLibs 与 build/target 等输出排除保持不变。生成目录首次出现、重生成和清理均不应改变产品指纹；手写 Kotlin、Manifest、Gradle、Rust、C/Objective-C 与前端源码变化仍必须使旧 release stamp 失效。此规则不改变版本源或核包算法。

`node scripts/check-build-identity-generated101.mjs --expect-fixed` 使用临时 Git fixture 调用真实 `productFiles/sourceIdentity/validateStamp`，覆盖8类输出的创建/改写/删除、整目录增删和22个手写/近名路径的 stamp 拒绝。`--expect-bug` 用于修复前因果复现；修复后该模式应失败。证据写入 `artifacts/build-identity101/`；不把 fixture 当作 Android 生成、原生打包或设备证明。

## 包内发行身份（settings121 / D5）

产品版本继续由 `package.json` 的稳定三段版本拥有，并通过
`assertVersions()` 与 Tauri、Cargo/lockfile 同步。它与“此二进制来自哪个
发行 tag”是两项事实。新构建的 `BuildInfo.releaseVersion?: string | null`
保存完整、去掉 `v` 的发行版本，例如 `0.1.0-preview.2`；旧包缺少该字段
视为未知，不能根据 `builtAt`、`releasePreparedAt`、revision/fingerprint、
包文件名或最后检查到的 feed 推断一个 tag。source stamp 固定产品字节，
不授予发行身份；stamp 中额外写入 `releaseVersion` 不参与身份来源选择。

发行身份只由 `scripts/build-info.mjs::resolveReleaseVersion()` 解析：

| 构建上下文 | 身份与拒绝规则 |
| --- | --- |
| GitHub tag 构建 | 使用明确的 `GITHUB_REF_TYPE=tag` / `GITHUB_REF_NAME`；tag 必须规范、core 等于产品版本、存在于当前 checkout 且 peel 到 HEAD；若存在 `GITHUB_SHA` 也必须等于 HEAD。dirty 拒绝。明确的 CI tag 可在同 commit 多 tag 时选择唯一来源。 |
| GitHub branch/PR 构建 | `GITHUB_REF_TYPE=branch` 和非空 ref name 返回 `null`，即使该 commit 恰好也有发行 tag；不将分支产物标成发行版。缺失或非法的 CI ref 上下文拒绝。 |
| 本地生产构建 | 只接受 HEAD 上的 exact tag，不使用 `git describe` 或祖先 tag。所有以 `v` 开头的 exact tag 均需符合本项目规范且匹配 core；多个候选拒绝歧义。存在候选时要求整个 checkout clean，包含非产品路径的 tracked/untracked 修改。没有 exact tag 返回 `null`。 |
| 开发构建 | 返回 `null`，不声称安装包发行身份；仍执行产品版本同步检查。 |
| 无 `.git` 的 source export | 返回 `null`；部署 metadata 不能补出 tag。若同时声称 CI tag 则拒绝，因为无法验证 checkout/HEAD。 |

规范 tag 语法是 `v<major>.<minor>.<patch>` 或在后面追加非空 SemVer
prerelease：点分 ASCII 字母/数字/连字符标识符，纯数字标识符不允许前导
零；core 不允许前导零。本项目发行 tag 不接受 `+build` metadata、空后缀、
空标识符、空白或去掉 `v` 的形式。解析器不规范化非法输入，也不改版本。

解析必须位于真实 Git checkout root，支持本项目的 linked worktree `.git`
文件并核对 Git 管理目录中的反向登记；拒绝 symlink `.git` 或借用另一
worktree 的 `.git` 文件。Git 查询清除继承的 `GIT_*` 重定向/索引/config
环境，避免错误读取别的仓库。本项目 pipeline 已提供 GitHub ref 环境，
无需改 workflow；此改动没有创建/修改 tag、推送或发布任何资产。

### 前端、Rust 与发布回执的一致性

Vite 调用 `createBuildInfo()` 时解析上述身份，将结果编入生产 JS 与
`dist/build-info.json`。前端开发 fallback 明确包含 `releaseVersion: null`。
`src/build-info.ts` 同时导出 `releaseIdentityNotice: string | null`，供设置/
更新 UI 在无身份时显示“按产品版本保守比较，无法判断同一产品版本的
预发布先后”；不通过前端传递 currentVersion 给 native。

`src-tauri/build.rs` 在 `tauri_build::build()` 前运行同一个 Node 解析器。
release profile 除校验真实 tag/core 外，还要求现有生产前端 build-info 的
releaseVersion、产品版本和完整源码身份与当前 checkout 一致；变更 tag
而未重建前端会拒绝。debug/其他非 release profile 不授予发行身份。
它设置编译期 `CYBERNOTE_RELEASE_VERSION`：已知身份为完整发行版本，
未知为**空字符串**，覆盖外部同名环境值，不能直接接受外部版本注入。
Node 是现有前端工具链，也是该构建步骤的必需工具；缺失/校验失败即失败。

Cargo 对产品输入、`dist/build-info.json`、Git HEAD/index/refs/packed-refs
及 CI ref 环境设置重跑依赖，以捕获 tag/前端切换。`productFiles` 已包含
原有 `scripts/build-info.mjs`、`src/build-info.ts`、`src-tauri/build.rs`，新增
`scripts/publish/stage-packages.py` 作为打包身份输入；dist 生成元数据仍被
排除，不形成自引用。添加/变更发行身份算法或回执逻辑会使旧 source stamp
失效。保留现有前端和实际原生入口的嵌入字节核验，不能用 sidecar 代替。

staging 在创建输出前调用同一解析器的 `--validate-release-build-info`
命令重新验证当前 tag 与 metadata；已知发行 tag 不允许缺失/陈旧/伪造的
releaseVersion。Mac/Android JSON 回执新增顶层 `releaseVersion`，并与原来
嵌入原生二进制核验过的 `buildInfo.releaseVersion` 一致；原生 SHA、源码
指纹、架构/包形状、notices 和 SHA 文件逻辑保持。它是 Git checkout/构建
来源核验，不构成独立签名清单、Developer ID、公证或 Android 签名保证。

### updater 整合接口与旧包限制

本次仅交付构建身份；不修改被冻结审查的 software_update 模块。
整合 worker 应在 native 内提供同一个 current-version helper，表达式为：

```rust
option_env!("CYBERNOTE_RELEASE_VERSION").filter(|v| !v.is_empty()).unwrap_or(env!("CARGO_PKG_VERSION"))
```

必须复用到以下完整比较边界，不能只改 DTO：

1. `SoftwareUpdater::new/create` 的当前版本及后续 feed/下载降级检查；
2. macOS `install::mac::stage` 中“候选发行版本必须新于当前发行版本”的
   完整 SemVer 比较。目前冻结代码这里也直接使用 Cargo core；需改成同一
   helper，才能让同 core preview.2→preview.3 真正通过安装预检；
3. 包内 plist/Android manifest、receipt `buildInfo.version` 和运行包版本
   核验仍比较稳定产品 **core**。新增的 receipt 顶层及
   `buildInfo.releaseVersion` 若存在，应与候选 GitHub release tag 一致，
   不要把 full preview 字符串要求为 macOS short version/Android versionName。

前端展示可用 `buildInfo.releaseVersion ?? buildInfo.version`，并在缺失
发行身份时渲染 `releaseIdentityNotice`；比较授权仍由 native 所有。
新包 preview.2→preview.3 可正确递增，preview→同 core stable 是升级，
stable→同 core preview 是降级。旧 preview.1/.2 包编译时只有 Cargo `0.1.0`，
仍只能保守视为这个产品版本，不能自动判定同 core preview.3 更新；需要
用户显式安装具备身份的新包，或后续递增产品 core。本变更不事后给旧包
补 tag，不改变 unsigned APK 无法安装的事实，也不改变 Android versionCode
仍由产品 core 派生的现状。未来 Android 有兼容签名发行后，同 core preview
安装顺序还需要另行确定 versionCode/系统包管理策略。

### 独立验证与边界

```sh
node --test scripts/verification/settings121-release-identity.test.mjs \
  scripts/publish/build-info.test.mjs scripts/publish/package-identity.test.mjs \
  scripts/publish/policy.test.mjs scripts/publish/stage-packages.test.mjs
node scripts/verification/settings121-release-updater-proof.mjs
node scripts/check-build-identity-generated101.mjs --expect-fixed
pnpm typecheck
pnpm version:check
git diff --check
```

身份测试用临时 Git checkout/linked worktree 和真实序列化 build-info，覆盖
CI/local/annotated/dirty/invalid/mismatched/ambiguous/no-tag、错误 Git root、
版本漂移、stamp 不能授予 tag、发布回执、原生压缩嵌入字节和拒绝旧前端。
真实 `build.rs` 通过轻量 rustc 及 isolated Cargo 执行；唯一替换的是无操作
`tauri_build` fixture，不运行实际 Tauri/sidecar。Cargo fixture 验证 tag
切换触发重跑、旧前端失败、重新生成后 native 的编译身份更新。

跨模块 probe 只读 Git object 中冻结 updater
`cfde38103f71d0dd1fdf3e60a5c720a63abb2461` 的真实 SemVer 比较器，在临时
Rust consumer 中验证新 preview 递增与 stable/旧包保守拒绝；可用
`UPDATE_IDENTITY_PROOF_REVISION` 指定整合后的待验 revision。该 probe 不修改
冻结工作树，不等于已完成 updater 宿主/安装路径接线。以上验证不建立
真实发布包、原生 UI/安装重启、Android 系统安装或设备验收；未进行发布。
