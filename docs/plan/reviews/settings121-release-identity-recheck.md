# settings121-release-identity 修复复审

2026-11-19。**BLOCKED：原 RID1 漏洞已关闭、RID2 已接入，但新增 RID3（P2 blocking）使真实仓库构建身份入口失败。**

准确被测实现 HEAD：`0031b581cf3164fcf2c57dbfe5ea84851c842deb`。
工作树 `/Users/water/work/2026/.cybernote-worktrees/settings121-release-identity`。
验证前干净；本次仅提交此 review，不改实现。已重新读取 agent.md、修复diff、build-delivery契约和新增hidden-index测试。
原审查见 [settings121-release-identity](settings121-release-identity.md)，原被测实现为13ef2986。

## 结论与代码位置

| ID | 等级 | 判定 | 位置 / 结果 |
| --- | --- | --- | --- |
| RID1 | P2 | 原blocking已关闭 | `scripts/build-info.mjs:59,105–114,154`：sourceIdentity与resolver共用保守index检查，拒绝assume-unchanged/skip-worktree，不清用户标记。相关source/stamp/native/stage边界负例通过。 |
| RID2 | P3 | 原nonblocking已处理 | `.github/workflows/packages.yml:33`：checks先安装Rust1.97.1，无额外target；随后运行build-info、identity、hidden-index测试，均为隔离轻fixture，无Tauri构建。 |
| RID3 | P2 | **blocking，新回归** | `scripts/build-info.mjs:103,111`：新增全index输出超过Node默认maxBuffer，真实仓库sourceIdentity/createBuildInfo报ENOBUFS，正常开发/打包入口不可用。 |

### RID3 — 小fixture通过，但完整仓库的Git输出超过缓冲上限

新 `checkoutIsDirty` 用 `checkoutGit(root, ['ls-files','-v','-z'])` 读取整个index。
`checkoutGit` 的execFileSync未指定maxBuffer，因此使用Node默认1,048,576 bytes。
固定HEAD实际仓库共有 **23,294** 个tracked条目，命令stdout为 **1,801,842 bytes**。
这不是恶意或极端测试输入，而是本任务冻结checkout的正常index。

在本树实际调用（不修改index、不生成frontend、不运行native）得到：

```text
sourceIdentity(undefined, {metadataPath:null}) -> ENOBUFS
createBuildInfo({development:true, stampPath:undefined}) -> ENOBUFS
spawnargs: git ls-files -v -z
```

`createBuildInfo`会先运行sourceIdentity，因此即使开发构建releaseVersion应为null也会失败；
Vite配置使用同一函数，生产构建/实际build.rs同样依赖这个入口。无需跑重型native即可在最早稳定边界证明回归。
29+5项小型临时Git测试没有覆盖真实index体量，所以全部通过并不能关闭此阻塞。

修复要求：让index扫描支持实际完整仓库的输出，同时保留合理资源界限、NUL安全解析、
GIT_OPTIONAL_LOCKS=0及隐藏标记拒绝；不要截断、吞ENOBUFS返回clean、排除非产品条目或清index标记。
新增超过1MiB真实形状index输出回归，并在干净实际checkout调用sourceIdentity/createBuildInfo作轻量验收。
此建议交实现者，本次不修改实现。

证据：

- `/tmp/settings121-release-recheck-index-size.json`：实际条目数及输出bytes。
- `/tmp/settings121-release-recheck-actual.json`：准确HEAD、两个入口失败及index字节未变。
- `/tmp/settings121-release-recheck-readonly.mjs` 与 `.json`：独立正常/linked/index不变探针。

## 实际完成检查

| 检查 | 完成结果与边界 |
| --- | --- |
| 新hidden-index文件单独执行 | **5/5 PASS**；日志 `/tmp/settings121-release-recheck-hidden.log`。 |
| 原identity/build-info/package-identity/policy/stage文件 | **29/29 PASS**；日志 `/tmp/settings121-release-recheck-original.log`。与新增5项合计34项，各只执行一次，顺序运行。 |
| sourceIdentity/stamp/local+CI | 两种标记即使字节未变也判dirty、旧clean stamp失效；修改后fingerprint真实变化；fresh stamp仍dirty；开发/branch未知身份不冒称tag；normal clean tag通过。 |
| 实际build.rs/Cargo与stage | 新5项包含两种标记的实际isolated Cargo release；故意伪造匹配新字节但声称clean的frontend后，build.rs拒绝；Node stage identity CLI及Python release_identity也拒绝。正常consumer输出preview.2。唯一stub是无操作tauri_build，不替换身份算法。 |
| 独立只读/linked探针 | 正常checkout、内容相同但stat变化、正常registered linked worktree均接受，index原bytes及mtime相等；linked内带换行文件名的assume-unchanged、非产品skip-worktree均拒绝且index不变。另实际assigned tree入口因RID3失败，index原bytes仍不变。 |
| CI检查配置 | 代码核对PASS：Rust工具链step位于测试前，版本1.97.1，无附加target；fixture只有std consumer及本地tauri-build stub，Cargo offline/locked，不依赖Tauri或项目Cargo大构建。当前本机rustc/cargo均1.97.1。未运行真实GitHub Ubuntu job，不写作远端CI PASS。 |
| git diff检查 | PASS；未修改实现。 |

具体执行：

```sh
node --test scripts/verification/settings121-release-hidden-index.test.mjs
node --test scripts/verification/settings121-release-identity.test.mjs \
  scripts/publish/build-info.test.mjs scripts/publish/package-identity.test.mjs \
  scripts/publish/policy.test.mjs scripts/publish/stage-packages.test.mjs
node /tmp/settings121-release-recheck-readonly.mjs
git diff --check
```

修复范围没有改变productFiles排除规则，按用户要求**未重跑31项生成路径检查**。
未重复跨模块updater comparator、前端UI、原生大构建、安装/发布；update fix复审尚未开始。
原报告的native full identity消费者、receipt full/core、releaseIdentityNotice最终UI渲染仍属整合条件，
不因本次小fixture通过就宣布完整D5交付。

请修RID3并冻结新SHA后复验实际仓库入口及新增大index回归；RID1/RID2本次结果可保留，
按后续变动选择必要回归，不盲目重复全套。
