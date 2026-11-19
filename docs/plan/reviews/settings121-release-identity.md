# settings121-release-identity 独立审查

日期：2026-11-19。**结论：BLOCKED，RID1 为 P2 blocking；未发现 P1。**

准确被测 HEAD：`13ef29868bc358641d1f7772086ddc63c61de270`，包含
`b2d1b29d` 与 `13ef2986` 两次实现提交。工作目录：
`/Users/water/work/2026/.cybernote-worktrees/settings121-release-identity`。
验证前工作树干净，审查期间未修改实现，最终仅提交本 review。审查者未参与本模块开发。

已读本树 `agent.md`、新增的 `docs/architecture/build-delivery.md` D5 契约，以及主目录
只读的 settings121 更新/构建/验证要求；追踪 Vite → build-info → build.rs → native env，
stage → package-identity → receipt 路径。以下代码位置均针对被测 HEAD。
没有修改冻结 update 工作树；跨模块比较仅运行作者脚本读取 Git object 中的冻结 comparator。

## 发现

| ID | 等级 | 判定 | 代码位置 | 摘要 |
| --- | --- | --- | --- | --- |
| RID1 | P2 | blocking | `scripts/build-info.mjs:59,97,141,161` | clean/tag 身份信任 Git status，受 assume-unchanged/skip-worktree 隐藏修改影响；不同于 tag 的产品字节仍获已验证发行身份，实际 build.rs 及 staging identity CLI 同样接受。 |
| RID2 | P3 | non-blocking | `.github/workflows/packages.yml:29` 的 checks 列表 | 新增身份回归文件尚未加入现有 CI checks；此次人工执行通过，但后续 CI 不自动执行这些 D5/真实 build.rs fixture。建议整合时加入适合 runner 的针对性检查。 |

### RID1 — 隐藏的工作区修改仍授予 exact tag 身份

设计要求：发行身份只能来自匹配 HEAD 的规范 tag，dirty 必须拒绝；source/build stamp
不能把其他产品字节标成这个发行版。新 resolver 清除继承的 `GIT_*` 环境是正确的，
但这不会清除 Git index 中每个文件的 `assume-unchanged` / `skip-worktree` 标记。
`git status --porcelain --untracked-files=normal` 会跳过相应已跟踪文件；`sourceIdentity`
虽按真实字节重新算 fingerprint，却仍据相同 status 声称 `sourceDirty=false`。
代码没有把这些字节同 tag/HEAD 的 blob 比较，也不拒绝这些索引隐藏标记。

独立临时 Git fixture 的实际结果：

1. 建立干净产品 `0.1.0` 与 exact tag `v0.1.0-preview.2`；保存原 fingerprint。
2. 对已跟踪 `src/main.ts` 设置 `git update-index --assume-unchanged`，改其内容。
   调用实际 `createBuildInfo()`：fingerprint 已改变、`git status` 输出为空，
   却返回 `releaseVersion="0.1.0-preview.2"`、`sourceDirty=false`。
3. 对同样产品文件使用 `--skip-worktree` 后修改，从这些字节重新生成前端 build-info。
   执行**实际 src-tauri/build.rs** 的 isolated Cargo release build（唯一 stub 为无操作
   `tauri_build::build`，不替换解析器/算法）：exit 0，编译 consumer 输出
   `0.1.0-preview.2`。因此不是仅某个测试 API 的显示问题。
4. 同 fixture 调用实际 `--validate-release-build-info` CLI：exit 0，返回同一完整
   releaseVersion。stage 的身份复核复用该入口，无法发现它。没有执行完整打包或真实发布。

这不意味着远端 feed/签名被攻破，也不声称标准全新 GitHub checkout 默认存在这些标记；
问题是承诺支持的本地 exact-tag 构建及“dirty reject”信任边界可实际失效。
旧 stamp 若仍绑定修改前 fingerprint 会正确拒绝，但从隐藏修改后的字节 prepare/build，
其 stamp、frontend 和 native 可相互一致而仍误认自己属于原 tag。因此跨阶段一致性并不能
替代对 tag 源码字节的可信绑定。

修复要求：已知 tag 身份路径应拒绝不能证明 clean 的索引状态，或独立验证实际 tracked
输入与 tag/HEAD（包含必要模式/路径）一致，不依赖会忽略这些标记的普通 status。
不要为审查而修改用户 index 标记，也不要自动 reset 工作区。共享 sourceDirty 判定应一致；
对未知/开发构建可以保守表示 unknown/dirty，不能继续给出“已验证 clean tag”。
新增 assume-unchanged 与 skip-worktree 正反回归，覆盖 createBuildInfo、stamp、实际 build.rs
及 stage identity CLI；未修改的正常 checkout/合法 linked worktree 保持通过。

证据：

- `/tmp/settings121-release-independent.mjs`：仅临时目录内创建/变更 fixture Git/index。
- `/tmp/settings121-release-independent/results.json`、`probe.log`。
- probe 名称：`modified product marked assume-unchanged`、
  `modified skip-worktree product plus matching frontend accepted by build.rs`、
  `staging identity CLI accepts same hidden modified product`。

作者冻结实现未改；RID1 交 Faraday 修复后以新固定 SHA 复验。

## 已完成检查

| 检查 | 结果 | 证明边界 |
| --- | --- | --- |
| `node --test scripts/verification/settings121-release-identity.test.mjs scripts/publish/build-info.test.mjs scripts/publish/package-identity.test.mjs scripts/publish/policy.test.mjs scripts/publish/stage-packages.test.mjs` | PASS，29/29 | 临时 Git/linked worktree、CI/local/annotated/branch/PR/invalid/mismatch/ambiguity/dirty、source stamp、product inputs、receipt、native嵌入字节；含真实 build.rs 的 rustc 与 isolated Cargo fixtures。没有 Tauri/native 全构建。 |
| `node scripts/verification/settings121-release-updater-proof.mjs` | PASS，3 种 current identity | 冻结 `cfde38103f71d0dd1fdf3e60a5c720a63abb2461` 的实际 Version comparator；preview.2→preview.3 为true，stable/unknown core→同core preview.3为false。consumer 使用拟整合 helper，不代表冻结 updater 已接 full identity。 |
| `node scripts/check-build-identity-generated101.mjs --expect-fixed` | PASS，31 checks | 工具生成路径排除、手写相邻输入变化使 stamp 失效，未运行 Android 生成/构建。 |
| `pnpm typecheck`、`pnpm version:check`、`git diff --check` | PASS | 类型/产品core一致；不代表实际发行身份已在 App 渲染或 updater 消费。 |
| 独立 `node --input-type=module -e`、`node --input-type=module -` import | PASS | 新 main-entry guard 不把 eval/stdin 的缺失/伪入口当脚本路径 realpath，导入不误执行 CLI；作者测试也覆盖stdin。 |
| 独立 actual build.rs/Cargo dirty复验 | PASS，普通dirty被拒绝 | 先连续成功release构建，再仅改非产品README、不改 dist，后续Cargo exit101，直接resolver也拒绝；未复现缓存绕过，不列为缺陷。旧的成功binary仍存在不等于这次构建成功。 |
| 独立 actual build.rs/Cargo hidden-index probe | RID1 REPRO | 修改产品skip-worktree字节后重建匹配frontend，release编译仍授予原tag身份。未运行重型native。 |
| 实际 `src/build-info.ts` transpile unit probes | PASS，4 variants | dev fallback/legacy缺字段/null均导出保守notice；已知tag导出null。只stub packageInfo与编译常量输入，没有替换notice表达式。尚未证明真实UI显示。 |

日志与证据：

- `/tmp/settings121-release-identity-review-tests.log`：29 tests，0 failures。
- `/tmp/settings121-release-generated-review.log`：31 checks。
- `artifacts/build-identity101/result.json`：生成输入检查结果（忽略的测试产物，未提交）。
- `/tmp/settings121-release-independent/results.json`、`probe.log`、`frontend-notice.json`。

## 已核对的设计与代码

### tag / source / stamp

- stable core 仍来自 package.json，`assertVersions` 对 Tauri、Cargo、Cargo.lock 一致性检查。
  tag只补 full release identity，不改变包core；不从时间、stamp、文件名或feed推导tag。
- CI tag要求规范 v前缀、core一致、存在的tag peel到HEAD，存在GITHUB_SHA时匹配；explicit
  CI tag可消除同commit多个tag的歧义。当前workflow按GitHub内置ref上下文执行，不需用户传tag。
  branch/PR返回null；缺失/非法CI上下文拒绝；本地仅exact tags，不用祖先describe。
- numeric prerelease前导零、空字段/空后缀、空白、+build metadata和错core均拒绝。
  annotated tag接受。linked worktree检查真实root和Git-owned reciprocal pointer，借用.git及
  symlink根拒绝；Git环境重定向被清理。RID1是尚缺的index状态边界。
- 已有stamp验证sourceRevision/fingerprint/dirty/count；stamp中自加releaseVersion不会成为
  身份来源。无.git archive即使有trusted source metadata也不授予tag，声称CI tag时拒绝。

### 同一前端元数据 → Rust env

- Vite的`createBuildInfo`对象同时用于JS注入与dist/build-info.json。Rust build.rs在实际
  manifest父目录执行同一Node脚本；release读取生产frontend metadata，比较tag、core、schema、
  builtAt及sourceRevision/fingerprint/dirty/inputCount。旧frontend遇到tag切换时拒绝；
  重新生成后native编译身份更新，由真实isolated Cargo fixture完成验证。
- 编译期`CYBERNOTE_RELEASE_VERSION`来自验证后的同一个info，非外部同名env；未知时显式输出
  空串覆盖ambient伪值。非release profile不授予tag。build.rs拒绝失败退出和异常directive类型。
- Cargo声明source files、dist metadata、HEAD/index/refs/packed-refs与CI/env重跑输入。
  这里的轻量fixture替换了tauri_build无操作函数，未证明最终Tauri assets或真实安装包身份。

### 产品输入与 staging receipt

- 新实现输入`src/build-info.ts`、`src-tauri/build.rs`、`scripts/build-info.mjs`已在原productFiles
  根内；此次显式新增`scripts/publish/stage-packages.py`。变更这些输入使旧fingerprint/stamp失效，
  新tests有覆盖。dist/build-info与验证日志/产物仍排除，避免自引用。
- stage创建输出前以及native package proof后都执行同一identity CLI，receipt顶层
  `releaseVersion`与已核验的`buildInfo.releaseVersion`一致，原native SHA/平台/实际包入口/
  notices链保留。核心版本仍用于包形状/manifest/plist；full preview用于发布排序与候选tag匹配。
- package-identity原模块检查实际入口含raw/Brotli metadata bytes，且当前source与其一致。
  此次29tests的嵌入验证是合成native字节，不得描述为已构建和验证真实Mac/APK包。
  RID1会同时影响该source dirty结论，已作为一个共同根因报告，不重复列多项。
- 此身份是受检Git来源声明，不是项目独立签名清单、Developer ID、公证、Android签名或
  已验证远端发布的证据；本次未创建tag、推送或发布。

## 明确的整合条件（不因未接线单独阻塞本构建身份模块）

1. **D5消费者仍待接通。** 本树不含更新模块实现变更；整合必须提供native唯一current-version
   helper：`option_env!("CYBERNOTE_RELEASE_VERSION").filter(|v| !v.is_empty()).unwrap_or(env!("CARGO_PKG_VERSION"))`。
   除SoftwareUpdater.new/status/feed/download外，mac staging的候选新旧比较也要用full identity；
   running plist/core与receipt.buildInfo.version继续按core核验。不能只改DTO而安装预检仍用Cargo core。
2. receipt顶层releaseVersion及buildInfo.releaseVersion若存在，要同实际候选GitHub full tag匹配；
   缺失字段按旧包策略处理，不能用当前feed最新tag给旧包补身份。本次冻结updater尚不验证新增字段，
   不把比较器probe当已接通整个receipt/安装路径。
3. **releaseIdentityNotice尚未渲染。** `rg`在被测src只找到export，无Preferences/更新UI消费者。
   当前只证明正确导出。Pasteur/Mill整合时须在版本/更新区显示`releaseVersion ?? version`，
   且legacy/null展示notice；已知tag不显示unknown提示。需真实React最终宿主检查，不能把unit输出
   当成用户已能看到。该点在build-delivery契约已明确交整合，非本范围实施遗漏的新blocking。
4. 旧preview包只有Cargo0.1.0时保守拒绝同core preview升级是已声明限制，不可自动伪造旧tag；
   用户显式装具备身份的新包或递增core。新preview.2→preview.3、preview→stable、stable拒绝同core
   preview须在最终native完整链复验。当前unsigned APK仍只下载不安装；未来同core preview的Android
   versionCode/兼容签名策略未由此任务解决。
5. 最终组合的准确SHA再做已有针对性检查和包内入口证据；此次仅轻fixture，未运行重型native、
   真实GitHub Actions、实际包staging/安装/重启或设备验收。不需为这次review重新发布任何资产。

实现保持冻结；RID1修复后按新的固定SHA重测其负例及现有targeted checks。
本review的BLOCKED仅针对构建身份，未改变update U1–U5审查结论，未开始其fix复审或恢复UI开发。
