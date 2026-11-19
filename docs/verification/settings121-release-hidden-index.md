# RID1 / RID2 开发修复验证

日期：2026-11-19。工作树：`settings121-release-identity`；修复基线为独立
review 提交 `d912ef63`，原实现为 `13ef2986`。最终冻结 SHA 由开发交付消息
报告。本文件是开发自测回执，不修改或替代 Confucius 的独立审查结论。

根因与最终 clean/index 策略归
[构建交付契约](../architecture/build-delivery.md#包内发行身份settings121--d5)
拥有。实现只改共享 `scripts/build-info.mjs` clean 判定；前端、stamp、
actual build.rs 和 stage 继续使用原单一 resolver，不另写 Rust/Python
身份算法。无用户 index 修复、reset 或标记清理。

## 针对性检查

```sh
node --test --test-reporter=spec \
  scripts/verification/settings121-release-hidden-index.test.mjs \
  scripts/verification/settings121-release-identity.test.mjs \
  scripts/publish/build-info.test.mjs \
  scripts/publish/package-identity.test.mjs \
  scripts/publish/policy.test.mjs \
  scripts/publish/stage-packages.test.mjs
node scripts/check-build-identity-generated101.mjs --expect-fixed
pnpm typecheck
pnpm version:check
git diff --check
```

上述检查已完成：组合 Node suite **34/34 pass**（含新增 5 项），生成输入
检查 **31 checks pass**，typecheck、version:check 和 diff check 均通过。
没有未解决的本轮测试失败。远程 workflow 尚未运行，不能把本地通过当成
GitHub Actions 的成功回执。

## RID3 大 index 追补

独立复审 `6ba2d9f3` 指出真实仓库 `ls-files -v -z` 超过 Node 默认
1 MiB 缓冲。查询现改为显式 32 MiB 有界输出，ENOBUFS 返回明确 unknown
错误，不截断或吞错；NUL 解析和只读 index 策略不变。新增真实临时 Git
fixture，提交 12,000 条接近保留依赖目录形状的长路径，保证输出 >1 MiB；
验证正常源码/开发/发行入口通过，末尾路径设置 skip-worktree 并修改后
仍被识别为 dirty，前后 index 字节保持不变。无需改 build.rs、CI 或接口。
干净实际 checkout 的 sourceIdentity/createBuildInfo 开发入口另在提交后
轻量核验，结果随最终冻结 SHA 报告；不构建真实 App。

新增独立测试共 5 项，用真实临时 Git checkout/index 执行以下边界：

- 对 `src/main.ts` 分别设置 `--assume-unchanged` / `--skip-worktree`，
  修改实际产品内容，确认普通 `git status` 仍为空。source fingerprint
  随字节改变，而共享 sourceDirty 为 true；local/CI exact tag 都拒绝。
- 尚未修改字节但已设置标记时也拒绝 clean/tag，旧 clean stamp 立即失效。
  重新生成 stamp 保持 dirty，development/branch 身份为 null。
- 模拟原漏洞：从新字节生成匹配 fingerprint，再伪造前端 metadata 的
  clean/tag 声明。实际 `src-tauri/build.rs` 在成功构建后再次 Cargo
  release 编译拒绝，不能因存在旧成功 binary 或缓存而宣称本次成功。
- 实际 Node `--validate-release-build-info`（stage 调用的 CLI）和实际
  Python `stage-packages.py::release_identity` 均拒绝该伪造前端。
- 对验证前后的 index 直接比较原始字节，证明没有清除标记或重建 index。
  额外覆盖非产品标记、组合标记、正常 checkout 和独立干净 linked
  worktree；linked worktree 自己的隐藏修改同样拒绝。

本地环境为 Node 22.16.0、rustc/cargo 1.97.1。Cargo fixture 只有本地
`tauri-build` 的无操作 build 函数和一个 consumer，实际项目 build.rs /
Node resolver 原文参与执行，无 registry crate、Tauri assets、sidecar、
Android 或原生 App 编译。所有被修改 Git/index 都位于测试临时目录。

组合命令包含原身份、stamp、嵌入字节、包策略和发布 staging 边界，
不将合成 native bytes 或 Python identity helper 当成完整真实包 staging。
生成输入检查继续覆盖本轮共享 clean 变化没有把构建输出变成产品输入。

## CI 接线（RID2）

Ubuntu checks job 现显式安装 1.97.1 Rust（无交叉 target），随后将
`scripts/publish/build-info.test.mjs`、原 identity regression 和新增 hidden
index regression 纳入既有 Node 测试列表。不得依赖 runner 默认预装 Rust，
也不在 checks 内构建 Tauri 或安装 native build dependencies。独立小型
Cargo fixture 仅使用本地 path dependency、offline/locked 模式。

本轮未触发远程 GitHub Actions、创建 tag、推送、发布、真实安装包 staging
或设备检查。workflow 修改完成本地人工核对，远程 checks 是否运行成功须
由后续 CI run 提供证据。本回执不声称 RID1/RID2 已获独立复审通过。
