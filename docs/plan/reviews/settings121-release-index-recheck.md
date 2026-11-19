# settings121-release-identity RID3 最终轻量复审

日期：2026-11-19。**结论：PASS，RID3 blocking关闭；RID1/RID2已关闭的结论保留。此次未发现新的blocking。**

准确被测实现 HEAD：`db73d2d53074acaeb2637c31f6c13af0c2e29eae`。
工作树 `/Users/water/work/2026/.cybernote-worktrees/settings121-release-identity`；
开始和完成验证时HEAD相同、工作树干净。本次仅提交此文档，没有改实现、用户index或管理工作树。
前次报告：[RID1/RID2及RID3回归](settings121-release-identity-recheck.md)。
已重读agent.md、0031b581→db73d2d5实现diff、新增大index测试及build-delivery补充。

## 修复判定

`checkoutGit`（`scripts/build-info.mjs:103–110`）对完整Git输出设置**32MiB有限maxBuffer**，
支持本仓库正常全index体量；超限捕获ENOBUFS并明确报“clean state is unknown”，不返回截断数据。
`checkoutIsDirty`的NUL分隔解析、assume-unchanged/skip-worktree拒绝与GIT_OPTIONAL_LOCKS=0不变，
没有通过缩小输入为产品路径、清标记或修改index绕过问题。
新增测试明确在>1MiB输出的末尾加入hidden条目，排除“前1MiB扫描通过便算clean”的假修复。

| 检查 | 实际完成结果 |
| --- | --- |
| **实际完整checkout：sourceIdentity** | PASS；23,295 tracked entries，`git ls-files -v -z`输出**1,801,902 bytes**。sourceRevision精确等于被测HEAD，sourceDirty=false，inputCount=1157，无ENOBUFS。 |
| **实际完整checkout：createBuildInfo dev/prod** | PASS；两种模式均成功，sourceRevision/fingerprint与sourceIdentity一致且sourceDirty=false。本次HEAD无发行tag，两者releaseVersion=null符合保守策略；dev builtAt=null，prod有真实构建元数据生成时间（不声称已生成安装包）。 |
| **实际index无副作用** | PASS；上述完整入口调用前后index原bytes及mtime相同。未改索引标记。 |
| **新增>1MiB真实Git fixture** | PASS；12,000条真实形状路径；clean sourceIdentity/production/dev均成功，末尾skip-worktree隐藏修改后dirty=true且tag身份拒绝；两种状态index bytes不变。 |
| **RID1 targeted保留** | PASS；assume-unchanged、skip-worktree的sourceDirty/stamp/local+CI resolver拒绝；正常checkout、真实registered linked worktree仍能授予合法exact tag；非产品隐藏标记仍保守拒绝。 |
| **独立只读/linked探针** | PASS；正常checkout、相同bytes但stat变化、正常linked均接受；linked换行文件名hidden及非产品skip-worktree拒绝；index bytes和mtime均未变。实际assigned tree同一sourceIdentity调用由前次ENOBUFS变为成功。 |
| **32MiB上限负例** | PASS；仅用自有临时进程替代ls-files输出33MiB，其余Git查询使用真实Git；actual sourceIdentity抛明确32MiB/unknown错误，cause=ENOBUFS，不返回clean，实际index原bytes不变。未创建巨大仓库或产物。 |
| **diff/冻结检查** | PASS；git diff --check，验证结束HEAD仍db73d2d5，实现无未提交变化。 |

实际完整源码fingerprint（该HEAD）：
`54a117c68f3223f581adddedc62b4ea0da0d3daa9afeb41eccb6edf763f20ac1`。
它标识本次实际产品输入，不把输出元数据时间或后续review提交称为新安装包。

## 执行与证据

```sh
node --test --test-name-pattern='sourceDirty/stamp|conservative policy|RID3:' \
  scripts/verification/settings121-release-hidden-index.test.mjs
node /tmp/settings121-release-recheck-readonly.mjs
git diff --check
```

上述targeted选择**4/4 PASS**，约5.4秒；有意未选择两项actual Cargo测试。
另直接从实际树导入生产build-info执行sourceIdentity和createBuildInfo(dev/prod)，及单独有界输出负例。

本地结果：

- `/tmp/settings121-release-index-final-targeted.log`：4项针对性测试。
- `/tmp/settings121-release-index-final-actual.json`：实际full checkout、准确HEAD、index体量、三个入口与bytes/mtime。
- `/tmp/settings121-release-index-final-readonly.log`及`/tmp/settings121-release-recheck-readonly.json`：独立linked/只读回归。
- `/tmp/settings121-release-index-final-budget.json`：33MiB超限fail-closed结果。

## 保留范围

本次只修/复验Git输出容量与dirty扫描交叉边界，没有重跑原34项native/Cargo/stage全组、31项生成输入检查、
update helpers、Cloud、Host或浏览器UI。前次RID1的actual build.rs/stage拒绝链、RID2最小CI工具链接入结果
沿原准确SHA报告保留；db73d2d5未改这些算法或CI接线，本次没有伪称又做了一轮原生编译。

PASS仅针对发行身份模块此前报告的RID1–RID3关闭。最终组合的可信frontend→build.rs→native currentVersion、
receipt/full/core与releaseIdentityNotice真实显示仍需冻结集成版本的独立实际接通证据；Cloud/Host由其他审查者负责，
本次没有重复或改变其结论。未执行真实GitHub Actions/发布/安装包构建/安装重启或真机验收。
