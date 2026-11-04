# Mac07 构建产物独立核对

结论：准确 Mac07 本地签名应用通过产物启动门槛和完整来源核对。独立脚本一次执行退出 0，1002 项检查通过；本目录不代表界面、持久化或像素验收。

本轮作者 BUILD STOP 经 root 通知后，才创建本目录并一次固定全部作者记录、旧输出、两个应用包及两个 ZIP。README、delivery-manifest、delivery-readback 已包含在首次固定输入中；不声称它们在作者 STOP 之前保持不变。原 Mac06 独核脚本只读复用，替换及新增检查见 adaptation.json。

来源 HEAD 为 `8614d788745a6183542d261d1c6b6fc789084dc7`。根授权 SHA256 为 `edfad3cb63bf6810a19faa6d7970554a52ffcc2b535b87bc413bc02eae77ee30`，input-freeze SHA256 为 `b0bc1a2e4a6c68ead98f57cd66bd756a4a1278d9258d06d0b4ce4974a45c3a35`。独立实读 302 个当前输入并核对其聚合；238 个产品文件逐一核对准确提交的 Git blob；冻结恢复工具也核对实读身份。产品聚合 `6f934ba2142bb716c64c792f7b2187949e8119e72b06e2239788d1dc22cc5a5b`，输入聚合 `6d45cb911503c9fa0077f22f99dd351553c289f23c440d9c24a935a81646b4b3`。

`pnpm mac:build`、attempt01、nonce `25fc3e7a154a4786b6e3cce1791d0019`、构建结果、收集结果、四份输入前后快照和 13 份原始命令日志逐一相互关联。构建及收集的退出、进程组结束和输入比较状态均符合记录。补充缓存输入未变只依据冻结前后记录的相等性核对；本次没有重新读取缓存或证明整个系统的可复现性。

原始包与本次生成输出记录一致。保留的旧 app 和 dist 按完整文件树、目录树、文件大小、SHA256、mode、根 inode/device 实读核对，均与构建前隔离记录一致；新原始可执行文件确与旧 Mac06 可执行文件不同。原始与派生包仅可执行文件和新增 CodeResources 的签名变化。两个 ZIP 均无重复条目、CRC 正常，其完整内容与各自应用包逐字节一致，并核对 mode。

| 产物 | 字节 | SHA256 |
|---|---:|---|
| 原始可执行文件 | 16090480 | `17db9522917a682b7f35b14d5dc4e87a811a8747b434bc9c2ed45f41a367db3b` |
| 原始 ZIP | 4823742 | `5e5ff5f0b1ea4c8a129425d2b29518e36f6d6d642245bf19ea172957798a9baf` |
| 本地签名可执行文件 | 16015072 | `0de1ab851b06f6da59fe3d37a3843af0b0cf46557effe69d2c72bb7bcf63ffd1` |
| 本地签名 ZIP | 4753267 | `92c1ffca5e16179660eb538c9b8282b6f148f6443b9c6307b71640cac6e7af20` |

原始包 deep/strict 签名失败 exit 1 及 `code has no resources but signature indicates they must be present` 的原始日志保留且对应准确原始包。本地签名包原收集验证 exit 0；本次另执行一次只读 `/usr/bin/codesign --verify --deep --strict --verbose=4`，对准确 mac-sealed.app 再次退出 0，返回 valid on disk / satisfies its Designated Requirement。未签名、修改或启动应用。artifact-gate.json 是完整来源核对结束前发给 root 的有限启动门槛，完整结论见 result.json。

当前 dist 完整 3 个资源文件实读身份与本次构建记录一致，精确 CSS 包含新首组日期标题规则（15.25px、40px、9.5px）；准确提交的 native 源使用 `three?11:9` 和 `three?27:28` 标题/计数基线。当前 dist 与保留的前置 dist 相同，符合构建前已有的前端输出；native 新可执行文件不同。未独立解压可执行文件内的压缩资源，因此这里不把 dist 身份核对升级为内嵌资源解码结论。

作者交付 manifest 38 个文件逐一实读，按作者 `sha256 + 两空格 + path + 换行` 公式得到 `5479a1345938ada20a9ee76d4fa197667f60e586ac6135f0205b119f6769b19c`；manifest 自身 SHA256 `eae75d5e778c009d24bfdc270cd10c9946d7cdb9ef6d1e051dbb9756837f2b93`。最终 README SHA256 `be606d81ac3a12dcfeb1f2919f95037009569a99c1341ab492b294b62ac76822`、readback 的构建、收集和四项产物身份均核对。

独立 input-close.json 再次核对首次固定输入全部未变。本目录自己的 manifest 按相对路径排序，以 `path TAB bytes TAB sha256 NEWLINE` 聚合，排除 manifest 自身；与作者聚合公式不同。

本任务未执行构建、重新签名、GUI、ADB、安装、缓存操作、stage 或 commit。未访问用户备忘录数据库。未证明实际启动、窗口交互、保存重开、权限、Developer ID、公证、跨平台功能或像素一致性；这些属于后续对应运行时验证。
