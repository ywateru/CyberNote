# DELIVERY97 独立审查

2026-11-09。审查范围：`7ab23a07..668082cad4fd143ca8382a377d05ac54f48a5879`。不同于开发代理；未修改产品源码，未执行 native 构建、安装或 ADB。

当前状态：**复审 pass**，修复提交 `1f19bec6191cee799197e4e9c22d57381d6f871a` 已关闭下述 F1；首轮失败证据与范围保留。

## Findings

1. **P1 / blocking — Mac 核包未绑定实际启动入口，可用未执行文件替代。**

   设计：`docs/architecture/build-delivery.md`“构建与发布”“命令与包内证明”要求核验实际包内前端/二进制，不可由旁路材料冒充。代码：`scripts/release.mjs` 的 `verifyPackage` Mac 分支只用 `realpathSync(binary).startsWith(Contents/MacOS)` 判定归属，读取 plist 时仅取版本，未读取并匹配 `CFBundleExecutable`。

   独立复现：临时创建 Info.plist，指定 `CFBundleExecutable=notes-clone`；该文件写入旧字节且无当前资源，另将包含当前 metadata/runtime 的 `unused-decoy` 放到同一 MacOS 目录。把 `--binary` 指向 decoy，`verifyPackage` 仍返回成功 manifest。因此包中真实运行入口可保持旧版，发布校验却显示当前源码已入包。没有执行临时二进制。

   修复要求：从 plist 取得有效、安全的 executable 名称，解析包内确切入口；提供的 binary 必须与该真实入口一致，目录归属本身不足。Android 分支亦须依据本项目实际 Tauri/Rust 主库入口（`[lib] name=notes_clone_lib`，实际产物通常为 `libnotes_clone_lib.so`）核验，不能让调用者用任意 basename 指定辅助库。针对 Mac 实际入口/decoy/无效入口，以及 Android 实际库与错误库选择补回归；本次 Android 只作静态边界检查，未伪造有效 APK。

   复现脚本：`node docs/plan/reviews/app-build-delivery97-probe.mjs`。当前提交预期 exit 1，第二项为 false；输出 `artifacts/delivery97-review/package-entry.json`。修复后应自然通过，不能删除或放宽“真正执行入口”断言。

## 已核对与验证

- 独立执行 `pnpm version:check`、`git diff --check` 通过；当前版本 0.1.0，前端/Tauri/Cargo 一致，Android package 路径按 app 目录上溯四级正确。
- 独立 8 项窄边界检查通过：当前 stamp 验收；不同源码 fingerprint/revision 拒绝；dev 无构建时间；Preferences、Mac toolbar 和 Android MainActivity 都被产品输入纳入；target/build/artifacts 不被纳入。当前产品输入 372 项。
- 阅读标准构建链：`mac:build → Tauri beforeBuildCommand → pnpm build → Vite createBuildInfo`；`android:build → scripts/android.mjs` 保留 env → 同一 Tauri beforeBuildCommand。Vite 生产 JS 与 build-info.json 使用同一对象，UTC 时间实际构造，stamp 校验包含内容指纹和 Git revision。
- 阅读作者 21 项结果及桌面/390px明暗截图；版本字段完整展示并换行。未重复作者完整浏览器组，未据截图扩大为原生运行通过。
- README 只有一处“最新安装包”标记区，明确现有 Mac/Android 快照不完全同源，未提前宣称本轮新包。功能矩阵有平台差异和真实验证边界。
- 作者设置库存重试断言失败有原 Preferences 基线同失败证据，属于现存边界，本审查不归因为版本信息改动，也不声明完整设置回归通过。

## 首轮结论（历史）

**blocked**。修复实际包入口核验后再独立复审。真实 Gradle 配置/编译、Tauri 嵌入资源、最终签名后包摘要及双端设备运行尚未执行，由 FINAL101 验收；本次 synthetic 入口试验不能替代这些证据。

## 复审：1f19bec6

独立阅读 `eff6d6aa..1f19bec6` 修复差异，未扩大到无关回归：

- Mac 的 `verifyMacEntry` 从 plist 读取 `CFBundleExecutable`，拒绝空值、非字符串、点/父目录、分隔符及控制字符；解析真实目录和入口，检查入口为 MacOS 目录内普通文件，并要求 supplied binary 与真实入口的 realpath 相等。入口逃逸和同目录 decoy 均被拒绝；`verifyPackage` 现在先执行此校验，再检查实际入口的嵌入字节。
- Android 的 `verifyAndroidEntry` 从当前 Cargo `[lib] name=notes_clone_lib` 得到主库名，而不是调用者提供的 basename；检查 APK 中单一受支持 ABI、正常 native 路径及唯一确切主库，再对比提供库与 APK 主库字节摘要。辅助库、把辅助库重命名成主库、缺主库、多 ABI、未知 ABI 与非法路径均拒绝。`verifyPackage` 直接使用该校验，manifest 记录 `packageEntry`。
- 原始独立 probe **2/2 通过**、自然 exit 0；原第二项“真实入口旧但 decoy 新”的错误接受已关闭，未放宽断言。结果仍为 `artifacts/delivery97-review/package-entry.json`。
- 独立执行作者新增 `node scripts/check-release-entry.mjs`，**18/18 通过**、自然 exit 0；`git diff --check` 通过。
- 另独立只读打开现存历史 `artifacts/drawing-interactions/CyberNote-Android-arm64.apk`，提取确切 `lib/arm64-v8a/libnotes_clone_lib.so` 后调用生产 helper，真实主库/ABI 被接受；修改 supplied 主库字节后被拒绝，**2/2 通过**。证据 `artifacts/delivery97-review/actual-apk-independent.json`。临时提取文件已清理，没有安装或运行 APK。

**复审结论：pass（DELIVERY97 源码与工具范围）。** F1 已关闭，无新增 blocking。历史 APK 检查只证明主库选择与字节匹配，既不证明当前版本元数据入包，也不证明新版 Gradle/native 编译或设备运行；这些仍严格由 FINAL101 完成。设置库存重试的基线失败仍如首轮记录，不由本次 pass 追认为已修复。
