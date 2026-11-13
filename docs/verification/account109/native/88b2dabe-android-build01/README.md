# Exact 88b2dabe Android debug candidate

2026-11-13。作者构建与静态包身份检查通过；不表示安装、DNS/TLS、登录或手机数据同步验收通过。

- 精确源码：`88b2dabe4bb898b0bf225e913883b43ed2cac865`，tree `c8e737ac47d0f4e33fc948177492c767314b47e0`。复用既有cone sparse作者树，无新工作树或target。完整Git tree对照1,664项产品输入零缺失/变更，前后fingerprint `b172d53803ba368346e717920bc05f0d1730dd64a309eb0291a17e01f64eaf0d`一致，四份locks与提交及旧72513成功构建相同。
- APK：`artifacts/account109/android-88b2dabe-debug-01/CyberNote-account109-debug.apk`，77,335,388 bytes，SHA-256 `2fee1cfbe27dd3b4c537c7051206831daa5c22bb9d08db50cf25f28d6e381870`。包名`com.local.notesclone.account109`、MainActivity、debuggable及现有Android Debug签名已检查；是隔离debug候选，不是生产release。
- 原命令来自已提交prepareCandidate：`node scripts/android.mjs build --debug --target aarch64 --apk --ci`。Cargo/Gradle强制offline，Java17/NDK27.2.12479018，jobs2/debug0/incremental0；无依赖安装、下载或HOME override。实际argv与四锁前后核对归档，不声称Android CLI额外传入了--locked。
- 本次首次编译自然exit0/signal=null，无构建失败。预检确认Tauri缓存仍指向72513旧checkout、当前TauriActivity缺失后，归档并仅删除确切16-byte run-build-script fingerprint；没有clean包/整target、改官方脚本或复制旧生成文件。官方脚本重跑，1382-byte结果与固定2.12.5模板替换结果逐字节一致。旧72513首失败原日志/回执继续原样保留；本次cache-recovery.json描述预检恢复，不能误称为本次编译失败。
- 五个APK native库均ELF64/AArch64；包内app库与本次Cargo输出逐字节一致，cloudflared与固定vendor相同。真实app ELF内Brotli build-info匹配当前Android身份；native auth插件在DEX，新transport与旧enrollment issuer常量均在app库。字符串存在不单独证明运行时路由；未执行设备网络检查。
- 一秒磁盘监督最低21,418,733,568 bytes（约19.95GiB），始终高于10GiB线。所有owned build-group进程已退出，共享target已释放。完整日志、APK和前端dist仅留独立artifact目录；本归档只含小型回执/验证器及hash，不重复二进制或大日志。

父级正在处理正式域名配置及独立匿名验证；本次不确认新域已可用。没有App、ADB、安装、手机/原库/账户grant操作或旧候选覆盖；没有声称独立包审已通过。`SHA256SUMS`覆盖本归档除自身以外的文件。
