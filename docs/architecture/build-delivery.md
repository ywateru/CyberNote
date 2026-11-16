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
