# Canonical native build manifest

本次仅修复输入枚举和证据：没有重编、修改或替换 native binary/embedded dist，没有运行新的业务 suite。原 `native-build.json` 原字节保留，包含生成文件的枚举缺陷也保留为历史记录；不覆盖此前失败或将其改成通过。

新记录为 [canonical-native-build.json](canonical-native-build.json)，schema 2。生成器为 `scripts/verification/sync108-canonical-build-record.mjs`，直接调用 `scripts/build-info.mjs` 导出的 `productFiles(root)` / `sourceIdentity(root)`：

- 当前 **450 个产品输入**。不依赖 Git 是否意外 track 生成文件；旧 sourceFiles 中的 **168 个** plugin Android `build` / `.tauri` 生成输入不再进入产品清单。public、原生源、锁文件、配置等由现有 canonical 产品枚举决定，没有再维护一份不同的产品路径列表。
- 产品 fingerprint 沿用 `sourceIdentity()` 的路径/NUL/字节长度/NUL/文件原字节 framing，值为 `310f285a758fe5d0e79a030776c02657599b55f35e9b51db873ebcaa38784024`，不是原 Git 路径列表 JSON 的哈希。
- `nativeTools` 单列 manifest 生成器、build-info 枚举器、Node driver/suite 和 Rust test driver 的文件 SHA256。工具身份与产品身份分别列出；Rust test driver 也会出现在统一产品枚举中，不因此声称默认构建启用了它。
- 对当前 450 个产品文件逐一核对 Git blob，全部与实际 binary 源提交 `7a64e3b14f5c970038d1817717c35a5bb90702e7` 的内容一致。`product.identity.sourceRevision/sourceDirty` 是**证据生成时** Git 状态元数据；binary 的源码提交另列于 `build.sourceCommit`，不混称为新构建。

## Binary 与 embedded frontend 身份

现有 feature binary `/private/tmp/cybernote-sync108-target/debug/notes-clone` 的 SHA256 仍为：

`11b2f4041b77cce3c83a81ac7f03f28ebc7e3e6dcf8feccda077f8fe29f147d4`

现有静态 dist 文件集 SHA256 仍为 `ac755157f95eebd047f0f2830c0877abcecb72780f5f1ec5036d77be4fa82dc6`。每个 dist 文件和实际 `dist/build-info.json` 内容均保留于新 manifest；沿用此前构建记录及实际 `tauri://localhost` / interactive Ready 握手的嵌入来源证据，没有宣称本次重新从 binary 提取或重编这些资产。

前端是 `NODE_ENV=development VITE_NOTES_DEBUG=1 pnpm build` 的测试静态资产；其中 build-info 的 `mode=production` 描述 Vite 的 **build command**（vite.config 用 command=serve 判 development），不表示前端 debug API 被排除。其 `sourceRevision=5500c94a...`、`sourceFingerprint=53ed0553f9c4031150920a3e8fb3305f04ef63c3becbbfd3229c99ddb51c8789` 记录较早的前端构建，随后仅重编 Rust Ready 修复并复用 dist。因此该前端源码 fingerprint 与当前产品 fingerprint 不同是有记录的阶段差异，不将二者写成同一次源码身份。

只读 binary 标记检查确认：feature binary 包含 `@@SYNC108_NATIVE@@` / `sync108-stdin`；保留的普通 debug `.app` 不包含这些标记。普通 `.app` SHA256 另列。三重 compile cfg 和 `NOTES_SYNC_E2E=1` 来自既有源码/构建记录。本次没有执行 release build，标记检查不扩张成独立 release 默认排除测试的证明。

## 复跑和 verifier 边界

生成器拒绝覆盖输出文件，且要求现有 binary/dist 与历史记录一致、当前产品文件与 recorded binary source commit 一致：

```sh
node scripts/verification/sync108-canonical-build-record.mjs \
  --root /private/tmp/cybernote-sync108 \
  --binary /private/tmp/cybernote-sync108-target/debug/notes-clone \
  --historical-record /private/tmp/cybernote-sync108/docs/verification/sync108/native-build.json \
  --out /private/tmp/sync108-canonical-build-FRESH.json
```

旧 runner 的 `--build-record` 比较仍使用 `git ls-files` + JSON 哈希，不能把 schema 2 新记录直接交给旧比较函数。后续 verifier 应比较 `sourceIdentity(root).sourceFingerprint`、binary/dist SHA256，并单独核对 `nativeTools`；新记录显式写出该兼容性边界。按本次“只修 manifest 生成”的范围，没有改 suite/driver 或新增业务测试逻辑。

本轮检查：Node 语法检查和真实 manifest 生成通过；450 项 commit 内容核对通过；新 product 清单无上述生成目录；历史 manifest 字节 SHA 与迁移前一致，binary/dist SHA 与旧记录一致。

## Owned startup cache 清理

[canonical-cache-cleanup.json](canonical-cache-cleanup.json) 仅核对本任务已有 startup/handshake 记录能够归属的 6 个确切缓存桶：全部此前已清理，无额外目录删除。其他测试的缓存桶未枚举、未删除。现有 feature binary、普通 `.app` binary 和 Rust unit-test binary 的清理前后 SHA256 一致；没有删除 target/test binary，也没有操作 Android 用户库。
