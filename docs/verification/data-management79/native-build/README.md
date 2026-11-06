# 数据管理79 Mac24准确构建

2026-11-06。BUILD-PASS。准确源 `9afb86b1e18932e59f890d6d6cdb532082ea59b9`，288个跟踪构建输入前后逐文件不变；Rust+pnpm离线构建应用自然exit0，完整28.487秒。命令、环境、原始stdout/stderr、输入/产物逐文件manifest和驱动均在本目录；这不是操作系统/依赖/工具链的密闭可重现构建证明。

原始app保留在 `artifacts/data-management79/mac-original.app`，strict验证exit1；派生本地adhoc应用 `artifacts/data-management79/备忘录.app` 严格完整验证exit0。仅 `Contents/MacOS/notes-clone` 和 `_CodeSignature/CodeResources` 因签名变化，其他资源保持逐字不变，原件保持不变。

交付ZIP：`artifacts/data-management79/备忘录-Mac24.zip`，5057968字节，SHA256 `b6fe404f4f2090cc6c6504a339f56b4d4f6a77bfe312d999a884968a1be8a5be`。前端冻结快照 `artifacts/data-management79/mac-dist`。

实际MachO内嵌资源、完整HTML token、签名、ZIP及源码身份的独立核对见[核包目录](../native-independent/)。不启动原Mac应用、不操作真实麦克风；原生运行、OS多窗和Apple Notes整窗像素仍单独开放。

最终独立核包通过，完整证据见[核包说明](../native-independent/README.md)。包身份通过不等于OS设备/原生provider运行或原版像素通过。
