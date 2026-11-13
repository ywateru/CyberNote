# Android 88b2dabe 独立静态包身份复核

2026-11-13 UTC。**APPROVE，仅限精确 debug APK 的静态身份、输入与签名。** 无构建、App 执行、安装、设备/ADB、网络、DB/grant 读取或共享 target 写入；未修改 main。DNS/TLS、真实授权与同步验收由其他实际证据回答，不由本次包审推定。

- 产品源码 `88b2dabe4bb898b0bf225e913883b43ed2cac865`，tree `c8e737ac47d0f4e33fc948177492c767314b47e0`。作者回执提交 `0fa7f1afd36976dbe9b12e3341942afad67da7b9`，父级合入 `f4322b4161b38bf8110112383df8162ab42e8633`；三者角色不同。
- APK `artifacts/account109/android-88b2dabe-debug-01/CyberNote-account109-debug.apk` 实际 77,335,388 bytes，SHA256 `2fee1cfbe27dd3b4c537c7051206831daa5c22bb9d08db50cf25f28d6e381870`。独立读取 ZIP，CRC 通过、无重复成员；五个 native 库均为 ELF64 little-endian AArch64，大小及 SHA 全部匹配作者记录。
- 直接从 APK 读取的 `libnotes_clone_lib.so` 为 154,668,536 bytes，SHA256 `46f43b3cbdaa700cad675cd26d555ba772851f529b2f49e0f27dec79553925b6`，与现存本次 Cargo 输出逐字节一致；cloudflared 与精确源 vendor 字节一致。DEX 包含原生 NotesAuthPlugin 类描述符；该检查不代替插件运行验收。
- 从实际包内 app ELF 验证 267-byte Brotli 身份载荷（ELF 文件偏移 22,767,374），解压字节与 frontend build-info 一致。解码 SHA256 `c8e401a208d10993107d1768a37a9b3865dea5e9772eac1376b7beeb8e92065f`；内容为 Android、source `88b2dabe…`、`sourceDirty=false`、1,664 inputs，fingerprint `b172d53803ba368346e717920bc05f0d1730dd64a309eb0291a17e01f64eaf0d`。这不是仅信任 sidecar 声明。

独立按精确 Git tree 与 build-info 输入规则枚举并核对 1,664 项实际产品输入：路径集合相同，每项 Git blob 字节相同，重算 fingerprint 匹配；四份 locks 均匹配精确提交和前后回执。作者 input-before/input-final 字节完全一致，作者归档 SHA256SUMS 全部通过，小型 artifact 回执与归档一致。当前作者 checkout 已 clean 推进至 `0fa7f1af…`，与构建源之间仅有 docs 变更；本审没有把当前 HEAD 误写成构建时 HEAD，也不独立声称历史每一时刻均 clean。

精确源的 Android cfg 固定 transport 为 `https://cybernote-sync.aixgg.com`，非 Android 仍用旧域，enrollment issuer 保持 `https://cybernote-sync.vercel.app`。核对了 origin 消费点和 enrollment issuer 校验点；两个常量都存在于实际 app ELF。结合源输入和包身份支持候选选择正确，但字符串存在不单独证明设备实际请求走向，未做网络探测。

独立运行现有 Android SDK 36.0.0 的 aapt2 与 apksigner，均 exit 0，输出逐字节匹配作者归档：package `com.local.notesclone.account109`、MainActivity、version 0.1.0/1000、debuggable；一名 Android Debug signer，APK v2 签名有效，证书 SHA256 `e71ec0b1b626c9e54c7b4a1517ba1c12703d86364c17100658d954a94e6bec79`。前端 build-info 的 `mode=production` 指打包资源模式，APK 仍是隔离 debug 候选，不能称为生产 release。未重复归档完整工具输出或二进制。

REA 只读 archive open 另行确认 APK 格式及同一 SHA，随后已 close；没有启动反编译构建或目标进程。完整有限结果、五库哈希、锁哈希及作者回执绑定见 [result.json](result.json)，本目录 SHA256SUMS 覆盖 README 与 result。
