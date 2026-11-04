# Mac12 独立核包

PASS / READY STOP，494 项有限包门槛通过；报告 `docs/plan/reviews/mac-name-focus-independent12.md`。

`verify.py` 是只读 verifier；`attempt02-command.json` 是有效运行记录，result.json 保存来源、完整断言、包清单及 Mach-O 内容保持证明。fresh-signature-checks.json 保存 original 资源封印失败及 sealed adhoc strict/deep 通过，bundle-metadata.json 仅记元数据。

input-manifest.json / input-close.json 固定365个初末保护文件及322输入。dist-chain-initial/close 另固定四个 Android07 保存 Mac12 dist 的链路记录。首次夹具误读已被串行 Android 替换的公共 dist，verify.fixture01.py、attempt01-failure/command 原样保留；只改核验路径后通过，无产品修复或重建。

来源身份由 root 固定和授权、冻结、当前字节及构建记录支撑，未独立读取 Git 对象。root freeze review 诚实记为 collect 后补记先前消息，不冒称构建前文件。没有产品测试、GUI/ADB、构建、启动、签名写入、设备/数据库/共享缓存操作；本地adhoc通过不能替代运行、权限或全像素验收。索引从仓库根解析，包含报告，不包含索引自身。
