# Android 回跳 Manifest 的可重复生成

真实 production 构建发现：原始已提交 Manifest 只有手写 callback filter，没有 deep-link 插件的生成标记；固定的 tauri-plugin-deep-link 2.6.3 构建脚本会在该声明旁追加一份生成块。源树因此变脏，不能通过发布源码身份检查。旧构建的差异继续保留，不在构建后还原文件以掩盖身份变化。

本次移除手写重复声明，仅保留当前配置对应的插件生成块及首尾标记。scheme 仍为 `com.local.notesclone.auth`、host 仍为 `callback`；插件原有 ChromeOS VIEW action 一并保留。块内四行尾部空白和 `<intent-filter >` 是固定生成器的原始输出，必须逐字节保留，不能经过格式化后再声称构建不改写。

[checks.json](checks.json) 记录独立验证：从已锁定版本的 deep-link build.rs 取得 renderer 原始模板，代入当前 mobile 配置；从 tauri-utils 2.10.2 提取原始 `xml_block_comment`／`insert_into_xml` 函数，用 rustc 编译临时验证程序并对当前 Manifest 执行，输出与输入逐字节一致。XML 解析另确认只有一个该 scheme 的 callback filter，host 正确。没有修改锁文件或第三方代码，也没有启动 App、ADB 或认证。

这项检查仅证明对应固定生成器的输入幂等及静态 filter 数量。新净化源码仍须执行完整 Android production 构建，检查构建后 tracked 文件、真实 APK manifest、签名、ELF 架构和内嵌身份；不把本记录替代设备回跳或同步验收。
