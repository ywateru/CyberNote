# FIX-00 schema 补修独立验证证据

日期：2026-11-03。审查代理 verify_app。生产基准 `b5d4fb9e041ffdd51db49a8ca532cafc61bd2c9d`；执行时 HEAD `651e04d` 相对基准仅增加文档，生产源码/配置/脚本与基准无差异。全部检查由独立审查重新执行，不采用开发者日志代替结果。

结论：**pass，仅 APP-001-FIX-00 归档可靠性任务**。上轮唯一 schema blocking 已修复，未发现本轮范围内新的阻塞。原 `qa-001`、`qa-fix-00` 与开发者证据未改写。未运行GUI、未重新构建/安装Mac或Android产物；不能从本报告推导整应用、功能覆盖或像素一致通过。正式报告：`docs/plan/reviews/app-001-fix-00-02.md`。

| 文件 | 实际验证 |
|---|---|
| `frontend-schema.json`、`schema-run.txt` | 从正式 `src/editor-schema.ts` factory 生成真实 ProseMirror schema，19节点/8 marks，与Rust内嵌manifest相等；63例实际schema判断相符；原3非法归档仍被前端schema拒绝 |
| `rust-tests.txt` | 独立15 passed/0 failed/1默认ignored worker；共享63例通过公开Store导入：7合法往返，35结构拒绝，21应用属性/预算额外拒绝；全部旧事务/恢复用例保留 |
| `original-fixtures/` | 上轮3份非法输入的字节完全相同副本，源输入未修改，SHA-256见独立结果 |
| `recheck.py`、`independent-schema-result.json` | 外部独立进程对3份输入逐个拒绝并重开比较完整旧workspace/settings/全部附件字节；5组额外合法默认/marks/custom文档导入保留原JSON、导出重导入语义相等和全部附件字节相等 |
| `valid-fixtures/`、`check-valid.mjs`、`valid-schema-result.json` | 5组独立合法输入由同一个正式factory schema接受，记录其补默认值后的normalized JSON；不因默认attrs省略、marks顺序不同、空表格行而误拒绝 |
| `independent-result.json` | 独立原加强探针：合法首blob/坏第二Base64、真实晚期settings trigger失败、冲突副本/设置引用重映射、旧编辑保留，全部重开保持 |
| `crash_probe.py`、`crash-result.json` | 新编译worker实际六次exit77；五个提交前点完整恢复旧workspace/settings/files，提交后保留导入并保留旧实体/附件字节，输入归档不变，暂存清空 |
| `typecheck.txt`、`frontend-build.txt`、`clippy.txt` | 类型、生产前端构建、Rust all-targets `-D warnings`通过。前端仍有既有>500kB chunk提示，不是构建失败 |

5组独立合法样例涵盖省略heading/link/highlight/textStyle属性，省略orderedList/taskItem/codeBlock/tableCell属性，嵌套任务，空marks和不同输入顺序的非冲突marks，带marks的hardBreak，附件省略默认name/kind，drawing省略strokes及有效marker笔画、负数/小数坐标，以及实际schema允许的空tableRow。

ProseMirror本身对部分属性类型比较宽松，归档应用契约可更严格；结果明确区分 `schemaAccepted` 与 `importExpected`。没有把21组额外属性/预算拒绝误称为实际ProseMirror拒绝，也没有把正常省略默认属性判错。

语义往返比较只归一化两项有意变化：copy-on-write物理附件relativePath，以及目的工作区复用固定系统目录的createdAt；实体集合按id排序。其他元数据/正文/settings逐项相等，附件内容另外按字节比较。3份非法输入的失败保全检查不做这些归一化，完整旧快照严格相等。

## 重跑

在仓库根目录执行，所有输出留在本轮目录：

```sh
pnpm test:schema --reject-archives docs/verification/qa-fix-00-schema/original-fixtures --output docs/verification/qa-fix-00-schema/frontend-schema.json
pnpm typecheck
pnpm build
cargo test --offline --manifest-path src-tauri/Cargo.toml -- --nocapture
cargo clippy --offline --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo build --offline --manifest-path docs/verification/qa-fix-00-schema/store-probes/Cargo.toml --bin independent
python3 docs/verification/qa-fix-00-schema/recheck.py
node docs/verification/qa-fix-00-schema/check-valid.mjs
docs/verification/qa-fix-00-schema/store-probes/target/debug/independent
python3 docs/verification/qa-fix-00-schema/crash_probe.py
```

`check-valid.mjs` 使用 `pnpm test:schema` 生成的正式factory转译文件。`crash_probe.py` 记录当前Mac构建的test worker确切路径；其他平台重编译时需指向Cargo输出中的对应测试可执行文件。测试仅用合成内容/临时目录，没有用户私人备忘录。进程中断实证不等于断电或存储硬件故障已验收。
