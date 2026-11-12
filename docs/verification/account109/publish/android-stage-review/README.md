# Android staging 独立复核

结论：原三项 P2 均已关闭；以下 exact commits 的限定复核范围内无剩余 P1/P2。此目录是过程审阅证据，不加入公开源码导出清单。机器可读结果及已审文件 SHA-256 见 [checks.json](checks.json)。

| Exact commit | 独立复核结论 |
| --- | --- |
| `45b4560f0a4f3ad93c9b8aaf41f99aaa0e0b42a6` | 关闭 ELF/ABI、unsigned 两项；初次 manifest 修复仍存在改名保留 framework ID 的绕过 |
| `df7babfec42cb5b5bdc1a56d38fb043e139df296` | 关闭上述剩余 manifest parser P2；名称、namespace、framework ID 不一致或重复均拒绝 |
| `e5344b68ab36ba7e7e108102b193e41c0ad28dc5` | 仅排除保留生成目录 `src-tauri/gen/android/.kotlin`，手写平台源码仍参与身份计算 |
| `287d7153671ebff7e43733ff5f59b1c572476434` | callback filter 静态配置及固定生成器字节幂等性通过 |

原问题基线为 `ec4348c6df15c2b0dbd20af3c05f5a0cc7f75497` 的 `scripts/publish/stage-packages.py`：ABI 检查在 139–143 行只看 ZIP 目录；135 行将任意非零 apksigner 结果当 unsigned；128 行仅按 release 目录筛选，未解析实际 AndroidManifest。行号属于该基线，不用于定位修复后的文件。

## 原三项反例及关闭依据

1. **ELF/ABI。** 在纯内存 ZIP 的预期 arm64 路径放入 x86_64 ELF 头片段（`e_machine=62`）或非 ELF，原 archive 检查放行；附加当前合法 build-info 的片段也通过原独立 identity 函数。这证明身份 payload 不是架构证明。`45b4560f` 后，主库及次级库的错误架构、错误 type/header size、非 ELF、重复库 entry 均拒绝，合法 AArch64 header 正例通过。
2. **Unsigned。** 直接执行原签名判断，exit `1/2/137/-9` 均放行；真实本地 apksigner 对人为指定的不存在路径返回 exit 1 和文件不存在诊断，也满足原放行条件。不存在文件仍会被后续 ZIP 读取拒绝，此例不是完整 staging 成功。`45b4560f` 后，只有无 JAR/APK signing material 且固定工具返回确切 unsigned 诊断才接受；其他退出码、非预期 exit 1、stdout 异常、缺失或超时工具均失败关闭。保留的真实 signed debug APK 被 signing block 检查拒绝。
3. **Production manifest。** 原 archive 检查对缺失 AndroidManifest 的内存 ZIP 仍放行。`45b4560f` 增加实际复制件的 aapt2 解析，但其按文本名称识别标志，改名保留 framework ID 时仍绕过。`df7babfe` 按名称或 ID 发现受保护属性，绑定 namespace/name/ID、拒绝重复，再校验值；versionName/versionCode 同样绑定固定 ID。真正不存在 debug/testOnly 时采用 false 默认值合理。

这些头片段、内存 ZIP 和 manifest-only fixture 不宣称是可链接、可安装或可运行 APK。签名结果矩阵仅替换 subprocess 返回结果以测试判断；下面的 AXML 复验使用真实 aapt2，没有模拟其输出。

## 真实 aapt2 改名 ID 复验

从已保留的 `android-candidate-6537b74b.apk` 只读提取 compiled AndroidManifest。在临时 fixture 内重建字符串池，保持字符串索引、resource map、节点及属性 typed value，修改 package 为 production ID，修改属性文本 `debuggable` 为 `debuggablX`；重算字符串池 offset/长度和 XML 总长度。framework ID `0x0101000f`、值 true 及版本 0.1.0 不变。

固定 SDK build-tools 36.0.0 的真实命令为：

```text
aapt2 dump xmltree --file AndroidManifest.xml <temporary manifest-only.apk>
```

真实解码成功并包含：

```text
A: package="com.local.notesclone" (Raw: "com.local.notesclone")
A: http://schemas.android.com/apk/res/android:debuggablX(0x0101000f)=true
```

以 production ID 和 0.1.0 调用两个 exact commit 的 `require_android_release_manifest`：`45b4560f` 接受；`df7babfe` 拒绝，错误为 `Inconsistent Android framework attribute name or ID`。复验时未调用 staging main、未写 receipt；临时 fixture 自动清理。

## 测试与其他复核

独立确认实现及测试字节分别匹配 `df7babfe` 和 `e5344b68` 后执行：

```text
node --test scripts/publish/stage-packages.test.mjs scripts/publish/build-info.test.mjs
```

结果为 **8 passed / 0 failed**：stage 5 项、build-info 3 项。cache 测试确认指定目录内容不改变完整 sourceIdentity（含 clean/fingerprint/inputCount）；MainActivity 修改及别处 `.kotlin/policy.kt` 仍改变身份。main/public gitignore 均仅增加该精确目录。

`287d7153` 的 XML 解析确认 MainActivity 内 callback filter 恰好一份、markers 一对，scheme `com.local.notesclone.auth`、host `callback`、appLink=false；launcher 和 ChromeOS VIEW action 保留。生成块逐字节匹配锁定 deep-link 2.6.3 模板，包括 `<intent-filter >` 和四行空白。registry renderer/updater 源码 SHA 与原幂等证据一致；独立移植并重算已审 tauri-utils 2.10.2 插入算法两轮，结果均与 committed XML 字节相同。原作者的 Rust 编译验证是原证据，本独立复核没有重新编译 Rust。

接受边界止于发布工具、解析规则、缓存身份范围及生成配置。没有重建大包、安装、运行 App、访问用户库、ADB/UI、登录、远端、发布或部署。最终新 root 的实际 Android 包仍待独立审计；本记录不追溯更新旧 root 或旧产物的验证结论。
