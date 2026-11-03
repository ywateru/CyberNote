# F07 + Audio · 统一构建候选01

实际构建日期：2026-11-04 Asia/Shanghai（原始时间戳为2026-11-03 UTC）。冻结主HEAD `f4d3a0273de35e7fc4e59c595630ba76aa9a900b`，含F07搜索源码及AudioPlayer各自独立SOURCE-READY修复。仅构建与身份保全；本目录不代表安装后的运行验收，运行另记 `../android-developer01/` 等目录。

## 输入与检查

实际列举216项输入，aggregate `a6b191546c39f2bf1c431e7547228a2714f79e355376a686380c89efd2299939`，算法为有序 `sha256 + 两空格 + path + LF` 的SHA256。`source-inputs-before.json`、`source-inputs-after-mac.json`、`source-inputs-after-android.json` 的全部文件、大小、SHA以及HEAD一致，changedInputs均为空。

清单纳入 `search-selection.ts`、`search-editor-gate.ts`、`audio-playback.ts` 与实际播放器检查、所有当前tracked前端/Rust/Android/原生插件、Mac Info.plist与图标、配置/锁/assets/scripts，以及既有Android生成源码与已修补ProseMirror依赖的列举输入。不声称冻结全部第三方库、SDK/工具链或整个操作系统。冻结时tracked diff为空。

实际使用default features；VITE_ACCESS_BOUNDARY_PROOF、TAURI_CONFIG、TAURI_ENV_PLATFORM、CARGO_BUILD_TARGET、CARGO_TARGET_DIR、RUSTFLAGS均未设置，未启用proof特性。没有升级/修改产品源、依赖、初始化平台或清理target。

F07整合preflight在 `f3e5c847f334988c8d0ea2b74cc21bd4feb31ca0` 通过typecheck、7 search groups、12 native-toolbar groups，原始日志和结果以 `f07-preflight-*` 保留。之后增加Audio集成，搜索/工具栏源未变；最终f4d3a02执行typecheck和生产audio helper11组通过，记录在 `preflight-result.json`。没有重复原65schema或旧IME矩阵。

## Mac release

`pnpm mac:build`，exit0，完整 `mac-build.txt` 与 `mac-build-exit.json`。原始release .app保全为 `/private/tmp/notes-f07-audio-mac-candidate01-f71efb72.app`，`mac-build-identity.json` 含source/exe/完整bundle文件/当时dist身份。该原始bundle仅有linker adhoc MachO签名，strict bundle verify失败，保留 `mac-codesign.txt`，没有覆盖基线。

按授权在独立副本 `/private/tmp/notes-f07-audio-mac-candidate01-sealed.app` 执行完整bundle本地adhoc签名：`codesign --force --sign - --timestamp=none`，随后 `codesign --verify --deep --strict --verbose=4` exit0。仅MachO签名发生变化并新增CodeResources；Info.plist资源保持原值，原始bundle前后不变。后续实际运行与独立验收统一使用此sealed身份：

- 可执行15427056B，SHA256 `11dcbfc41dc28f1917c38804691cdda37c49cbb6022d0c776185fd0ca01fc759`。
- 完整bundle列举文件15430449B，aggregate `731ff3d2436452653329086f1c5d3ac4bc60088efa4be395d5e773f9f41df3c7`。
- 保全zip `/private/tmp/notes-f07-audio-mac-candidate01-sealed.zip`，4584988B，SHA256 `d0d1da477279bcebcf24c476f5def027fde0d743f234e7ac69d03077aa28df5d`。

完整 `mac-derived-identity.json` 和 `mac-derived-codesign.txt` 可核对签名前后资源/签名。这是本地adhoc完整bundle签名，没有开发证书或公证，不声称公开分发签名验收通过。

## Android debug aarch64

Mac保全与输入核验完成后串行执行 `pnpm android:build --debug`，既有脚本选择aarch64、--apk，使用既有NDK/JDK，exit0。完整 `android-build.txt`、`android-build-exit.json`。

保全 `/private/tmp/notes-f07-audio-android-candidate01-3edc4ad0.apk`，301366970B，SHA256 `3edc4ad07524f630d694c0695cbde34bc4a02aa3c36f1fba0bd44a8de80574bf`。APK内ABI仅arm64-v8a；`android-build-identity.json` 记录嵌入libnotes_clone_lib.so、tauri.conf、HTML/JS/CSS及dist身份。没有以旧包或dist时间代替真实APK身份。

## 交接

两平台已保全、输入一致后正式释放Rust target给native Store任务。本目录未进行设备安装、开启麦克风、重启/清除模拟器或操作用户数据。Mac桌面入口当时报告locked，尚无Mac实际交互通过结论。Android运行验收由已交接设备上的后续独立目录记录，不能由构建成功替代。

本目录附身份捕获/签名脚本供审查；产物本身保存在上列/tmp绝对路径，不复制target。原始真实66秒WebM仍保持既有SHA256 `cd7ee9692361fb3502775e8b7efc87ba0957ee22835f10e6d7335b09980fdf4f`，未重新编码或写回。
